"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MODULE_LABELS: Record<string, string> = {
  "au-dev": "澳洲开发",
  analysis: "选品分析",
  "3c-ideas": "3C新品",
  "europe-ideas": "欧洲蓝海",
  listing: "Listing撰写",
  "ai-assistant": "AI助手",
  "ai-image": "AI图片",
};

const ACTION_LABELS: Record<string, string> = {
  analyze: "分析产品",
  generate: "生成内容",
  "generate-image": "生成图片",
  "generate-brief": "生成开发指示单",
  "custom-diff": "自定义方案",
  chat: "AI对话",
  create: "创建",
  delete: "删除",
  export: "导出",
};

interface LogUser {
  id: string;
  name: string | null;
  email: string | null;
}

interface LogEntry {
  id: string;
  userId: string;
  module: string;
  action: string;
  detail: string | null;
  tokenUsed: number | null;
  createdAt: string;
  user: LogUser;
}

function formatDetail(detail: string | null): string {
  if (!detail) return "—";
  try {
    const obj = JSON.parse(detail) as Record<string, unknown>;
    const parts: string[] = [];
    if (obj.asin) parts.push(`ASIN: ${obj.asin}`);
    if (obj.title) parts.push(String(obj.title).slice(0, 40));
    if (obj.diffTitle) parts.push(String(obj.diffTitle).slice(0, 40));
    if (obj.userInput) parts.push(String(obj.userInput).slice(0, 40));
    if (obj.messagePreview) parts.push(String(obj.messagePreview));
    if (obj.prompt) parts.push(String(obj.prompt).slice(0, 40));
    if (obj.count != null) parts.push(`${obj.count} 条`);
    return parts.length > 0 ? parts.join(" | ") : "—";
  } catch {
    return detail.slice(0, 60);
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

export function ActivityLogDashboard() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterModule, setFilterModule] = useState("all");
  const [filterUser, setFilterUser] = useState("all");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filterModule !== "all") params.set("module", filterModule);
      if (filterUser !== "all") params.set("userId", filterUser);

      const res = await fetch(`/api/activity-logs?${params}`);
      if (!res.ok) throw new Error("获取数据失败");
      const data = await res.json();
      setLogs(data.logs);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      if (data.users) setUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, filterModule, filterUser]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterModule, filterUser]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">
          操作记录
        </h2>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          所有员工的模块操作记录，共 {total} 条
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterUser} onValueChange={(v) => setFilterUser(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="全部员工" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部员工</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name || "未命名"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterModule} onValueChange={(v) => setFilterModule(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="全部模块" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部模块</SelectItem>
            {Object.entries(MODULE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
        </div>
      ) : logs.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-20">暂无操作记录</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2.5 font-medium text-muted-foreground">时间</th>
                <th className="px-3 py-2.5 font-medium text-muted-foreground">员工</th>
                <th className="px-3 py-2.5 font-medium text-muted-foreground">模块</th>
                <th className="px-3 py-2.5 font-medium text-muted-foreground">操作</th>
                <th className="px-3 py-2.5 font-medium text-muted-foreground">详情</th>
                <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Token</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatTime(log.createdAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {log.user.name || log.user.email || "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
                      {MODULE_LABELS[log.module] || log.module}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ACTION_LABELS[log.action] || log.action}
                  </td>
                  <td className="px-3 py-2 max-w-[300px] truncate text-muted-foreground">
                    {formatDetail(log.detail)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                    {log.tokenUsed != null ? log.tokenUsed.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            第 {page} / {totalPages} 页
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
