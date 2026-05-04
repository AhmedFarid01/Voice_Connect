import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { NavBar } from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, ArrowLeft, Send, Loader2, Radio } from "lucide-react";
import { useLiveViewer } from "@/hooks/use-live-viewer";
import { useLiveBroadcast } from "@/contexts/live-broadcast";
import { ReactionLayer, ReactionToolbar } from "@/components/reaction-layer";
import { useSocket } from "@/hooks/use-socket";
import type { BroadcastCardData } from "@/components/broadcast-card";

export default function WatchLivePage() {
  const [, params] = useRoute("/live/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const broadcaster = useLiveBroadcast();
  const socket = useSocket();

  const sendReaction = (emoji: string) => {
    if (!socket || !Number.isFinite(id)) return;
    socket.emit("live:reaction", { broadcastId: id, emoji });
  };

  const { data: meta } = useQuery<BroadcastCardData>({
    queryKey: [`/api/broadcasts/${id}`],
    enabled: Number.isFinite(id),
  });

  // If this is OUR live broadcast, skip the viewer WebRTC loopback —
  // just preview the local stream directly.
  const isOwnBroadcast = broadcaster.isBroadcasting && broadcaster.broadcastId === id;

  const live = useLiveViewer(Number.isFinite(id) && !isOwnBroadcast ? id : null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isOwnBroadcast) {
      videoRef.current.srcObject = broadcaster.stream;
    } else {
      videoRef.current.srcObject = live.remote;
    }
  }, [isOwnBroadcast, broadcaster.stream, live.remote]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [live.chat, broadcaster.chat]);

  const host = meta?.hostDisplayName || meta?.hostUsername || "Host";

  const chatMessages = isOwnBroadcast ? broadcaster.chat : live.chat;
  const viewerCount = isOwnBroadcast ? broadcaster.viewerCount : live.viewerCount;
  const ended = !isOwnBroadcast && live.ended;
  const waiting = !isOwnBroadcast && live.waiting;
  const unavailable = !isOwnBroadcast && live.unavailable;
  const sendChat = (msg: string) => (isOwnBroadcast ? broadcaster.sendChat(msg) : live.sendChat(msg));

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <button
          onClick={() => setLocation("/live")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to live
        </button>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black aspect-video shadow-2xl shadow-black/40">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isOwnBroadcast}
                className="h-full w-full object-contain bg-black"
              />

              {waiting && !unavailable && (
                <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm">
                  <div className="text-center">
                    <Loader2 className="h-7 w-7 animate-spin mx-auto text-violet-300" />
                    <p className="mt-3 text-sm text-zinc-300">Connecting to {host}…</p>
                  </div>
                </div>
              )}

              {unavailable && !ended && (
                <div className="absolute inset-0 grid place-items-center bg-black/80 px-6">
                  <div className="text-center max-w-sm">
                    <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-zinc-800 border border-white/10 mb-3">
                      <Radio className="h-5 w-5 text-zinc-400" />
                    </div>
                    <p className="text-lg font-semibold">Broadcast unavailable</p>
                    <p className="text-sm text-zinc-400 mt-1">
                      {host} doesn't seem to be online right now. They may have closed
                      their tab without ending the stream.
                    </p>
                    <Button
                      onClick={() => setLocation("/live")}
                      className="mt-4 rounded-xl bg-white text-black hover:bg-white/90"
                    >
                      Back to live
                    </Button>
                  </div>
                </div>
              )}

              {ended && (
                <div className="absolute inset-0 grid place-items-center bg-black/80">
                  <div className="text-center">
                    <p className="text-lg font-semibold">Broadcast ended</p>
                    <p className="text-sm text-zinc-400 mt-1">Thanks for watching.</p>
                    <Button
                      onClick={() => setLocation("/live")}
                      className="mt-4 rounded-xl bg-white text-black hover:bg-white/90"
                    >
                      Back to live
                    </Button>
                  </div>
                </div>
              )}

              {!waiting && !ended && !unavailable && (
                <>
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <span className="live-pulse">Live</span>
                    {isOwnBroadcast && (
                      <span className="text-[10px] uppercase tracking-widest font-bold text-white bg-violet-500/90 rounded-md px-2 py-1">
                        You
                      </span>
                    )}
                  </div>
                  <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-xs font-medium text-white">
                    <Users className="h-3 w-3" />
                    {viewerCount}
                  </div>

                  <ReactionLayer broadcastId={Number.isFinite(id) ? id : null} />

                  <div className="absolute bottom-4 inset-x-0 flex justify-center gap-3 px-3 flex-wrap">
                    {!isOwnBroadcast && <ReactionToolbar onSend={sendReaction} />}
                    {isOwnBroadcast && (
                      <Button
                        onClick={() => setLocation("/go-live")}
                        className="rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur"
                      >
                        <Radio className="h-4 w-4 mr-2" />
                        Open broadcaster view
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl glass p-5">
              <button
                type="button"
                onClick={() => meta?.hostId && setLocation(`/profile/${meta.hostId}`)}
                disabled={!meta?.hostId}
                className="flex items-center gap-3 group/host rounded-xl hover:bg-white/5 -m-1 p-1 transition w-full text-left"
              >
                <Avatar className="h-12 w-12">
                  <AvatarFallback
                    className="text-white text-sm font-semibold"
                    style={{
                      background: `linear-gradient(135deg, ${meta?.hostColor ?? "#ef4444"}, #1e1b4b)`,
                    }}
                  >
                    {host.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h1 className="font-bold truncate group-hover/host:text-violet-200 transition">
                    {meta?.title ?? "Loading…"}
                  </h1>
                  <p className="text-sm text-zinc-400 truncate">{host}</p>
                </div>
              </button>
              {meta?.description && (
                <p className="mt-3 text-sm text-zinc-200 whitespace-pre-wrap">{meta.description}</p>
              )}
            </div>
          </div>

          <aside className="rounded-2xl glass flex flex-col h-[70vh] lg:h-auto lg:max-h-[80vh]">
            <div className="px-5 py-4 border-b border-white/10">
              <h3 className="font-semibold">Live chat</h3>
            </div>
            <div ref={chatRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">Be the first to say hi.</p>
              ) : (
                chatMessages.map((m, i) => (
                  <div key={i} className="flex gap-3 animate-float-up">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback
                        className="text-white text-[10px] font-semibold"
                        style={{ background: "linear-gradient(135deg, #6366f1, #1e1b4b)" }}
                      >
                        {(m.username ?? "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-violet-200">{m.username ?? "Guest"}</p>
                      <p className="text-sm text-zinc-100 break-words">{m.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                sendChat(draft);
                setDraft("");
              }}
              className="p-3 border-t border-white/10 flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Say something…"
                className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/40"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!draft.trim()}
                className="rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:opacity-90 border-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </aside>
        </div>
      </main>
    </div>
  );
}
