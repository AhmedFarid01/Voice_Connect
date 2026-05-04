import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Heart, MessageCircle, UserPlus, Radio } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSocket } from "@/hooks/use-socket";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: number;
  type: "follow" | "like" | "comment" | "live";
  videoId: number | null;
  broadcastId: number | null;
  content: string | null;
  read: boolean;
  createdAt: string;
  actorId: number | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorColor: string | null;
  actorAvatarUrl: string | null;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

export function NotificationBell() {
  const qc = useQueryClient();
  const socket = useSocket();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["/api/notifications"],
  });

  useEffect(() => {
    if (!socket) return;
    const onNew = () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    };
    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
  }, [socket, qc]);

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const onOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next && unread > 0) {
      try {
        await fetch("/api/notifications/mark-read", { method: "POST", credentials: "include" });
        qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      } catch {
        /* ignore */
      }
    }
  };

  const click = (n: NotificationItem) => {
    setOpen(false);
    if (n.type === "live" && n.broadcastId) setLocation(`/live/${n.broadcastId}`);
    else if ((n.type === "like" || n.type === "comment") && n.videoId) setLocation(`/watch/${n.videoId}`);
    else if (n.type === "follow" && n.actorId) setLocation(`/profile/${n.actorId}`);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative grid place-items-center h-9 w-9 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
          aria-label="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center shadow shadow-rose-500/40 ring-2 ring-black/40">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="w-[min(calc(100vw-1.5rem),360px)] p-0 bg-zinc-950/95 backdrop-blur-xl border-white/10 text-white"
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <p className="font-semibold">Notifications</p>
          <span className="text-xs text-zinc-500">
            {items.length === 0 ? "Nothing yet" : `${items.length} recent`}
          </span>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-12 text-center px-6">
              <div className="mx-auto h-10 w-10 rounded-xl grid place-items-center bg-violet-500/10 border border-violet-400/20 text-violet-300 mb-3">
                <Bell className="h-4 w-4" />
              </div>
              <p className="text-sm text-zinc-400">
                No notifications yet. Follow some creators and they'll show up here.
              </p>
            </div>
          ) : (
            <ul className="py-1">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => click(n)}
                    className={cn(
                      "w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition",
                      !n.read && "bg-violet-500/[0.06]",
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-9 w-9">
                        {n.actorAvatarUrl && (
                          <AvatarImage src={n.actorAvatarUrl} alt={n.actorUsername ?? ""} />
                        )}
                        <AvatarFallback
                          className="text-white text-xs font-semibold"
                          style={{
                            background: `linear-gradient(135deg, ${n.actorColor ?? "#6366f1"}, #1e1b4b)`,
                          }}
                        >
                          {(n.actorDisplayName || n.actorUsername || "?")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full grid place-items-center ring-2 ring-zinc-950",
                          n.type === "follow" && "bg-violet-500",
                          n.type === "like" && "bg-rose-500",
                          n.type === "comment" && "bg-sky-500",
                          n.type === "live" && "bg-orange-500",
                        )}
                      >
                        {n.type === "follow" && <UserPlus className="h-2.5 w-2.5 text-white" />}
                        {n.type === "like" && <Heart className="h-2.5 w-2.5 text-white" />}
                        {n.type === "comment" && <MessageCircle className="h-2.5 w-2.5 text-white" />}
                        {n.type === "live" && <Radio className="h-2.5 w-2.5 text-white" />}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-tight">
                        <span className="font-semibold">
                          {n.actorDisplayName || n.actorUsername || "Someone"}
                        </span>{" "}
                        <span className="text-zinc-300">{labelFor(n)}</span>
                      </p>
                      {n.content && (
                        <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">{n.content}</p>
                      )}
                      <p className="mt-1 text-[11px] text-zinc-600">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-2 h-2 w-2 rounded-full bg-violet-400 shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function labelFor(n: NotificationItem) {
  switch (n.type) {
    case "follow":
      return "started following you";
    case "like":
      return "liked your video";
    case "comment":
      return "commented on your video";
    case "live":
      return "is live now";
  }
}
