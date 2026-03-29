export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 animate-pulse rounded bg-slate-200" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-200" />
      </div>

      {/* Search/filter bar */}
      <div className="flex gap-3">
        <div className="h-9 flex-1 max-w-sm animate-pulse rounded-lg bg-slate-200" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-200" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border">
        {/* Table header */}
        <div className="flex gap-4 border-b bg-slate-50 px-4 py-3">
          {[120, 160, 100, 80, 80].map((w, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-200" style={{ width: w }} />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
            <div className="h-4 w-[120px] animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-[160px] animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-[100px] animate-pulse rounded bg-slate-200" />
            <div className="h-5 w-[80px] animate-pulse rounded-full bg-slate-200" />
            <div className="h-4 w-[80px] animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
