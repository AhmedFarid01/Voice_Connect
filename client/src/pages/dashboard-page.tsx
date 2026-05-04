import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { NavBar } from "@/components/nav-bar";
import { Loader2, Eye, Heart, MessageCircle, Users, Film, Upload, Play, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

interface DashboardData {
  videoCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  followers: number;
  topVideos: {
    id: number;
    title: string;
    thumbnail: string | null;
    views: number;
    durationSec: number;
    likeCount: number;
    commentCount: number;
    createdAt: string;
  }[];
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/me/dashboard"],
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <main className="grid place-items-center py-32 text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold">Creator dashboard</h1>
            <p className="text-sm sm:text-base text-zinc-400 mt-1">
              Your numbers across every video and broadcast.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setLocation("/upload")}
              className="rounded-xl bg-white text-black hover:bg-white/90 font-semibold"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            <Button
              onClick={() => setLocation("/go-live")}
              className="rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 hover:opacity-90 text-white border-0 font-semibold shadow-lg shadow-rose-500/30"
            >
              <Radio className="h-4 w-4 mr-2" />
              Go live
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Videos" value={data.videoCount} icon={<Film className="h-4 w-4" />} accent="violet" />
          <StatCard label="Total views" value={data.totalViews} icon={<Eye className="h-4 w-4" />} accent="sky" />
          <StatCard label="Likes" value={data.totalLikes} icon={<Heart className="h-4 w-4" />} accent="rose" />
          <StatCard label="Comments" value={data.totalComments} icon={<MessageCircle className="h-4 w-4" />} accent="emerald" />
          <StatCard label="Followers" value={data.followers} icon={<Users className="h-4 w-4" />} accent="orange" />
        </div>

        <section>
          <h2 className="text-xl font-bold mb-4">Top videos</h2>
          {data.topVideos.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] py-16 px-6 text-center">
              <Film className="h-7 w-7 mx-auto text-zinc-600" />
              <p className="mt-3 text-zinc-400">No videos yet. Upload your first one to start tracking stats.</p>
              <Button
                onClick={() => setLocation("/upload")}
                className="mt-4 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-90 border-0"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.03] text-zinc-400 uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3">Video</th>
                    <th className="text-right px-4 py-3 hidden sm:table-cell">Views</th>
                    <th className="text-right px-4 py-3">Likes</th>
                    <th className="text-right px-4 py-3 hidden md:table-cell">Comments</th>
                    <th className="text-right px-4 py-3 hidden md:table-cell">Posted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.topVideos.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => setLocation(`/watch/${v.id}`)}
                      className="cursor-pointer hover:bg-white/[0.03] transition"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative h-12 w-20 rounded-md overflow-hidden bg-zinc-800 shrink-0">
                            {v.thumbnail ? (
                              <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full grid place-items-center">
                                <Play className="h-4 w-4 text-zinc-500" />
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-white truncate">{v.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                        {v.views.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{v.likeCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {v.commentCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 hidden md:table-cell">
                        {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: "violet" | "sky" | "rose" | "emerald" | "orange";
}) {
  const accents = {
    violet: "from-violet-500/15 to-violet-500/0 text-violet-200 border-violet-400/20",
    sky: "from-sky-500/15 to-sky-500/0 text-sky-200 border-sky-400/20",
    rose: "from-rose-500/15 to-rose-500/0 text-rose-200 border-rose-400/20",
    emerald: "from-emerald-500/15 to-emerald-500/0 text-emerald-200 border-emerald-400/20",
    orange: "from-orange-500/15 to-orange-500/0 text-orange-200 border-orange-400/20",
  }[accent];

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 bg-gradient-to-br ${accents}`}>
      <div className="flex items-center justify-between text-xs uppercase tracking-wider opacity-90">
        <span>{label}</span>
        <span className="opacity-90">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-white">{value.toLocaleString()}</p>
    </div>
  );
}
