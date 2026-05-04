import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { NavBar } from "@/components/nav-bar";
import { BroadcastCard, type BroadcastCardData } from "@/components/broadcast-card";
import { Button } from "@/components/ui/button";
import { Loader2, Radio, Sparkles } from "lucide-react";

export default function LivePage() {
  const [, setLocation] = useLocation();
  const { data: live, isLoading } = useQuery<BroadcastCardData[]>({
    queryKey: ["/api/broadcasts"],
    refetchInterval: 8_000,
  });

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-rose-300 bg-rose-500/10 border border-rose-400/20 rounded-full px-3 py-1">
              <Sparkles className="h-3 w-3" />
              Live broadcasts
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold">Tune in to creators streaming right now.</h1>
          </div>
          <Button
            onClick={() => setLocation("/go-live")}
            className="rounded-xl h-11 px-5 bg-gradient-to-r from-rose-500 to-orange-400 hover:opacity-90 border-0 font-semibold shadow-lg shadow-rose-500/30"
          >
            <Radio className="h-4 w-4 mr-2" />
            Go live now
          </Button>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-24 text-zinc-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !live || live.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] py-20 px-6 text-center">
            <div
              className="mx-auto h-16 w-16 rounded-2xl grid place-items-center mb-4"
              style={{ background: "linear-gradient(135deg, #f43f5e, #f97316)" }}
            >
              <Radio className="h-7 w-7 text-white" />
            </div>
            <p className="text-lg font-semibold">No one is live right now</p>
            <p className="mt-1 text-zinc-400">Be the first to go live and gather an audience.</p>
            <Button
              onClick={() => setLocation("/go-live")}
              className="mt-6 rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 hover:opacity-90 border-0"
            >
              <Radio className="h-4 w-4 mr-2" />
              Start broadcasting
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
            {live.map((b) => (
              <BroadcastCard key={b.id} broadcast={b} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
