import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { NavBar } from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Heart, MessageCircle, Share2, Eye, Loader2, Send, ArrowLeft, Sparkles, Bookmark,
  MoreHorizontal, Pencil, Trash2, Check, X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { formatDistanceToNow } from "date-fns";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { RichText } from "@/components/rich-text";

interface VideoFull extends VideoCardData {
  liked?: boolean;
  saved?: boolean;
  progressSec?: number;
}

interface CommentRow {
  id: number;
  content: string;
  createdAt: string;
  userId: number;
  username: string;
  displayName: string | null;
  avatarColor: string | null;
  avatarUrl?: string | null;
}

export default function WatchPage() {
  const [, params] = useRoute("/watch/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  const { user } = useUser();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: video, isLoading } = useQuery<VideoFull>({
    queryKey: [`/api/videos/${id}`],
    enabled: Number.isFinite(id),
  });

  const { data: comments } = useQuery<CommentRow[]>({
    queryKey: [`/api/videos/${id}/comments`],
    enabled: Number.isFinite(id),
  });

  const { data: related } = useQuery<VideoCardData[]>({
    queryKey: [`/api/videos/${id}/related`],
    enabled: Number.isFinite(id),
  });

  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const lastSentProgress = useRef(0);
  const resumeApplied = useRef(false);

  useEffect(() => {
    if (video) {
      setLiked(!!video.liked);
      setSaved(!!video.saved);
      setLikeCount(video.likeCount ?? 0);
    }
  }, [video]);

  // Resume playback from last position (skip if within first 3s or last 5s).
  useEffect(() => {
    if (!video || resumeApplied.current || !videoRef.current) return;
    const start = video.progressSec ?? 0;
    const total = video.durationSec ?? 0;
    if (start >= 3 && (!total || start < total - 5)) {
      const apply = () => {
        if (videoRef.current && !resumeApplied.current) {
          videoRef.current.currentTime = start;
          resumeApplied.current = true;
          toast({ title: "Resumed", description: `Picked up where you left off (${formatTime(start)}).` });
        }
      };
      const el = videoRef.current;
      if (el.readyState >= 1) apply();
      else el.addEventListener("loadedmetadata", apply, { once: true });
    } else {
      resumeApplied.current = true;
    }
  }, [video, toast]);

  // Throttled progress reporting (every 10s and on pause/end).
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !user || !video) return;

    const send = (completed = false) => {
      const t = Math.floor(el.currentTime || 0);
      if (Math.abs(t - lastSentProgress.current) < 5 && !completed) return;
      lastSentProgress.current = t;
      fetch(`/api/videos/${video.id}/progress`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressSec: t, completed }),
      }).catch(() => {});
    };

    const interval = setInterval(() => send(false), 10_000);
    const onPause = () => send(false);
    const onEnded = () => send(true);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      clearInterval(interval);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      send(false);
    };
  }, [video, user]);

  const onLike = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Sign in required" });
      return;
    }
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((n) => n + (wasLiked ? -1 : 1));
    const r = await fetch(`/api/videos/${id}/like`, { method: "POST", credentials: "include" });
    if (!r.ok) {
      setLiked(wasLiked);
      setLikeCount((n) => n + (wasLiked ? 1 : -1));
      toast({ variant: "destructive", title: "Couldn't update like" });
      return;
    }
    if (!wasLiked) {
      toast({ title: "Liked", description: "The creator will see your like." });
    }
  };

  const onComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    const r = await fetch(`/api/videos/${id}/comments`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft.trim() }),
    });
    setPosting(false);
    if (!r.ok) {
      toast({ variant: "destructive", title: "Couldn't post comment" });
      return;
    }
    setDraft("");
    qc.invalidateQueries({ queryKey: [`/api/videos/${id}/comments`] });
  };

  const onSave = async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Sign in to save videos" });
      return;
    }
    const wasSaved = saved;
    setSaved(!wasSaved);
    const r = await fetch(`/api/videos/${id}/save`, { method: "POST", credentials: "include" });
    if (!r.ok) {
      setSaved(wasSaved);
      toast({ variant: "destructive", title: "Couldn't update saved list" });
      return;
    }
    toast({
      title: wasSaved ? "Removed from Saved" : "Saved",
      description: wasSaved ? "" : "Find it later in Library → Saved.",
    });
  };

  const onShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: video?.title ?? "Lumen",
      text: video?.title ? `Watch "${video.title}" on Lumen` : "Check this out on Lumen",
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        // User dismissed the share sheet — fall through to copy.
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Share it anywhere." });
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: url });
    }
  };

  const initials = (s: string) => s.slice(0, 2).toUpperCase();

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <button
          onClick={() => setLocation("/")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {isLoading || !video ? (
          <div className="grid place-items-center py-32 text-zinc-500">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black aspect-video shadow-2xl shadow-black/40">
                <video
                  ref={videoRef}
                  src={video.videoUrl}
                  poster={video.thumbnail ?? undefined}
                  controls
                  autoPlay
                  className="h-full w-full"
                />
              </div>

              <div>
                <h1 className="text-2xl font-bold leading-tight">{video.title}</h1>
                <div className="mt-2 flex items-center gap-4 text-sm text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-4 w-4" /> {video.views ?? 0} views
                  </span>
                  {video.createdAt && (
                    <span>
                      {formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl glass p-4">
                <button
                  type="button"
                  onClick={() => setLocation(`/profile/${video.userId}`)}
                  className="flex items-center gap-3 min-w-0 group/author rounded-xl hover:bg-white/5 -m-1 p-1 transition"
                >
                  <Avatar className="h-11 w-11">
                    <AvatarFallback
                      className="text-white text-sm font-semibold"
                      style={{
                        background: `linear-gradient(135deg, ${video.authorColor ?? "#6366f1"}, #1e1b4b)`,
                      }}
                    >
                      {initials(video.authorDisplayName || video.authorUsername)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 text-left">
                    <p className="font-semibold truncate group-hover/author:text-violet-200 transition">
                      {video.authorDisplayName || video.authorUsername}
                    </p>
                    <p className="text-xs text-zinc-400">@{video.authorUsername}</p>
                  </div>
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={onLike}
                    className={
                      liked
                        ? "rounded-xl border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/20"
                        : "rounded-xl border-white/15 hover:bg-white/10"
                    }
                  >
                    <Heart className={`h-4 w-4 mr-2 ${liked ? "fill-current" : ""}`} />
                    {likeCount}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onSave}
                    className={
                      saved
                        ? "rounded-xl border-violet-400/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/20"
                        : "rounded-xl border-white/15 hover:bg-white/10"
                    }
                  >
                    <Bookmark className={`h-4 w-4 mr-2 ${saved ? "fill-current" : ""}`} />
                    {saved ? "Saved" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onShare}
                    className="rounded-xl border-white/15 hover:bg-white/10"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                </div>
              </div>

              {video.description && (
                <div className="rounded-2xl glass p-5 whitespace-pre-wrap text-sm text-zinc-200">
                  <RichText>{video.description}</RichText>
                </div>
              )}

              {related && related.length > 0 && (
                <section className="pt-2">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-4 w-4 text-violet-300" />
                    <h2 className="text-lg font-bold">Up next</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-8">
                    {related.map((v) => (
                      <VideoCard key={v.id} video={v} />
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl glass p-5">
                <h3 className="font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> Comments
                  <span className="text-zinc-500 text-xs font-normal">({comments?.length ?? 0})</span>
                </h3>

                <form onSubmit={onComment} className="mt-4 flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={user ? "Add a comment…" : "Sign in to comment"}
                    disabled={!user || posting}
                    className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-violet-400/40"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!user || !draft.trim() || posting}
                    className="rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:opacity-90 border-0"
                  >
                    {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>

                <ul className="mt-5 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                  {comments && comments.length > 0 ? (
                    comments.map((c) => (
                      <CommentItem
                        key={c.id}
                        comment={c}
                        canEdit={!!user && user.id === c.userId}
                        canDelete={!!user && (user.id === c.userId || user.id === video.userId)}
                        onChanged={() =>
                          qc.invalidateQueries({ queryKey: [`/api/videos/${id}/comments`] })
                        }
                      />
                    ))
                  ) : (
                    <li className="py-8 text-center text-sm text-zinc-500">
                      No comments yet. Start the conversation.
                    </li>
                  )}
                </ul>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function CommentItem({
  comment,
  canEdit,
  canDelete,
  onChanged,
}: {
  comment: CommentRow;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [busy, setBusy] = useState(false);

  const initials = (comment.displayName || comment.username).slice(0, 2).toUpperCase();

  const save = async () => {
    if (!draft.trim() || draft === comment.content) {
      setEditing(false);
      setDraft(comment.content);
      return;
    }
    setBusy(true);
    const r = await fetch(`/api/comments/${comment.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft.trim() }),
    });
    setBusy(false);
    if (!r.ok) {
      toast({ variant: "destructive", title: "Couldn't save edit" });
      return;
    }
    setEditing(false);
    onChanged();
  };

  const remove = async () => {
    setBusy(true);
    const r = await fetch(`/api/comments/${comment.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    if (!r.ok) {
      toast({ variant: "destructive", title: "Couldn't delete comment" });
      return;
    }
    onChanged();
  };

  return (
    <li className="flex gap-3 animate-float-up group/c">
      <Avatar className="h-8 w-8 shrink-0">
        {comment.avatarUrl && <AvatarImage src={comment.avatarUrl} alt={comment.username} />}
        <AvatarFallback
          className="text-white text-xs font-semibold"
          style={{
            background: `linear-gradient(135deg, ${comment.avatarColor ?? "#6366f1"}, #1e1b4b)`,
          }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold truncate">
            {comment.displayName || comment.username}
          </span>
          <span className="text-xs text-zinc-500 shrink-0">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
          {(canEdit || canDelete) && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-auto opacity-0 group-hover/c:opacity-100 text-zinc-500 hover:text-white transition"
                  aria-label="Comment options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-zinc-900 border-white/10 text-white"
              >
                {canEdit && (
                  <DropdownMenuItem
                    onClick={() => setEditing(true)}
                    className="cursor-pointer focus:bg-white/5"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    onClick={remove}
                    className="cursor-pointer focus:bg-rose-500/20 text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editing ? (
          <div className="mt-1.5 flex items-start gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={500}
              autoFocus
              className="flex-1 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-sm focus:outline-none focus:border-violet-400/40 resize-none"
            />
            <button
              onClick={save}
              disabled={busy}
              className="grid place-items-center h-7 w-7 rounded-md bg-violet-500 hover:bg-violet-400 text-white transition"
              title="Save"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setDraft(comment.content);
              }}
              className="grid place-items-center h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 transition"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-200 mt-0.5 break-words whitespace-pre-wrap">
            <RichText>{comment.content}</RichText>
          </p>
        )}
      </div>
    </li>
  );
}
