export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 overflow-hidden">
      {/* Sidebar - account/folder list */}
      <div className="w-56 shrink-0 space-y-3 border-r p-3">
        <div className="h-8 w-full animate-pulse rounded bg-slate-200" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-slate-200" />
        ))}
      </div>

      {/* Message list */}
      <div className="w-80 shrink-0 space-y-2 border-r p-3">
        <div className="mb-3 h-9 w-full animate-pulse rounded-lg bg-slate-200" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Mail body */}
      <div className="flex-1 space-y-4 p-6">
        <div className="h-6 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${85 - i * 8}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
