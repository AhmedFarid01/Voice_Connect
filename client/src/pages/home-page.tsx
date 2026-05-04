import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "@/components/nav-bar";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { VideoGridSkeleton } from "@/components/video-card-skeleton";
import { BroadcastCard, type BroadcastCardData } from "@/components/broadcast-card";
import { Button } from "@/components/ui/button";
import { Flame, Radio, Sparkles, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = ["All", "Music", "Gaming", "Education", "Comedy", "Tech", "Lifestyle", "General"];
type Feed = "trending" | "following";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [feed, setFeed] = useState<Feed>("trending");

  // Honour ?search=#tag from hashtag links so the feed jumps straight to results.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("search");
    if (q) {
      setSearch(q);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const baseParams = new URLSearchParams();
  baseParams.set("feed", feed);
  if (category && category !== "All") baseParams.set("category", category);
  if (search.trim()) baseParams.set("search", search.trim());
  const baseKey = baseParams.toString();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{ items: VideoCardData[]; nextCursor: number | null }>({
    queryKey: ["videos", baseKey],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams(baseKey);
      if (pageParam) params.set("cursor", String(pageParam));
      const res = await fetch(`/api/videos?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const videos = data?.pages.flatMap((p) => p.items) ?? [];

  // Sentinel-driven infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: liveBroadcasts } = useQuery<BroadcastCardData[]>({
    queryKey: ["/api/broadcasts"],
    refetchInterval: 10_000,
  });

  return (
    <div className="min-h-screen">
      <NavBar onSearch={setSearch} searchValue={search} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10 sm:space-y-12">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-12">
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(700px 400px at 10% 20%, rgba(167,139,250,0.35), transparent 60%), radial-gradient(700px 400px at 90% 80%, rgba(244,114,182,0.25), transparent 60%), linear-gradient(135deg, #14102a, #0d0a1e)",
            }}
          />
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-300 bg-violet-500/10 border border-violet-400/20 rounded-full px-3 py-1">
              <Sparkles className="h-3 w-3" />
              Welcome to Lumen
            </p>
            <h1 className="mt-4 text-3xl sm:text-5xl font-bold leading-tight">
              Watch, share, and <span className="gradient-text">go live</span>.
            </h1>
            <p className="mt-3 text-zinc-300 text-lg">
              Discover videos from creators around the world, or hop on a live broadcast right now.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={() => setLocation("/upload")}
                className="bg-white text-black hover:bg-white/90 rounded-xl h-11 px-5 font-semibold"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload a video
              </Button>
              <Button
                onClick={() => setLocation("/go-live")}
                variant="outline"
                className="rounded-xl h-11 px-5 font-semibold border-white/20 hover:bg-white/10"
              >
                <Radio className="h-4 w-4 mr-2" />
                Go live
              </Button>
            </div>
          </div>
        </section>

        {/* Live broadcasts */}
        {liveBroadcasts && liveBroadcasts.length > 0 && (
          <section>
            <SectionHeader
              title="Live now"
              icon={<span className="live-pulse">Live</span>}
              cta={{ label: "See all", onClick: () => setLocation("/live") }}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
              {liveBroadcasts.slice(0, 4).map((b) => (
                <BroadcastCard key={b.id} broadcast={b} />
              ))}
            </div>
          </section>
        )}

        {/* Feed tabs */}
        <section>
          <div className="mb-5 flex items-center gap-2 border-b border-white/10">
            <FeedTab
              label="Trending"
              icon={<Flame className="h-4 w-4" />}
              active={feed === "trending"}
              onClick={() => setFeed("trending")}
            />
            <FeedTab
              label="Following"
              icon={<Users className="h-4 w-4" />}
              active={feed === "following"}
              onClick={() => setFeed("following")}
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition",
                  c === category
                    ? "bg-white text-black"
                    : "bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10",
                )}
              >
                {c}
              </button>
            ))}
          </div>

          {isLoading ? (
            <VideoGridSkeleton />
          ) : videos.length === 0 ? (
            feed === "following" ? (
              <EmptyState
                title="Your following feed is empty"
                desc="Follow some creators and their videos will show up here."
                action={
                  <Button
                    onClick={() => setFeed("trending")}
                    className="bg-white text-black hover:bg-white/90 rounded-xl"
                  >
                    <Flame className="h-4 w-4 mr-2" />
                    Browse Trending
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No videos yet"
                desc="Be the first to upload — your audience is waiting."
                action={
                  <Button
                    onClick={() => setLocation("/upload")}
                    className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-90 rounded-xl"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload your first video
                  </Button>
                }
              />
            )
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
                {videos.map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
              <div ref={sentinelRef} className="h-12" />
              {isFetchingNextPage && (
                <div className="grid place-items-center pb-8 text-zinc-500">
                  <div className="h-6 w-6 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function SectionHeader({
  title,
  icon,
  cta,
}: {
  title: string;
  icon?: React.ReactNode;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {icon}
      <h2 className="text-xl font-bold">{title}</h2>
      {cta && (
        <button
          onClick={cta.onClick}
          className="ml-auto text-sm text-violet-300 hover:text-violet-200"
        >
          {cta.label} →
        </button>
      )}
    </div>
  );
}

function FeedTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
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
      {label}
      {active && (
        <span className="absolute inset-x-3 -bottom-px h-0.5 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-400 rounded-full" />
      )}
    </button>
  );
}

function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-16 px-6 text-center">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-1 text-zinc-400">{desc}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
