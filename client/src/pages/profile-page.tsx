import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { NavBar } from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { VideoGridSkeleton } from "@/components/video-card-skeleton";
import { BroadcastCard, type BroadcastCardData } from "@/components/broadcast-card";
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
import { Trash2 } from "lucide-react";
import { FollowListDialog } from "@/components/follow-list-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import {
  ArrowLeft, UserPlus, UserCheck, Loader2, Pencil, Save, X, Film, Eye, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileData {
  id: number;
  username: string;
  displayName: string | null;
  avatarColor: string | null;
  avatarUrl?: string | null;
  bio: string | null;
  status: string | null;
  videoCount: number;
  followers: number;
  followingCount: number;
  profileViews: number;
  following: boolean;
  isMe: boolean;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#14b8a6",
];

export default function ProfilePage() {
  const [, params] = useRoute("/profile/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user: currentUser } = useUser();

  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: [`/api/users/${id}`],
    enabled: Number.isFinite(id),
  });

  const { data: videos } = useQuery<VideoCardData[]>({
    queryKey: [`/api/users/${id}/videos`],
    enabled: Number.isFinite(id),
  });

  const { data: topVideos } = useQuery<VideoCardData[]>({
    queryKey: [`/api/users/${id}/top-videos`],
    enabled: Number.isFinite(id),
  });

  const { data: liveBroadcasts } = useQuery<BroadcastCardData[]>({
    queryKey: [`/api/users/${id}/broadcasts`],
    enabled: Number.isFinite(id),
    refetchInterval: 15_000,
  });

  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ displayName: "", bio: "", avatarColor: "#6366f1" });
  const [saving, setSaving] = useState(false);
  const [followListOpen, setFollowListOpen] = useState<null | "followers" | "following">(null);

  useEffect(() => {
    if (profile) {
      setFollowing(profile.following);
      setFollowerCount(profile.followers);
      setDraft({
        displayName: profile.displayName ?? profile.username,
        bio: profile.bio ?? "",
        avatarColor: profile.avatarColor ?? "#6366f1",
      });
    }
  }, [profile]);

  const onFollow = async () => {
    if (!profile) return;
    setFollowLoading(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setFollowerCount((n) => n + (wasFollowing ? -1 : 1));
    try {
      const r = await fetch(`/api/users/${profile.id}/follow`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      const display = profile.displayName || profile.username;
      toast({
        title: wasFollowing ? `Unfollowed ${display}` : `Following ${display}`,
        description: wasFollowing
          ? "You'll stop seeing their videos in your following feed."
          : "Their new videos and live streams will show up in your feed.",
      });
    } catch {
      setFollowing(wasFollowing);
      setFollowerCount((n) => n + (wasFollowing ? 1 : -1));
      toast({ variant: "destructive", title: "Couldn't update follow" });
    } finally {
      setFollowLoading(false);
    }
  };

  const onDeleteVideo = async (videoId: number) => {
    try {
      const r = await fetch(`/api/videos/${videoId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      qc.invalidateQueries({ queryKey: [`/api/users/${id}/videos`] });
      qc.invalidateQueries({ queryKey: [`/api/users/${id}/top-videos`] });
      qc.invalidateQueries({ queryKey: [`/api/users/${id}`] });
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast({ title: "Video deleted" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't delete", description: err?.message });
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error(await r.text());
      qc.invalidateQueries({ queryKey: [`/api/users/${id}`] });
      qc.invalidateQueries({ queryKey: ["user"] });
      setEditing(false);
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't save", description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (!Number.isFinite(id)) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
          <p className="text-zinc-400">Invalid user.</p>
        </main>
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="grid place-items-center py-32 text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin" />
        </main>
      </div>
    );
  }

  const display = profile.displayName || profile.username;
  const initials = display.slice(0, 2).toUpperCase();
  const color = editing ? draft.avatarColor : profile.avatarColor ?? "#6366f1";

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <button
          onClick={() => setLocation("/")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Header card */}
        <section
          className="relative overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-8"
          style={{
            background: `radial-gradient(900px 400px at 0% 0%, ${color}33, transparent 60%), linear-gradient(135deg, #14102a, #0d0a1e)`,
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 sm:gap-6">
            <div className="flex items-center gap-4 sm:gap-5 min-w-0">
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24 ring-4 ring-white/10 shrink-0">
                {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt={display} />}
                <AvatarFallback
                  className="text-white text-2xl font-bold"
                  style={{ background: `linear-gradient(135deg, ${color}, #1e1b4b)` }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                {editing ? (
                  <Input
                    value={draft.displayName}
                    onChange={(e) => setDraft((p) => ({ ...p, displayName: e.target.value }))}
                    className="bg-white/10 border-white/15 h-10 rounded-xl text-2xl font-bold"
                    placeholder="Display name"
                    maxLength={60}
                  />
                ) : (
                  <h1 className="text-2xl sm:text-4xl font-bold truncate">{display}</h1>
                )}
                <p className="text-sm text-zinc-400 mt-1">@{profile.username}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <Stat label="Videos" value={profile.videoCount} />
                  <Dot />
                  <button
                    onClick={() => setFollowListOpen("followers")}
                    className="hover:text-white transition"
                  >
                    <Stat label="Followers" value={followerCount} />
                  </button>
                  <Dot />
                  <button
                    onClick={() => setFollowListOpen("following")}
                    className="hover:text-white transition"
                  >
                    <Stat label="Following" value={profile.followingCount} />
                  </button>
                  <Dot />
                  <Stat label="Profile views" value={profile.profileViews} icon={<Eye className="h-3.5 w-3.5" />} />
                </div>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              {profile.isMe ? (
                editing ? (
                  <>
                    <Button
                      onClick={onSave}
                      disabled={saving}
                      className="rounded-xl bg-white text-black hover:bg-white/90"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditing(false)}
                      className="rounded-xl border-white/15 hover:bg-white/10"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setEditing(true)}
                    className="rounded-xl border-white/15 hover:bg-white/10"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit profile
                  </Button>
                )
              ) : (
                <Button
                  onClick={onFollow}
                  disabled={followLoading || !currentUser}
                  className={cn(
                    "rounded-xl font-semibold",
                    following
                      ? "bg-white/10 text-white hover:bg-white/15 border border-white/15"
                      : "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 hover:opacity-90 border-0 shadow-lg shadow-fuchsia-500/30",
                  )}
                >
                  {following ? (
                    <>
                      <UserCheck className="h-4 w-4 mr-2" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Follow
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Bio + edit fields */}
          <div className="mt-6">
            {editing ? (
              <>
                <Textarea
                  value={draft.bio}
                  onChange={(e) => setDraft((p) => ({ ...p, bio: e.target.value }))}
                  rows={3}
                  maxLength={280}
                  placeholder="A short bio…"
                  className="bg-white/5 border-white/10 rounded-xl resize-none"
                />
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Avatar color</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDraft((p) => ({ ...p, avatarColor: c }))}
                        className={cn(
                          "h-8 w-8 rounded-full transition-all",
                          draft.avatarColor === c
                            ? "ring-2 ring-white ring-offset-2 ring-offset-transparent scale-110"
                            : "ring-1 ring-white/15 hover:scale-105",
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : profile.bio ? (
              <p className="max-w-2xl text-zinc-200 whitespace-pre-wrap">{profile.bio}</p>
            ) : (
              <p className="text-sm text-zinc-500 italic">
                {profile.isMe ? "Add a bio so people get to know you." : "No bio yet."}
              </p>
            )}
          </div>
        </section>

        {/* Live now */}
        {liveBroadcasts && liveBroadcasts.length > 0 && (
          <section className="mt-10">
            <div className="flex items-center gap-3 mb-6">
              <span className="live-pulse">Live</span>
              <h2 className="text-xl font-bold">
                {profile.isMe ? "You're streaming" : `${display} is live`}
              </h2>
              <span className="text-zinc-500 text-sm">({liveBroadcasts.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8">
              {liveBroadcasts.map((b) => (
                <BroadcastCard key={b.id} broadcast={b} />
              ))}
            </div>
          </section>
        )}

        {/* Most liked */}
        {topVideos && topVideos.length > 0 && (
          <section className="mt-10">
            <div className="flex items-center gap-3 mb-6">
              <span className="grid place-items-center h-7 w-7 rounded-lg bg-orange-500/15 border border-orange-400/30 text-orange-300">
                <Flame className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold">Most liked</h2>
              <span className="text-zinc-500 text-sm">({topVideos.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8">
              {topVideos.map((v) => (
                <VideoSlot
                  key={v.id}
                  video={v}
                  showDelete={profile.isMe}
                  onDelete={() => onDeleteVideo(v.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Videos */}
        <section className="mt-10">
          <div className="flex items-baseline gap-2 mb-6">
            <h2 className="text-xl font-bold">All videos</h2>
            <span className="text-zinc-500 text-sm">({videos?.length ?? 0})</span>
          </div>

          {!videos ? (
            <VideoGridSkeleton count={6} />
          ) : videos.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-16 px-6 text-center">
              <Film className="h-8 w-8 mx-auto text-zinc-600" />
              <p className="mt-3 text-zinc-400">
                {profile.isMe ? "You haven't uploaded anything yet." : "No videos yet."}
              </p>
              {profile.isMe && (
                <Button
                  onClick={() => setLocation("/upload")}
                  className="mt-4 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-90 border-0"
                >
                  Upload your first video
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8">
              {videos.map((v) => (
                <VideoSlot
                  key={v.id}
                  video={v}
                  showDelete={profile.isMe}
                  onDelete={() => onDeleteVideo(v.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <FollowListDialog
        open={followListOpen !== null}
        onOpenChange={(v) => !v && setFollowListOpen(null)}
        userId={profile.id}
        kind={followListOpen ?? "followers"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-zinc-300">
      {icon && <span className="text-zinc-500">{icon}</span>}
      <strong className="text-white tabular-nums">{value.toLocaleString()}</strong>{" "}
      <span className="text-zinc-500">{label}</span>
    </span>
  );
}

function Dot() {
  return <span className="text-zinc-700">•</span>;
}

function VideoSlot({
  video,
  showDelete,
  onDelete,
}: {
  video: VideoCardData;
  showDelete: boolean;
  onDelete: () => void;
}) {
  if (!showDelete) return <VideoCard video={video} />;
  return (
    <div className="relative group/slot">
      <VideoCard video={video} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            className="absolute top-2 right-2 z-10 grid place-items-center h-9 w-9 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-white opacity-0 group-hover/slot:opacity-100 hover:bg-rose-500 transition"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            title="Delete video"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-zinc-950 border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this video?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              "{video.title}" will be removed permanently along with its likes and comments.
              This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/15 hover:bg-white/10 text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-rose-500 hover:bg-rose-400 text-white border-0"
            >
              Delete video
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
