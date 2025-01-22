import { useState, useRef, useEffect, useCallback } from 'react';
import { useSocket } from './use-socket';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
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
  const [isInitializing, setIsInitializing] = useState(false);
  const [isAudioOnly, setIsAudioOnly] = useState(false);

  const peerConnections = useRef<Map<number, PeerConnection>>(new Map());
  const currentCallId = useRef<number | null>(null);
  const existingStream = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    console.log('Cleaning up WebRTC connections and streams...');

    // Clean up peer connections
    peerConnections.current.forEach(({ connection }) => {
      try {
        connection.close();
      } catch (err) {
        console.error('Error closing peer connection:', err);
      }
    });
    peerConnections.current.clear();

    // Clean up media streams
    if (localStream) {
      try {
        localStream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
      } catch (err) {
        console.error('Error cleaning up local stream:', err);
      }
    }

    if (existingStream.current) {
      try {
        existingStream.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
      } catch (err) {
        console.error('Error cleaning up existing stream:', err);
      }
      existingStream.current = null;
    }

    setLocalStream(null);
    setRemoteStreams(new Map());
    setIsCallActive(false);
    currentCallId.current = null;
    setError(null);
    setIsAudioOnly(false);
  }, [localStream]);

  const endCall = useCallback(() => {
    if (!socket || !currentCallId.current) return;
    console.log('Ending call:', currentCallId.current);
    socket.emit('call:end', { callId: currentCallId.current });
    cleanup();
  }, [socket, cleanup]);

  const setupLocalStream = async (audioOnly = false) => {
    try {
      setIsInitializing(true);
      console.log('Setting up local stream...');

      // Clean up any existing streams first
      if (existingStream.current) {
        existingStream.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        existingStream.current = null;
      }

      // Wait a bit for devices to be released
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        if (!audioOnly) {
          console.log('Attempting to get video and audio...');
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true
            }, 
            video: true 
          });
          console.log('Successfully got video and audio stream');
          existingStream.current = stream;
          setLocalStream(stream);
          setIsAudioOnly(false);
          setIsInitializing(false);
          return stream;
        } else {
          console.log('Setting up audio-only stream...');
          const audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true
            }, 
            video: false 
          });
          console.log('Successfully got audio-only stream');
          existingStream.current = audioStream;
          setLocalStream(audioStream);
          setIsAudioOnly(true);
          setIsInitializing(false);
          return audioStream;
        }
      } catch (err: any) {
        console.error('Media access error:', err.name, err);
        if (err.name === 'NotAllowedError') {
          setError('Media access denied. Please grant permissions and try again.');
        } else if (err.name === 'NotReadableError') {
          setError('Could not access media devices. Please ensure no other application is using your camera/microphone and refresh the page.');
          cleanup();
        } else if (err.name === 'NotFoundError') {
          setError('No media devices found. Please check your camera/microphone connections.');
        } else {
          setError('Could not access media devices. Please check your hardware and browser settings.');
        }
        setIsInitializing(false);
        return null;
      }
    } catch (err) {
      console.error('Fatal error accessing media devices:', err);
      setError('Could not initialize media devices. Please check your hardware and browser permissions.');
      setIsInitializing(false);
      return null;
    }
  };

  const createPeerConnection = useCallback(async (peerId: number) => {
    if (!socket) {
      setError('Socket connection not available');
      return null;
    }

    try {
      console.log('Creating peer connection for:', peerId);
      const pc = new RTCPeerConnection(configuration);

      pc.onconnectionstatechange = () => {
        console.log('Connection state change:', pc.connectionState);
      };

      pc.onsignalingstatechange = () => {
        console.log('Signaling state change:', pc.signalingState);
      };

      if (localStream) {
        console.log('Adding local tracks to peer connection');
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
      }

      pc.ontrack = (event) => {
        console.log('Received remote track');
        const stream = event.streams[0];
        setRemoteStreams(prev => new Map(prev).set(peerId, stream));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log('Sending ICE candidate');
          socket.emit('signal', {
            to: peerId,
            signal: { type: 'candidate', candidate: event.candidate }
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`ICE Connection State with peer ${peerId}:`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.error('ICE connection failed or disconnected');
          setError('Connection lost. Please check your internet connection.');
          endCall();
        }
      };

      peerConnections.current.set(peerId, { connection: pc, stream: null });
      return pc;
    } catch (err) {
      console.error('Error creating peer connection:', err);
      setError('Failed to create peer connection. Please check your internet connection.');
      return null;
    }
  }, [socket, localStream, endCall]);

  const startCall = async (receiverId: number, audioOnly = false) => {
    if (!socket) {
      setError('Socket connection not available');
      return;
    }

    try {
      console.log('Starting call with:', receiverId, 'Audio only:', audioOnly);
      const stream = await setupLocalStream(audioOnly);
      if (!stream) return;

      socket.emit('call:start', { receiverId });
      setIsCallActive(true);
    } catch (err) {
      console.error('Error starting call:', err);
      setError('Failed to start call');
    }
  };

  useEffect(() => {
    if (!socket) {
      setIsCallActive(false);
      setError('Socket connection not available');
      return;
    }

    socket.on('call:incoming', async ({ callId, from: peerId }) => {
      console.log('Incoming call from:', peerId);
      currentCallId.current = callId;
      const pc = await createPeerConnection(peerId);
      if (!pc) return;

      try {
        console.log('Creating answer for peer:', peerId);
        const answer = await pc.createAnswer();
        console.log('Setting local description');
        await pc.setLocalDescription(answer);

        console.log('Sending answer to peer');
        socket.emit('signal', {
          to: peerId,
          signal: { type: 'answer', sdp: answer }
        });
      } catch (err) {
        console.error('Error creating answer:', err);
        setError('Failed to answer call');
      }
    });

    socket.on('call:started', ({ callId }) => {
      console.log('Call started:', callId);
      currentCallId.current = callId;
    });

    socket.on('call:ended', () => {
      console.log('Call ended');
      cleanup();
    });

    socket.on('signal', async ({ from: peerId, signal }) => {
      console.log('Received signal from:', peerId, signal.type);
      let pc = peerConnections.current.get(peerId)?.connection;

      if (!pc) {
        console.log('Creating new peer connection for signal');
        pc = await createPeerConnection(peerId);
        if (!pc) return;
      }

      try {
        if (signal.type === 'offer') {
          console.log('Setting remote description (offer)');
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          console.log('Creating answer');
          const answer = await pc.createAnswer();
          console.log('Setting local description');
          await pc.setLocalDescription(answer);

          console.log('Sending answer');
          socket.emit('signal', {
            to: peerId,
            signal: { type: 'answer', sdp: answer }
          });
        } else if (signal.type === 'answer') {
          console.log('Setting remote description (answer)');
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'candidate' && signal.candidate) {
          console.log('Adding ICE candidate');
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('Error handling signal:', err);
        setError('Failed to establish connection');
      }
    });

    return () => {
      socket.off('call:incoming');
      socket.off('call:started');
      socket.off('call:ended');
      socket.off('signal');
      cleanup();
    };
  }, [socket, createPeerConnection, cleanup]);

  return {
    startCall,
    endCall,
    isCallActive,
    localStream,
    remoteStreams,
    error,
    isInitializing,
    isAudioOnly
  };
}