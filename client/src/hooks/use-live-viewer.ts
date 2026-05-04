import { useEffect, useRef, useState } from "react";
import { useSocket } from "./use-socket";
import type { LiveChatMessage } from "@/contexts/live-broadcast";

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useLiveViewer(broadcastId: number | null) {
  const socket = useSocket();
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [chat, setChat] = useState<LiveChatMessage[]>([]);
  const [ended, setEnded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [waiting, setWaiting] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!socket || !broadcastId) return;
    setUnavailable(false);
    setEnded(false);
    setWaiting(true);

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;
    const ms = new MediaStream();
    setRemote(ms);

    // Time out the "Connecting…" spinner if no track arrives.
    const giveUpTimer = window.setTimeout(() => {
      setWaiting(false);
      setUnavailable(true);
    }, 12_000);

    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => ms.addTrack(t));
      setRemote(new MediaStream(ms.getTracks()));
      setWaiting(false);
      setUnavailable(false);
      window.clearTimeout(giveUpTimer);
    };

    pc.onicecandidate = (e) => {
      // We don't yet know hostId; relay via signal from server side. Reply via "from" stored on offer event.
      // Handled in onSignal closure with hostSocketId.
      if (e.candidate && lastHostId.current) {
        socket.emit("live:signal", {
          to: lastHostId.current,
          broadcastId,
          signal: { type: "candidate", candidate: e.candidate },
        });
      }
    };

    const lastHostId = { current: null as string | null };

    const onSignal = async ({ from, signal }: { from: string; signal: any }) => {
      lastHostId.current = from;
      try {
        if (signal.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("live:signal", {
            to: from,
            broadcastId,
            signal: { type: "answer", sdp: answer },
          });
        } else if (signal.type === "candidate" && signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error("viewer signal err", err);
      }
    };

    const onViewers = ({ count }: { count: number }) => setViewerCount(count);
    const onEnded = () => {
      setEnded(true);
      setWaiting(false);
      window.clearTimeout(giveUpTimer);
    };
    const onChat = (m: LiveChatMessage) => setChat((arr) => [...arr.slice(-99), m]);

    socket.on("live:signal", onSignal);
    socket.on("live:viewers", onViewers);
    socket.on("broadcast:ended", onEnded);
    socket.on("live:chat", onChat);
    socket.on("live:waiting-host", () => setWaiting(true));

    socket.emit("live:viewer:join", { broadcastId });

    return () => {
      window.clearTimeout(giveUpTimer);
      socket.emit("live:viewer:leave", { broadcastId });
      socket.off("live:signal", onSignal);
      socket.off("live:viewers", onViewers);
      socket.off("broadcast:ended", onEnded);
      socket.off("live:chat", onChat);
      pc.close();
      pcRef.current = null;
      ms.getTracks().forEach((t) => t.stop());
    };
  }, [socket, broadcastId]);

  const sendChat = (msg: string) => {
    if (!socket || !broadcastId || !msg.trim()) return;
    socket.emit("live:chat", { broadcastId, message: msg.trim() });
  };

  return { remote, viewerCount, chat, sendChat, ended, waiting, unavailable };
}
