export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 animate-pulse rounded bg-slate-200" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-slate-200" />
      </div>

      {/* Prompt input area */}
      <div className="h-24 animate-pulse rounded-xl bg-slate-200" />

      {/* Image grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-square animate-pulse rounded-xl bg-slate-200" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
