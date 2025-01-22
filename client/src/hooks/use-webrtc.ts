import { useState, useRef, useEffect, useCallback } from 'react';
import { useSocket } from './use-socket';
import { useToast } from './use-toast';

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
  const { toast } = useToast();
  const [isCallActive, setIsCallActive] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isAudioOnly, setIsAudioOnly] = useState(false);

  const peerConnections = useRef<Map<number, PeerConnection>>(new Map());
  const currentCallId = useRef<number | null>(null);
  const mediaDeviceRetries = useRef(0);
  const maxMediaRetries = 3;

  const cleanup = useCallback(() => {
    console.log('Cleaning up WebRTC connections and streams...');

    peerConnections.current.forEach(({ connection }) => {
      try {
        connection.close();
      } catch (err) {
        console.error('Error closing peer connection:', err);
      }
    });
    peerConnections.current.clear();

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

    setLocalStream(null);
    setRemoteStreams(new Map());
    setIsCallActive(false);
    currentCallId.current = null;
    setError(null);
    setIsAudioOnly(false);
    mediaDeviceRetries.current = 0;
  }, [localStream]);

  const endCall = useCallback(() => {
    if (!socket || !currentCallId.current) return;
    console.log('Ending call:', currentCallId.current);
    socket.emit('call:end', { callId: currentCallId.current });
    cleanup();
  }, [socket, cleanup]);

  const setupLocalStream = useCallback(async (audioOnly = false) => {
    try {
      setIsInitializing(true);
      console.log('Setting up local stream... (Attempt', mediaDeviceRetries.current + 1, '/', maxMediaRetries, ')');

      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        setLocalStream(null);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: !audioOnly ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } : false
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Successfully got media stream:', audioOnly ? 'audio-only' : 'audio+video');
        setLocalStream(stream);
        setIsAudioOnly(audioOnly);
        setIsInitializing(false);
        mediaDeviceRetries.current = 0;
        return stream;
      } catch (err: any) {
        console.error('Media access error:', err.name, err);
        mediaDeviceRetries.current++;

        if (mediaDeviceRetries.current < maxMediaRetries) {
          console.log('Retrying media access...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          return setupLocalStream(audioOnly);
        }

        setError(getMediaErrorMessage(err));
        toast({
          variant: "destructive",
          title: "Media Access Error",
          description: err.message || "Failed to access media devices"
        });

        setIsInitializing(false);
        return null;
      }
    } catch (err) {
      console.error('Fatal error setting up media devices:', err);
      setError('Could not initialize media devices.');
      setIsInitializing(false);
      return null;
    }
  }, [toast]);

  const getMediaErrorMessage = (err: any) => {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Media access denied. Please grant camera and microphone permissions.';
      case 'NotReadableError':
        return 'Could not access media devices. Please ensure no other application is using your camera/microphone.';
      case 'NotFoundError':
        return 'No media devices found. Please check your camera and microphone connections.';
      default:
        return 'Media device error. Please check your hardware and browser settings.';
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
          if (localStream) {
            pc.addTrack(track, localStream);
          }
        });
      }

      pc.ontrack = (event) => {
        console.log('Received remote track from peer:', peerId);
        const [stream] = event.streams;
        if (stream) {
          setRemoteStreams(prev => new Map(prev).set(peerId, stream));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log('Sending ICE candidate to peer:', peerId);
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
      setError('Failed to create peer connection.');
      return null;
    }
  }, [socket, localStream, endCall]);

  const acceptCall = useCallback(async (callId: number, peerId: number) => {
    if (!socket) {
      setError('Socket connection not available');
      return;
    }

    try {
      currentCallId.current = callId;
      const stream = await setupLocalStream(false);
      if (!stream) {
        socket.emit('call:reject', { callId });
        return;
      }

      const pc = await createPeerConnection(peerId);
      if (!pc) return;

      try {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('signal', {
          to: peerId,
          signal: { type: 'answer', sdp: answer }
        });

        socket.emit('call:accept', { callId });
        setIsCallActive(true);
      } catch (err) {
        console.error('Error accepting call:', err);
        setError('Failed to accept call');
        cleanup();
      }
    } catch (err) {
      console.error('Error in accept call:', err);
      setError('Failed to setup call');
      cleanup();
    }
  }, [socket, cleanup, setupLocalStream, createPeerConnection]);

  const rejectCall = useCallback((callId: number) => {
    if (!socket) return;
    socket.emit('call:reject', { callId });
  }, [socket]);

  const startCall = useCallback(async (receiverId: number, audioOnly = false) => {
    if (!socket) {
      setError('Socket connection not available');
      return;
    }

    try {
      cleanup();
      console.log('Starting call with:', receiverId, 'Audio only:', audioOnly);
      const stream = await setupLocalStream(audioOnly);
      if (!stream) return;

      socket.emit('call:start', { receiverId });
      setIsCallActive(true);
    } catch (err) {
      console.error('Error starting call:', err);
      setError('Failed to start call');
      cleanup();
    }
  }, [socket, cleanup, setupLocalStream]);

  const enableVideo = useCallback(async () => {
    try {
      if (!isAudioOnly || !localStream) return;

      console.log('Switching to video call...');
      const videoConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      };

      // First check if video is available
      try {
        await navigator.mediaDevices.getUserMedia(videoConstraints);
      } catch (err) {
        console.error('Video device not available:', err);
        toast({
          variant: "destructive",
          title: "Video Error",
          description: "No video device available. Please check your camera."
        });
        return;
      }

      // Get new stream with both audio and video
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        ...videoConstraints
      });

      // Keep audio track from old stream if it exists
      const existingAudioTrack = localStream.getAudioTracks()[0];
      if (existingAudioTrack) {
        newStream.addTrack(existingAudioTrack.clone());
      }

      // Stop old tracks
      localStream.getTracks().forEach(track => {
        track.stop();
      });

      // Replace tracks in all peer connections
      peerConnections.current.forEach(({ connection }) => {
        const senders = connection.getSenders();
        newStream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) {
            console.log(`Replacing ${track.kind} track`);
            sender.replaceTrack(track).catch(err => {
              console.error(`Error replacing ${track.kind} track:`, err);
            });
          } else {
            console.log(`Adding new ${track.kind} track`);
            connection.addTrack(track, newStream);
          }
        });
      });

      setLocalStream(newStream);
      setIsAudioOnly(false);

      // Notify other participants about video enabled
      peerConnections.current.forEach(({ connection }, peerId) => {
        if (socket) {
          socket.emit('signal', {
            to: peerId,
            signal: { type: 'video-enabled' }
          });
        }
      });
    } catch (err) {
      console.error('Error enabling video:', err);
      setError('Failed to enable video. Please check your camera permissions.');
      toast({
        variant: "destructive",
        title: "Video Error",
        description: "Failed to enable video. Please check your camera."
      });
    }
  }, [isAudioOnly, localStream, socket, toast]);


  useEffect(() => {
    if (!socket) {
      setIsCallActive(false);
      setError('Socket connection not available');
      return;
    }

    const handleIncomingCall = async ({ callId, from: peerId }: { callId: number, from: number }) => {
      console.log('Incoming call from:', peerId);
      // The incoming call is now handled by a modal that allows the user to accept or reject the call.
      // This removes the automatic acceptance of incoming calls.

    };

    const handleSignal = async ({ from: peerId, signal }: { from: number, signal: any }) => {
      console.log('Received signal from peer:', peerId, signal.type);
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
    };

    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:started', ({ callId }) => {
      console.log('Call started:', callId);
      currentCallId.current = callId;
      setIsCallActive(true);
    });
    socket.on('call:ended', () => {
      console.log('Call ended');
      cleanup();
    });
    socket.on('signal', handleSignal);

    return () => {
      socket.off('call:incoming');
      socket.off('call:started');
      socket.off('call:ended');
      socket.off('signal');
      cleanup();
    };
  }, [socket, createPeerConnection, cleanup, setupLocalStream]);

  return {
    startCall,
    endCall,
    acceptCall,
    rejectCall,
    enableVideo,
    isCallActive,
    localStream,
    remoteStreams,
    error,
    isInitializing,
    isAudioOnly
  };
}