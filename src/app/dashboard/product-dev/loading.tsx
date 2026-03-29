export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header with title and action button */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-200" />
      </div>

      {/* Filter/search bar */}
      <div className="flex gap-3">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-slate-200" />
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
            </div>
            <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="flex gap-2 pt-2">
              <div className="h-6 w-14 animate-pulse rounded-full bg-slate-200" />
              <div className="h-6 w-14 animate-pulse rounded-full bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
