import { Link, useLocation } from "wouter";
import { Users, Radio } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface BroadcastCardData {
  id: number;
  title: string;
  description?: string | null;
  isLive?: boolean | null;
  viewerCount?: number | null;
  startedAt?: string | Date | null;
  hostId: number;
  hostUsername: string;
  hostDisplayName?: string | null;
  hostColor?: string | null;
}

export function BroadcastCard({ broadcast }: { broadcast: BroadcastCardData }) {
  const [, setLocation] = useLocation();
  const host = broadcast.hostDisplayName || broadcast.hostUsername;
  const initials = host.slice(0, 2).toUpperCase();
  const color = broadcast.hostColor ?? "#ef4444";

  const goToHost = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocation(`/profile/${broadcast.hostId}`);
  };

  return (
    <Link href={`/live/${broadcast.id}`}>
      <a className="group block animate-float-up">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 transition-all group-hover:border-rose-400/40 group-hover:shadow-2xl group-hover:shadow-rose-500/20">
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 30% 20%, ${color}55, transparent 60%), linear-gradient(135deg, #1a0b1f, #0a0a14)`,
            }}
          />

          <div className="absolute inset-0 grid place-items-center">
            <Radio className="h-12 w-12 text-white/30 group-hover:text-white/60 transition-colors" />
          </div>

          <div className="absolute top-3 left-3"><span className="live-pulse">Live</span></div>
          <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 px-2 py-1 text-xs font-medium text-white">
            <Users className="h-3 w-3" />
            {broadcast.viewerCount ?? 0}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
            <h3 className="text-sm font-bold text-white line-clamp-2">{broadcast.title}</h3>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={goToHost}
            className="rounded-full hover:ring-2 hover:ring-rose-400/40 transition"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback
                className="text-white text-xs font-semibold"
                style={{ background: `linear-gradient(135deg, ${color}, #1e1b4b)` }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
          <div>
            <button
              type="button"
              onClick={goToHost}
              className="text-sm font-semibold text-white hover:text-rose-200 transition"
            >
              {host}
            </button>
            <p className="text-xs text-zinc-400">Streaming live</p>
          </div>
        </div>
      </a>
    </Link>
  );
}
