import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/use-socket";

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export interface LiveChatMessage {
  userId: number;
  username?: string;
  message: string;
  ts: number;
}

interface StartArgs {
  title: string;
  description?: string;
  audio?: boolean;
  video?: boolean;
}

export interface LiveReaction {
  id: number;
  emoji: string;
  ts: number;
}

interface LiveBroadcastValue {
  isBroadcasting: boolean;
  broadcastId: number | null;
  title: string | null;
  description: string | null;
  stream: MediaStream | null;
  viewerCount: number;
  chat: LiveChatMessage[];
  reactions: LiveReaction[];
  audioEnabled: boolean;
  videoEnabled: boolean;
  error: string | null;

  start: (args: StartArgs) => Promise<{ ok: boolean; error?: string; broadcastId?: number }>;
  end: () => Promise<void>;
  toggleAudio: () => void;
  toggleVideo: () => void;
  sendChat: (msg: string) => void;
  sendReaction: (emoji: string) => void;
}

const LiveBroadcastCtx = createContext<LiveBroadcastValue | null>(null);

export function useLiveBroadcast() {
  const ctx = useContext(LiveBroadcastCtx);
  if (!ctx) throw new Error("useLiveBroadcast must be used inside <LiveBroadcastProvider>");
  return ctx;
}

export function LiveBroadcastProvider({ children }: { children: React.ReactNode }) {
  const socket = useSocket();
  const [broadcastId, setBroadcastId] = useState<number | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [chat, setChat] = useState<LiveChatMessage[]>([]);
  const [reactions, setReactions] = useState<LiveReaction[]>([]);
  const reactionSeq = useRef(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const broadcastIdRef = useRef<number | null>(null);
  broadcastIdRef.current = broadcastId;

  const start = useCallback<LiveBroadcastValue["start"]>(
    async ({ title, description, audio = true, video = true }) => {
      if (!socket) return { ok: false, error: "Socket not ready" };
      try {
        // 1. Create the row
        const r = await fetch("/api/broadcasts", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description: description ?? "" }),
        });
        if (!r.ok) {
          const msg = await r.text().catch(() => "Failed to create broadcast");
          return { ok: false, error: msg };
        }
        const b = await r.json();

        // 2. Acquire camera / mic
        const constraints: MediaStreamConstraints = {
          audio,
          video: video
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
            : false,
        };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = s;
        setStream(s);
        setAudioEnabled(true);
        setVideoEnabled(video);

        // 3. Tell the server
        socket.emit("live:host:start", { broadcastId: b.id });
        setBroadcastId(b.id);
        setTitle(title);
        setDescription(description ?? "");
        setError(null);
        setViewerCount(0);
        setChat([]);

        return { ok: true, broadcastId: b.id };
      } catch (err: any) {
        const msg = err?.message ?? "Could not access camera/mic";
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [socket],
  );

  const end = useCallback(async () => {
    const id = broadcastIdRef.current;
    peers.current.forEach((pc) => pc.close());
    peers.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setStream(null);
    setBroadcastId(null);
    setTitle(null);
    setDescription(null);
    setViewerCount(0);
    setChat([]);
    setError(null);
    if (!id) return;
    if (socket) socket.emit("live:host:end", { broadcastId: id });
    try {
      await fetch(`/api/broadcasts/${id}/end`, { method: "POST", credentials: "include" });
    } catch {
      /* socket event will mark it ended server-side anyway */
    }
  }, [socket]);

  const toggleAudio = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const tracks = s.getAudioTracks();
    if (!tracks.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = next));
    setAudioEnabled(next);
  }, []);

  const toggleVideo = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const tracks = s.getVideoTracks();
    if (!tracks.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = next));
    setVideoEnabled(next);
  }, []);

  const sendChat = useCallback(
    (msg: string) => {
      const id = broadcastIdRef.current;
      if (!socket || !id || !msg.trim()) return;
      socket.emit("live:chat", { broadcastId: id, message: msg.trim() });
    },
    [socket],
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      const id = broadcastIdRef.current;
      if (!socket || !id || !emoji) return;
      socket.emit("live:reaction", { broadcastId: id, emoji });
    },
    [socket],
  );

  // Socket listeners — installed once and stay for the life of the provider.
  useEffect(() => {
    if (!socket) return;

    const onViewerJoined = async ({ viewerId }: { viewerId: string }) => {
      const local = localStreamRef.current;
      if (!local || !broadcastIdRef.current) return;
      const pc = new RTCPeerConnection(ICE_CONFIG);
      peers.current.set(viewerId, pc);
      local.getTracks().forEach((t) => pc.addTrack(t, local));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("live:signal", {
            to: viewerId,
            broadcastId: broadcastIdRef.current,
            signal: { type: "candidate", candidate: e.candidate },
          });
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("live:signal", {
          to: viewerId,
          broadcastId: broadcastIdRef.current,
          signal: { type: "offer", sdp: offer },
        });
      } catch (err) {
        console.error("offer error", err);
      }
    };

    const onViewerLeft = ({ viewerId }: { viewerId: string }) => {
      const pc = peers.current.get(viewerId);
      pc?.close();
      peers.current.delete(viewerId);
    };

    const onSignal = async ({ from, signal }: { from: string; signal: any }) => {
      const pc = peers.current.get(from);
      if (!pc) return;
      try {
        if (signal.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === "candidate" && signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error("host signal err", err);
      }
    };

    const onViewers = ({ count }: { count: number }) => setViewerCount(count);
    const onChat = (m: LiveChatMessage) => setChat((arr) => [...arr.slice(-99), m]);
    const onReaction = ({ emoji, ts }: { emoji: string; ts: number }) => {
      const id = ++reactionSeq.current;
      setReactions((arr) => [...arr.slice(-19), { id, emoji, ts }]);
      // Auto-evict after the float animation finishes (~3.5s).
      window.setTimeout(() => {
        setReactions((arr) => arr.filter((r) => r.id !== id));
      }, 4000);
    };
    const onEnded = ({ broadcastId: ended }: { broadcastId: number }) => {
      if (broadcastIdRef.current === ended) {
        peers.current.forEach((pc) => pc.close());
        peers.current.clear();
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setStream(null);
        setBroadcastId(null);
        setTitle(null);
        setDescription(null);
        setViewerCount(0);
      }
    };

    socket.on("live:viewer:joined", onViewerJoined);
    socket.on("live:viewer:left", onViewerLeft);
    socket.on("live:signal", onSignal);
    socket.on("live:viewers", onViewers);
    socket.on("live:chat", onChat);
    socket.on("live:reaction", onReaction);
    socket.on("broadcast:ended", onEnded);

    return () => {
      socket.off("live:viewer:joined", onViewerJoined);
      socket.off("live:viewer:left", onViewerLeft);
      socket.off("live:signal", onSignal);
      socket.off("live:viewers", onViewers);
      socket.off("live:chat", onChat);
      socket.off("live:reaction", onReaction);
      socket.off("broadcast:ended", onEnded);
    };
  }, [socket]);

  // Best-effort end if the tab actually closes.
  useEffect(() => {
    const onUnload = () => {
      const id = broadcastIdRef.current;
      if (id && navigator.sendBeacon) {
        navigator.sendBeacon(`/api/broadcasts/${id}/end`);
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const value: LiveBroadcastValue = {
    isBroadcasting: !!broadcastId,
    broadcastId,
    title,
    description,
    stream,
    viewerCount,
    chat,
    reactions,
    audioEnabled,
    videoEnabled,
    error,
    start,
    end,
    toggleAudio,
    toggleVideo,
    sendChat,
    sendReaction,
  };

  return <LiveBroadcastCtx.Provider value={value}>{children}</LiveBroadcastCtx.Provider>;
}
