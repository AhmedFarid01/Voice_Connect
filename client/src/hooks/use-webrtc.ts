import { useState, useRef, useEffect, useCallback } from 'react';
import { useSocket } from './use-socket';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
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

  const peerConnections = useRef<Map<number, PeerConnection>>(new Map());
  const currentCallId = useRef<number | null>(null);

  const createPeerConnection = useCallback(async (peerId: number) => {
    if (!socket) {
      setError('Socket connection not available');
      return null;
    }

    const pc = new RTCPeerConnection(configuration);

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
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
    };

    peerConnections.current.set(peerId, { connection: pc, stream: null });
    return pc;
  }, [socket, localStream, activeRoomId]);

  const setupLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true 
      });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Could not access media devices');
      return null;
    }
  };

  const createRoom = async (name: string) => {
    if (!socket) {
      setError('Socket connection not available');
      return;
    }

    socket.emit('room:create', { name });
  };

  const joinRoom = async (roomId: number) => {
    if (!socket) {
      setError('Socket connection not available');
      return;
    }

    const stream = await setupLocalStream();
    if (!stream) return;

    setActiveRoomId(roomId);
    setIsCallActive(true);
    socket.emit('room:join', { roomId });
    socket.emit('call:start', { roomId });
  };

  const leaveRoom = () => {
    if (!socket || !activeRoomId) return;

    socket.emit('room:leave', { roomId: activeRoomId });
    socket.emit('call:end', { 
      callId: currentCallId.current,
      roomId: activeRoomId 
    });

    // Cleanup
    peerConnections.current.forEach(({ connection }) => connection.close());
    peerConnections.current.clear();
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStreams(new Map());
    setIsCallActive(false);
    setActiveRoomId(null);
    currentCallId.current = null;
  };

  useEffect(() => {
    if (!socket) return;

    socket.on('room:created', (room) => {
      setActiveRoomId(room.id);
      joinRoom(room.id);
    });

    socket.on('user:joined', async ({ userId: peerId }) => {
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
        } else if (signal.type === 'candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('Error handling signal:', err);
      }
    });

    socket.on('call:started', ({ callId }) => {
      currentCallId.current = callId;
    });

    socket.on('call:ended', () => {
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
    activeRoomId
  };
}