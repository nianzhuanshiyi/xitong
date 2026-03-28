import { Sparkles } from "lucide-react";

export function SectionPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-slate-300/90 bg-white p-10 text-center shadow-sm ring-1 ring-slate-100 transition-all duration-300 hover:border-indigo-200/80 hover:shadow-md hover:ring-indigo-100/60">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-transparent to-violet-50/60"
          aria-hidden
        />
        <div className="relative mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-primary-soft text-indigo-600 ring-1 ring-indigo-100">
          <Sparkles className="size-6" strokeWidth={1.75} />
        </div>
        <h2 className="relative font-heading text-lg font-semibold text-slate-900">{title}</h2>
        <p className="relative mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
    </div>
  );
}
