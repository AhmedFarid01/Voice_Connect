import { useEffect, useState } from "react";
import { useSocket } from "@/hooks/use-socket";
import type { LiveReaction } from "@/contexts/live-broadcast";

const REACTIONS = ["❤️", "🔥", "👏", "😂", "🎉", "😮"];

export function ReactionToolbar({
  onSend,
}: {
  onSend: (emoji: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 sm:gap-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 p-1 sm:p-1.5 shadow-lg max-w-full">
      {REACTIONS.map((e) => (
        <button
          key={e}
          onClick={() => onSend(e)}
          className="grid place-items-center h-7 w-7 sm:h-8 sm:w-8 rounded-full hover:bg-white/15 active:scale-90 transition text-sm sm:text-base"
          title={`Send ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/**
 * Floats reactions up the right side of the player. Used by both host and
 * viewer; the host's `reactions` come from the LiveBroadcast context, the
 * viewer's come from a dedicated socket listener.
 */
export function ReactionLayer({ broadcastId }: { broadcastId: number | null }) {
  const socket = useSocket();
  const [items, setItems] = useState<(LiveReaction & { lane: number })[]>([]);

  useEffect(() => {
    if (!socket || !broadcastId) return;
    let seq = 0;
    const onReaction = ({ emoji, ts }: { emoji: string; ts: number }) => {
      const id = ++seq;
      // 4 lanes for visual variety.
      const lane = (id % 4) * 18 + Math.random() * 12;
      setItems((arr) => [...arr.slice(-19), { id, emoji, ts, lane }]);
      window.setTimeout(() => {
        setItems((arr) => arr.filter((r) => r.id !== id));
      }, 3800);
    };
    socket.on("live:reaction", onReaction);
    return () => {
      socket.off("live:reaction", onReaction);
    };
  }, [socket, broadcastId]);

  return (
    <div className="pointer-events-none absolute right-2 sm:right-4 bottom-16 sm:bottom-20 h-[55%] w-20 overflow-hidden">
      {items.map((r) => (
        <span
          key={r.id}
          className="absolute bottom-0 text-2xl sm:text-3xl select-none"
          style={{
            left: `${r.lane}px`,
            animation: "reaction-float 3.4s ease-out forwards",
          }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
