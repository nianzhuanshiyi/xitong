"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutGrid,
  List,
  Search,
  Star,
  Building2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  countryFlag,
  SUPPLIER_STATUS_LABEL,
} from "@/lib/supplier-labels";

type SupplierRow = {
  id: string;
  name: string;
  nameEn: string | null;
  country: string;
  countryCode: string | null;
  website: string | null;
  mainCategories: string | null;
  status: string;
  overallScore: number | null;
  updatedAt: string;
  logoUrl: string | null;
  fileCount: number;
};

type Stats = {
  total: number;
  activeLast3Months: number;
  pendingEvaluation: number;
  byCountry: { US: number; KR: number; CN: number };
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function Stars({ value }: { value: number | null }) {
  const v = value != null ? Math.round(value) : 0;
  return (
    <div className="flex items-center gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("size-3.5", i <= v ? "fill-current" : "text-slate-200")}
        />
      ))}
    </div>
  );
}

export function SuppliersDashboard() {
  const [view, setView] = useState<"cards" | "table">("cards");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SupplierRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [countryCode, setCountryCode] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("updated_desc");
  const [q, setQ] = useState("");

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (countryCode) p.set("countryCode", countryCode);
    if (category.trim()) p.set("category", category.trim());
    if (status) p.set("status", status);
    if (sort) p.set("sort", sort);
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [countryCode, category, status, sort, q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "加载失败");
      setItems(data.items ?? []);
      setStats(data.stats ?? null);
    } catch {
      setItems([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
          供应商资源库
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          集中管理美、韩、中供应商资料，支持 AI 分析与选品匹配。
        </p>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                供应商总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums text-slate-900">
                {stats.total}
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                国家分布
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 text-sm">
              <span>🇺🇸 {stats.byCountry.US}</span>
              <span>🇰🇷 {stats.byCountry.KR}</span>
              <span>🇨🇳 {stats.byCountry.CN}</span>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                近 3 个月活跃
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums text-emerald-700">
                {stats.activeLast3Months}
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                待评估
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums text-amber-700">
                {stats.pendingEvaluation}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">国家</label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  <option value="">全部</option>
                  <option value="US">美国</option>
                  <option value="KR">韩国</option>
                  <option value="CN">中国</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">品类关键词</label>
                <Input
                  placeholder="美妆、假发、户外…"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">合作状态</label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">全部</option>
                  <option value="COOPERATING">已合作</option>
                  <option value="EVALUATING">评估中</option>
                  <option value="CANDIDATE">备选</option>
                  <option value="REJECTED">已淘汰</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">排序</label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="updated_desc">最近更新</option>
                  <option value="score_desc">评分从高到低</option>
                  <option value="name_asc">名称 A-Z</option>
                </select>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="搜索公司名、品类…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && load()}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => load()}>
                  查询
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(view === "cards" && "border-indigo-300 bg-indigo-50")}
                  onClick={() => setView("cards")}
                  aria-label="卡片视图"
                >
                  <LayoutGrid className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(view === "table" && "border-indigo-300 bg-indigo-50")}
                  onClick={() => setView("table")}
                  aria-label="表格视图"
                >
                  <List className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20 text-slate-500">
          <Loader2 className="size-8 animate-spin" />
        </div>
      ) : view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => (
            <Link key={s.id} href={`/dashboard/suppliers/${s.id}`}>
              <Card className="h-full border-slate-200/80 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
                <CardContent className="flex gap-4 p-5">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/80">
                    {s.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.logoUrl}
                        alt=""
                        className="size-full object-contain p-1"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-slate-400">
                        <Building2 className="size-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-slate-900">
                        {s.name}
                      </span>
                      <Badge variant="secondary" className="font-normal">
                        {countryFlag(s.countryCode)} {s.country}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(s.mainCategories ?? "")
                        .split(/[,，]/)
                        .map((c) => c.trim())
                        .filter(Boolean)
                        .slice(0, 5)
                        .map((c) => (
                          <Badge key={c} variant="outline" className="text-xs font-normal">
                            {c}
                          </Badge>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <Stars value={s.overallScore} />
                      <Badge className="bg-indigo-50 text-indigo-800 hover:bg-indigo-50">
                        {SUPPLIER_STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                      <span>更新 {formatTime(s.updatedAt)}</span>
                      <span>文件 {s.fileCount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="border-slate-200/80 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>公司</TableHead>
                <TableHead>国家</TableHead>
                <TableHead>品类</TableHead>
                <TableHead>评分</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>文件</TableHead>
                <TableHead>更新</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/suppliers/${s.id}`}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {countryFlag(s.countryCode)} {s.country}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-slate-600">
                    {s.mainCategories ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Stars value={s.overallScore} />
                  </TableCell>
                  <TableCell>{SUPPLIER_STATUS_LABEL[s.status] ?? s.status}</TableCell>
                  <TableCell>{s.fileCount}</TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {formatTime(s.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {!loading && items.length === 0 && (
        <p className="py-12 text-center text-sm text-slate-500">暂无供应商数据</p>
      )}
    </div>
  );
}
