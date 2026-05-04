import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, UserX } from "lucide-react";

interface FollowUser {
  id: number;
  username: string;
  displayName: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export function FollowListDialog({
  open,
  onOpenChange,
  userId,
  kind,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: number;
  kind: "followers" | "following";
}) {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<FollowUser[]>({
    queryKey: [`/api/users/${userId}/${kind}`],
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-md p-0">
        <DialogHeader className="px-5 py-4 border-b border-white/10">
          <DialogTitle className="text-lg">
            {kind === "followers" ? "Followers" : "Following"}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="grid place-items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : !data || data.length === 0 ? (
            <div className="py-12 text-center px-6">
              <UserX className="h-7 w-7 text-zinc-600 mx-auto" />
              <p className="mt-3 text-sm text-zinc-400">
                {kind === "followers"
                  ? "No followers yet."
                  : "Not following anyone yet."}
              </p>
            </div>
          ) : (
            <ul className="py-2">
              {data.map((u) => {
                const display = u.displayName || u.username;
                const initials = display.slice(0, 2).toUpperCase();
                return (
                  <li key={u.id}>
                    <button
                      onClick={() => {
                        onOpenChange(false);
                        setLocation(`/profile/${u.id}`);
                      }}
                      className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition"
                    >
                      <Avatar className="h-10 w-10">
                        {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.username} />}
                        <AvatarFallback
                          className="text-white text-xs font-semibold"
                          style={{
                            background: `linear-gradient(135deg, ${u.avatarColor ?? "#6366f1"}, #1e1b4b)`,
                          }}
                        >
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{display}</p>
                        <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
                        {u.bio && (
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{u.bio}</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
