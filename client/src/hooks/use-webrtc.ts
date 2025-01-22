import { useState, useRef, useEffect, useCallback } from 'react';
import { useSocket } from './use-socket';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

interface PeerConnection {
  connection: RTCPeerConnection;
  stream: MediaStream | null;
}

export function useWebRTC(userId: number) {
  const socket = useSocket();
  const [isCallActive, setIsCallActive] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const peerConnections = useRef<Map<number, PeerConnection>>(new Map());
  const currentCallId = useRef<number | null>(null);
  const connectionRetries = useRef(0);
  const maxRetries = 3;

  const createPeerConnection = useCallback(async (peerId: number) => {
    if (!socket) {
      setError('Socket connection not available');
      return null;
    }

    try {
      console.log('Creating peer connection for:', peerId);
      const pc = new RTCPeerConnection(configuration);

      if (localStream) {
        localStream.getTracks().forEach(track => {
          if (localStream) {
            pc.addTrack(track, localStream);
          }
        });
      }

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        setRemoteStreams(prev => new Map(prev).set(peerId, stream));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && activeRoomId) {
          socket.emit('signal', {
            to: peerId,
            signal: { type: 'candidate', candidate: event.candidate },
            roomId: activeRoomId
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State with peer ${peerId}:`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          if (connectionRetries.current < maxRetries) {
            console.log('Retrying connection...');
            connectionRetries.current++;
            pc.restartIce();
          } else {
            setError('Connection failed after multiple attempts. Please try again.');
            leaveRoom();
          }
        } else if (pc.iceConnectionState === 'connected') {
          connectionRetries.current = 0;
        }
      };

      peerConnections.current.set(peerId, { connection: pc, stream: null });
      return pc;
    } catch (err) {
      console.error('Error creating peer connection:', err);
      setError('Failed to create peer connection');
      return null;
    }
  }, [socket, localStream, activeRoomId]);

  const setupLocalStream = async () => {
    try {
      setIsInitializing(true);
      console.log('Setting up local stream...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true 
      });
      setLocalStream(stream);
      setIsInitializing(false);
      return stream;
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Could not access camera or microphone. Please ensure they are connected and permissions are granted.');
      setIsInitializing(false);
      return null;
    }
  };

  const createRoom = async (name: string) => {
    if (!socket) {
      setError('Socket connection not available');
      return;
    }

    try {
      await setupLocalStream();
      socket.emit('room:create', { name });
    } catch (err) {
      setError('Failed to create room');
    }
  };

  const joinRoom = async (roomId: number) => {
    if (!socket) {
      setError('Socket connection not available');
      return;
    }

    try {
      const stream = await setupLocalStream();
      if (!stream) return;

      setActiveRoomId(roomId);
      setIsCallActive(true);
      socket.emit('room:join', { roomId });
    } catch (err) {
      setError('Failed to join room');
    }
  };

  const leaveRoom = () => {
    if (!socket || !activeRoomId) return;

    socket.emit('room:leave', { roomId: activeRoomId });
    if (currentCallId.current) {
      socket.emit('call:end', { 
        callId: currentCallId.current,
        roomId: activeRoomId 
      });
    }

    // Cleanup
    peerConnections.current.forEach(({ connection }) => connection.close());
    peerConnections.current.clear();
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStreams(new Map());
    setIsCallActive(false);
    setActiveRoomId(null);
    currentCallId.current = null;
    setError(null);
    connectionRetries.current = 0;
  };

  useEffect(() => {
    if (!socket) {
      setIsCallActive(false);
      setError('Socket connection not available');
      return;
    }

    socket.on('room:created', (room) => {
      console.log('Room created:', room);
      setActiveRoomId(room.id);
      joinRoom(room.id);
    });

    socket.on('user:joined', async ({ userId: peerId }) => {
      console.log('User joined:', peerId);
      const pc = await createPeerConnection(peerId);
      if (!pc) return;

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('signal', {
          to: peerId,
          signal: { type: 'offer', sdp: offer },
          roomId: activeRoomId
        });
      } catch (err) {
        console.error('Error creating offer:', err);
        setError('Failed to create call offer');
      }
    });

    socket.on('user:left', ({ userId: peerId }) => {
      console.log('User left:', peerId);
      const peer = peerConnections.current.get(peerId);
      if (peer) {
        peer.connection.close();
        peerConnections.current.delete(peerId);
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
      }
    });

    socket.on('signal', async ({ from: peerId, signal }) => {
      console.log('Received signal from:', peerId, signal.type);
      let pc = peerConnections.current.get(peerId)?.connection;

      if (!pc) {
        pc = await createPeerConnection(peerId);
        if (!pc) return;
      }

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('signal', {
            to: peerId,
            signal: { type: 'answer', sdp: answer },
            roomId: activeRoomId
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'candidate' && signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('Error handling signal:', err);
        setError('Failed to establish connection');
      }
    });

    socket.on('call:started', ({ callId }) => {
      console.log('Call started:', callId);
      currentCallId.current = callId;
    });

    socket.on('call:ended', () => {
      console.log('Call ended');
      leaveRoom();
    });

    return () => {
      socket.off('room:created');
      socket.off('user:joined');
      socket.off('user:left');
      socket.off('signal');
      socket.off('call:started');
      socket.off('call:ended');
      leaveRoom();
    };
  }, [socket, createPeerConnection]);

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    isCallActive,
    localStream,
    remoteStreams,
    error,
    activeRoomId,
    isInitializing
  };
}