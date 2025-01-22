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
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const currentCallId = useRef<number | null>(null);

  const setupPeerConnection = useCallback(async () => {
    const pc = new RTCPeerConnection(configuration);
    peerConnection.current = pc;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    } catch (err) {
      console.error('Error accessing media devices:', err);
      return null;
    }

    pc.ontrack = (event) => {
      setRemoteStream(new MediaStream([event.track]));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:ice-candidate', {
          to: currentCallId.current,
          candidate: event.candidate
        });
      }
    };

    return pc;
  }, [socket]);

  const makeCall = async (to: number) => {
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
      endCall();
    }
  };

  const answerCall = async (from: number, offer: RTCSessionDescriptionInit) => {
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
      endCall();
    }
  };

  const endCall = () => {
    if (currentCallId.current) {
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
    currentCallId.current = null;
  };

  useEffect(() => {
    if (!socket) return;

    socket.on('call:offer', async ({ from, offer }) => {
      await answerCall(from, offer);
    });

    socket.on('call:answer', async ({ from, answer }) => {
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('call:ice-candidate', async ({ from, candidate }) => {
      if (peerConnection.current) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
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
    };
  }, [socket]);

  return {
    makeCall,
    endCall,
    isCallActive,
    localStream,
    remoteStream
  };
}
