import { Link, useLocation } from "wouter";
import { Radio, Users, X, ArrowUpRight } from "lucide-react";
import { useLiveBroadcast } from "@/contexts/live-broadcast";
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

export function LiveBar() {
  const { isBroadcasting, broadcastId, title, viewerCount, end } = useLiveBroadcast();
  const [location] = useLocation();

  if (!isBroadcasting || !broadcastId) return null;
  if (location === "/go-live") return null;

  return (
    <div className="fixed bottom-3 sm:bottom-4 inset-x-0 z-50 flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 max-w-full rounded-2xl bg-gradient-to-r from-rose-600/95 via-rose-500/95 to-orange-500/95 backdrop-blur-md border border-white/15 px-3 sm:px-4 py-2 sm:py-2.5 shadow-2xl shadow-rose-500/40 animate-float-up">
        <span className="grid place-items-center h-8 w-8 rounded-lg bg-white/20 shrink-0">
          <Radio className="h-4 w-4 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs uppercase tracking-widest text-white/80 font-bold leading-none">
            You're live
          </p>
          <p className="text-xs sm:text-sm font-semibold text-white truncate max-w-[44vw] sm:max-w-[260px] leading-tight">
            {title ?? "Streaming"}
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 text-xs text-white/90 px-2 py-1 rounded-md bg-white/15 shrink-0">
          <Users className="h-3 w-3" />
          {viewerCount}
        </span>
        <Link href="/go-live">
          <a
            className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg bg-white/15 hover:bg-white/25 px-2 sm:px-3 py-1.5 text-white transition shrink-0"
            title="Go to broadcaster view"
          >
            <span className="hidden sm:inline">Open</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Link>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="inline-flex items-center gap-1 text-xs font-semibold rounded-lg bg-black/40 hover:bg-black/60 px-2 sm:px-2.5 py-1.5 text-white transition shrink-0"
              title="End broadcast"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">End</span>
            </button>
          </AlertDialogTrigger>
          <EndBroadcastDialog onEnd={() => end()} />
        </AlertDialog>
      </div>
    </div>
  );
}

export function EndBroadcastDialog({ onEnd }: { onEnd: () => void }) {
  return (
    <AlertDialogContent className="bg-zinc-950 border-white/10 text-white">
      <AlertDialogHeader>
        <AlertDialogTitle>End your broadcast?</AlertDialogTitle>
        <AlertDialogDescription className="text-zinc-400">
          Viewers will be disconnected and the stream will close. You can start a new
          one at any time.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="bg-white/5 border-white/15 hover:bg-white/10 text-white">
          Keep streaming
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onEnd}
          className="bg-rose-500 hover:bg-rose-400 text-white border-0"
        >
          End broadcast
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
