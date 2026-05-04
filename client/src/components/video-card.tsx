import { Link, useLocation } from "wouter";
import { Play, Eye, Heart, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

export interface VideoCardData {
  id: number;
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  videoUrl: string;
  durationSec?: number | null;
  views?: number | null;
  category?: string | null;
  createdAt?: string | Date | null;
  userId: number;
  authorUsername: string;
  authorDisplayName?: string | null;
  authorColor?: string | null;
  likeCount?: number;
  commentCount?: number;
}

function formatDuration(sec?: number | null) {
  if (!sec || sec < 1) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatNumber(n?: number | null) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function VideoCard({
  video,
  progressPct,
}: {
  video: VideoCardData;
  progressPct?: number;
}) {
  const [, setLocation] = useLocation();
  const author = video.authorDisplayName || video.authorUsername;
  const initials = author.slice(0, 2).toUpperCase();
  const duration = formatDuration(video.durationSec);

  const goToAuthor = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocation(`/profile/${video.userId}`);
  };

  return (
    <Link href={`/watch/${video.id}`}>
      <a className="group block animate-float-up">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 transition-all group-hover:border-white/20 group-hover:shadow-2xl group-hover:shadow-violet-500/10">
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt={video.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background: `linear-gradient(135deg, ${video.authorColor ?? "#6366f1"}40, #0f0f1a)`,
              }}
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-80 transition-opacity group-hover:opacity-100" />

          <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
            <div className="grid place-items-center h-14 w-14 rounded-full bg-white/95 text-black shadow-xl">
              <Play className="h-6 w-6 fill-current ml-0.5" />
            </div>
          </div>

          {duration && (
            <div className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
              {duration}
            </div>
          )}

          {video.category && (
            <div className="absolute top-2 left-2 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-white/90">
              {video.category}
            </div>
          )}

          {typeof progressPct === "number" && progressPct > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <div
                className="h-full bg-gradient-to-r from-violet-400 to-fuchsia-400"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={goToAuthor}
            className="mt-0.5 rounded-full hover:ring-2 hover:ring-violet-400/40 transition"
            aria-label={`Open ${author}'s profile`}
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback
                className="text-white text-xs font-semibold"
                style={{
                  background: `linear-gradient(135deg, ${video.authorColor ?? "#6366f1"}, #1e1b4b)`,
                }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white line-clamp-2 group-hover:text-violet-200 transition-colors">
              {video.title}
            </h3>
            <button
              type="button"
              onClick={goToAuthor}
              className="mt-1 text-xs text-zinc-400 hover:text-violet-300 transition"
            >
              {author}
            </button>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {formatNumber(video.views)}
              </span>
              {video.likeCount !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  {formatNumber(video.likeCount)}
                </span>
              )}
              {video.commentCount !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  {formatNumber(video.commentCount)}
                </span>
              )}
              {video.createdAt && (
                <span>
                  · {formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        </div>
      </a>
    </Link>
  );
}
