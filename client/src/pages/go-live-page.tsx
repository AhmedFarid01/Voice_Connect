import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLiveBroadcast } from "@/contexts/live-broadcast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { EndBroadcastDialog } from "@/components/live-bar";
import { ReactionLayer } from "@/components/reaction-layer";
import {
  Mic, MicOff, Video, VideoOff, Radio, Send, Users, X, Loader2,
} from "lucide-react";

export default function GoLivePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const live = useLiveBroadcast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (videoRef.current && live.stream) videoRef.current.srcObject = live.stream;
  }, [live.stream]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [live.chat]);

  const startBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ variant: "destructive", title: "Add a title" });
      return;
    }
    setCreating(true);
    const r = await live.start({
      title: title.trim(),
      description: description.trim(),
      audio: true,
      video: true,
    });
    setCreating(false);
    if (!r.ok) {
      toast({ variant: "destructive", title: "Couldn't start", description: r.error });
      return;
    }
    toast({ title: "You're live!", description: "Viewers can join now." });
  };

  const endBroadcast = async () => {
    await live.end();
    setLocation("/");
  };

  if (!live.isBroadcasting) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Go live</h1>
            <p className="text-zinc-400 mt-1">Set the stage, then hit the red button.</p>
          </div>

          <form onSubmit={startBroadcast} className="space-y-5 glass rounded-3xl p-6">
            <div>
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Stream title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q&A: Building in public"
                maxLength={140}
                className="mt-1.5 bg-white/5 border-white/15 h-11 rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What's this stream about?"
                className="mt-1.5 bg-white/5 border-white/10 rounded-xl resize-none"
              />
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-rose-500/10 border border-rose-400/20 p-4 text-sm text-rose-100">
              <Radio className="h-5 w-5 text-rose-300 shrink-0 mt-0.5" />
              <p>
                Your camera and microphone will be requested. Viewers join from the Live page.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/")}
                className="rounded-xl border-white/15 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating}
                className="flex-1 rounded-xl h-11 bg-gradient-to-r from-rose-500 to-orange-400 hover:opacity-90 border-0 font-semibold shadow-lg shadow-rose-500/30"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Starting…
                  </>
                ) : (
                  <>
                    <Radio className="h-4 w-4 mr-2" />
                    Start broadcasting
                  </>
                )}
              </Button>
            </div>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black aspect-video shadow-2xl shadow-black/40">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              <ReactionLayer broadcastId={live.broadcastId} />
              <div className="absolute top-4 left-4"><span className="live-pulse">Live</span></div>
              <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 px-2.5 py-1 text-xs font-medium text-white">
                <Users className="h-3 w-3" />
                {live.viewerCount}
              </div>

              <div className="absolute bottom-4 inset-x-0 flex justify-center gap-3">
                <ControlBtn
                  active={live.audioEnabled}
                  onClick={live.toggleAudio}
                  on={<Mic className="h-5 w-5" />}
                  off={<MicOff className="h-5 w-5" />}
                />
                <ControlBtn
                  active={live.videoEnabled}
                  onClick={live.toggleVideo}
                  on={<Video className="h-5 w-5" />}
                  off={<VideoOff className="h-5 w-5" />}
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="grid place-items-center h-12 w-12 rounded-full bg-rose-500 hover:bg-rose-400 shadow-lg shadow-rose-500/40 transition"
                      title="End broadcast"
                    >
                      <X className="h-5 w-5 text-white" />
                    </button>
                  </AlertDialogTrigger>
                  <EndBroadcastDialog onEnd={endBroadcast} />
                </AlertDialog>
              </div>
            </div>

            <div className="rounded-2xl glass p-4">
              <h2 className="font-semibold">{live.title}</h2>
              {live.description && <p className="text-sm text-zinc-300 mt-1">{live.description}</p>}
            </div>
          </div>

          <ChatPanel
            chatRef={chatRef}
            messages={live.chat}
            draft={draft}
            setDraft={setDraft}
            onSend={() => {
              live.sendChat(draft);
              setDraft("");
            }}
          />
        </div>
      </main>
    </div>
  );
}

function ControlBtn({
  active,
  on,
  off,
  onClick,
}: {
  active: boolean;
  on: React.ReactNode;
  off: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`grid place-items-center h-12 w-12 rounded-full transition shadow-lg backdrop-blur-md ${
        active
          ? "bg-white/15 hover:bg-white/25 text-white border border-white/20"
          : "bg-rose-500/90 hover:bg-rose-500 text-white"
      }`}
    >
      {active ? on : off}
    </button>
  );
}

function ChatPanel({
  chatRef,
  messages,
  draft,
  setDraft,
  onSend,
}: {
  chatRef: React.RefObject<HTMLDivElement>;
  messages: { userId: number; username?: string; message: string; ts: number }[];
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <aside className="rounded-2xl glass flex flex-col h-[60vh] sm:h-[70vh] lg:h-auto lg:max-h-[80vh]">
      <div className="px-5 py-4 border-b border-white/10">
        <h3 className="font-semibold">Live chat</h3>
      </div>
      <div ref={chatRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-8">Say hi to your audience.</p>
        ) : (
          messages.map((m, i) => (
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
          if (draft.trim()) onSend();
        }}
        className="p-3 border-t border-white/10 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Send a message…"
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
  );
}
