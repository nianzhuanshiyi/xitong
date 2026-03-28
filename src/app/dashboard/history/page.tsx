import { HistoryList } from "./history-list";

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">
          历史记录
        </h2>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          最近的选品分析报告（按时间倒序）。
        </p>
      </div>
      <HistoryList />
    </div>
  );
}
