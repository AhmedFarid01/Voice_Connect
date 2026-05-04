export function VideoCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video rounded-2xl bg-white/5 border border-white/5" />
      <div className="mt-3 flex gap-3">
        <div className="h-9 w-9 rounded-full bg-white/5 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 rounded bg-white/5 w-[85%]" />
          <div className="h-3 rounded bg-white/5 w-[55%]" />
          <div className="h-2.5 rounded bg-white/[0.04] w-[40%]" />
        </div>
      </div>
    </div>
  );
}

export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
