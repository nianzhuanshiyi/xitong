"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

type RankingRow = {
  rank: number;
  userId: string;
  name: string;
  email: string;
  role: string;
  totalTokens: number;
  estimatedCost: number;
  monthlyTokenLimit: number;
  usagePercent: number;
  topModule: string;
};

type SummaryData = {
  companyTotal: { tokens: number; cost: number };
  ranking: RankingRow[];
  month: string;
};

type DailyData = {
  daily: { date: string; tokens: number }[];
  modules: { module: string; tokens: number }[];
};

const MODULE_LABELS: Record<string, string> = {
  "ai-assistant": "AI 助手",
  "3c-ideas": "3C 创意",
  "europe-ideas": "欧洲选品",
  "mail": "邮件翻译",
  "ai-images": "AI 图片",
};

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtCost(n: number) {
  return `$${n.toFixed(2)}`;
}

export function TokenRankingClient() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/token-usage/summary").then((r) => r.json()),
      fetch("/api/admin/token-usage/daily").then((r) => r.json()),
    ])
      .then(([s, d]) => {
        setSummary(s);
        setDaily(d);
      })
      .catch(() => toast.error("加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!moduleFilter) {
      fetch("/api/admin/token-usage/daily")
        .then((r) => r.json())
        .then(setDaily)
        .catch(() => {});
      return;
    }
    fetch(`/api/admin/token-usage/daily?module=${moduleFilter}`)
      .then((r) => r.json())
      .then(setDaily)
      .catch(() => {});
  }, [moduleFilter]);

  if (loading) {
    return <div className="py-16 text-center text-muted-foreground">加载中…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">本月总 Token</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmtTokens(summary?.companyTotal.tokens ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground">{summary?.month ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">本月总费用</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmtCost(summary?.companyTotal.cost ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground">估算费用（美元）</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">参与人数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.ranking.length ?? 0}</div>
            <div className="text-xs text-muted-foreground">本月有使用记录</div>
          </CardContent>
        </Card>
      </div>

      {/* Daily trend chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">每日 AI 用量趋势（30天）</CardTitle>
          <select
            className="h-7 rounded border px-2 text-xs"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="">全部模块</option>
            {daily?.modules.map((m) => (
              <option key={m.module} value={m.module}>
                {MODULE_LABELS[m.module] ?? m.module}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={daily?.daily ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: any) => String(v).slice(5)}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => fmtTokens(Number(v) || 0)} />
              <Tooltip
                formatter={(value: any) => [fmtTokens(Number(value) || 0), "Tokens"]}
                labelFormatter={(label: any) => `日期: ${label}`}
              />
              <Line type="monotone" dataKey="tokens" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Module usage bar chart */}
      {daily && daily.modules.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">按模块用量（全时间）</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={daily.modules.slice(0, 8).map((m) => ({
                  ...m,
                  label: MODULE_LABELS[m.module] ?? m.module,
                }))}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => fmtTokens(Number(v) || 0)} />
                <Tooltip formatter={(value: any) => [fmtTokens(Number(value) || 0), "Tokens"]} />
                <Bar dataKey="tokens" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Ranking table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">本月用量排行榜</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="overflow-x-auto rounded-xl border">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">排名</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>本月 Tokens</TableHead>
                  <TableHead>本月费用</TableHead>
                  <TableHead>使用率</TableHead>
                  <TableHead>最常用模块</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.ranking ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      本月暂无使用记录
                    </TableCell>
                  </TableRow>
                ) : (
                  (summary?.ranking ?? []).map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="font-bold text-muted-foreground">
                        {r.rank <= 3 ? (
                          <span className={r.rank === 1 ? "text-yellow-500" : r.rank === 2 ? "text-slate-400" : "text-amber-600"}>
                            #{r.rank}
                          </span>
                        ) : (
                          `#${r.rank}`
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{r.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={r.role === "ADMIN" ? "default" : "secondary"}
                          className={r.role === "ADMIN" ? "border-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-sm" : ""}
                        >
                          {r.role === "ADMIN" ? "管理员" : "员工"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{fmtTokens(r.totalTokens)}</TableCell>
                      <TableCell>{fmtCost(r.estimatedCost)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={Math.min(r.usagePercent, 100)}
                            className={`h-1.5 w-20 ${r.usagePercent > 80 ? "[&>div]:bg-red-500" : r.usagePercent > 60 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                          />
                          <span className="text-xs text-muted-foreground">{r.usagePercent}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {MODULE_LABELS[r.topModule] ?? r.topModule}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
