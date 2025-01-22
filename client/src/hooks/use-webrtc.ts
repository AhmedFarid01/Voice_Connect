import { useState, useRef, useEffect, useCallback } from 'react';
import { useSocket } from './use-socket';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

export function useWebRTC(userId: number) {
  const socket = useSocket();
  const [isCallActive, setIsCallActive] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const currentCallId = useRef<number | null>(null);

  const setupPeerConnection = useCallback(async () => {
    if (!socket) {
      setError('Socket connection not available');
      return null;
    }

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    const pc = new RTCPeerConnection(configuration);
    peerConnection.current = pc;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Could not access media devices');
      return null;
    }

    pc.ontrack = (event) => {
      setRemoteStream(new MediaStream([event.track]));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket && currentCallId.current) {
        socket.emit('call:ice-candidate', {
          to: currentCallId.current,
          candidate: event.candidate
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', pc.iceConnectionState);
    };

    return pc;
  }, [socket]);

  const makeCall = async (to: number) => {
    if (!socket) {
      setError('Socket connection not available');
      return;
    }

    const pc = await setupPeerConnection();
    if (!pc) return;

    currentCallId.current = to;
    setIsCallActive(true);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call:offer', {
        to,
        offer
      });
    } catch (err) {
      console.error('Error creating offer:', err);
      setError('Failed to create call offer');
      endCall();
    }
  };

  const answerCall = async (from: number, offer: RTCSessionDescriptionInit) => {
    if (!socket) {
      setError('Socket connection not available');
      return;
    }

    const pc = await setupPeerConnection();
    if (!pc) return;

    currentCallId.current = from;
    setIsCallActive(true);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call:answer', {
        to: from,
        answer
      });
    } catch (err) {
      console.error('Error answering call:', err);
      setError('Failed to answer call');
      endCall();
    }
  };

  const endCall = () => {
    if (socket && currentCallId.current) {
      socket.emit('call:end', {
        to: currentCallId.current,
        callId: currentCallId.current
      });
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setIsCallActive(false);
    setError(null);
    currentCallId.current = null;
  };

  useEffect(() => {
    if (!socket) return;

    socket.on('call:offer', async ({ from, offer }) => {
      await answerCall(from, offer);
    });

    socket.on('call:answer', async ({ from, answer }) => {
      if (peerConnection.current && peerConnection.current.signalingState === 'have-local-offer') {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error setting remote description:', err);
          endCall();
        }
      }
    });

    socket.on('call:ice-candidate', async ({ from, candidate }) => {
      if (peerConnection.current && peerConnection.current.remoteDescription) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    socket.on('call:end', () => {
      endCall();
    });

    return () => {
      socket.off('call:offer');
      socket.off('call:answer');
      socket.off('call:ice-candidate');
      socket.off('call:end');
      endCall();
    };
  }, [socket]);

  return {
    makeCall,
    endCall,
    isCallActive,
    localStream,
    remoteStream,
    error
  };
}