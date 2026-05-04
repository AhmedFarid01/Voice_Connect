import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "@/components/nav-bar";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { VideoGridSkeleton } from "@/components/video-card-skeleton";
import { Button } from "@/components/ui/button";
import { Bookmark, History, Trash2, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Tab = "history" | "saved";

interface HistoryRow extends VideoCardData {
  progressSec: number;
  completed: boolean;
  lastWatchedAt: string;
}

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>("history");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: history, isLoading: historyLoading } = useQuery<HistoryRow[]>({
    queryKey: ["/api/me/history"],
    enabled: tab === "history",
  });

  const { data: saves, isLoading: savesLoading } = useQuery<VideoCardData[]>({
    queryKey: ["/api/me/saves"],
    enabled: tab === "saved",
  });

  const clearAll = async () => {
    const r = await fetch("/api/me/history", { method: "DELETE", credentials: "include" });
    if (r.ok) {
      toast({ title: "Watch history cleared" });
      qc.invalidateQueries({ queryKey: ["/api/me/history"] });
    } else {
      toast({ variant: "destructive", title: "Couldn't clear history" });
    }
  };

  const removeOne = async (videoId: number) => {
    const r = await fetch(`/api/me/history/${videoId}`, { method: "DELETE", credentials: "include" });
    if (r.ok) qc.invalidateQueries({ queryKey: ["/api/me/history"] });
  };

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Library</h1>
            <p className="text-zinc-400 mt-1">Pick up where you left off, or revisit something you saved.</p>
          </div>
          {tab === "history" && history && history.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="rounded-xl border-white/15 hover:bg-white/10">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear history
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-950 border-white/10 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all watch history?</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400">
                    This permanently removes every video from your watch history and resets your
                    "Continue watching" rail. Saved videos are unaffected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/5 border-white/15 hover:bg-white/10 text-white">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={clearAll}
                    className="bg-rose-500 hover:bg-rose-400 text-white border-0"
                  >
                    Clear history
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <div className="border-b border-white/10 flex items-center gap-1 mb-8">
          <TabBtn active={tab === "history"} icon={<History className="h-4 w-4" />} onClick={() => setTab("history")}>
            History
          </TabBtn>
          <TabBtn active={tab === "saved"} icon={<Bookmark className="h-4 w-4" />} onClick={() => setTab("saved")}>
            Saved
          </TabBtn>
        </div>

        {tab === "history" ? (
          historyLoading ? (
            <VideoGridSkeleton count={8} />
          ) : !history || history.length === 0 ? (
            <Empty
              icon={<History className="h-7 w-7" />}
              title="No watch history yet"
              desc="Videos you watch will appear here so you can come back to them."
              cta={{ label: "Browse videos", onClick: () => setLocation("/") }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
              {history.map((v) => (
                <HistoryCard key={v.id} video={v} onRemove={() => removeOne(v.id)} />
              ))}
            </div>
          )
        ) : savesLoading ? (
          <VideoGridSkeleton count={8} />
        ) : !saves || saves.length === 0 ? (
          <Empty
            icon={<Bookmark className="h-7 w-7" />}
            title="No saved videos"
            desc='Tap the "Save" button on any video and it lands here.'
            cta={{ label: "Browse videos", onClick: () => setLocation("/") }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
            {saves.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TabBtn({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold transition",
        active ? "text-white" : "text-zinc-500 hover:text-zinc-200",
      )}
    >
      {icon}
      {children}
      {active && (
        <span className="absolute inset-x-3 -bottom-px h-0.5 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-400 rounded-full" />
      )}
    </button>
  );
}

function Empty({
  icon,
  title,
  desc,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.02] py-20 px-6 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-violet-500/15 border border-violet-400/20 text-violet-200 mb-4">
        {icon}
      </div>
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1 text-zinc-400">{desc}</p>
      {cta && (
        <Button
          onClick={cta.onClick}
          className="mt-6 rounded-xl bg-white text-black hover:bg-white/90 font-semibold"
        >
          {cta.label}
        </Button>
      )}
    </div>
  );
}

function HistoryCard({ video, onRemove }: { video: HistoryRow; onRemove: () => void }) {
  const pct =
    video.durationSec && video.progressSec
      ? Math.min(100, Math.round((video.progressSec / video.durationSec) * 100))
      : 0;
  return (
    <div className="relative group/hist">
      <VideoCard video={video} />
      {pct > 0 && !video.completed && (
        <div className="absolute left-0 right-0 top-[calc(56.25%-2px)] sm:top-auto pointer-events-none">
          <div className="mx-0 h-1 bg-black/40 rounded-b-2xl overflow-hidden -mt-1">
            <div
              className="h-full bg-gradient-to-r from-violet-400 to-fuchsia-400"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          {video.completed ? (
            <>Watched {formatDistanceToNow(new Date(video.lastWatchedAt), { addSuffix: true })}</>
          ) : pct > 0 ? (
            <>
              <Play className="h-3 w-3 text-violet-300 fill-current" />
              {pct}% watched · {formatDistanceToNow(new Date(video.lastWatchedAt), { addSuffix: true })}
            </>
          ) : (
            <>{formatDistanceToNow(new Date(video.lastWatchedAt), { addSuffix: true })}</>
          )}
        </span>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover/hist:opacity-100 hover:text-rose-300 transition"
          title="Remove from history"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
