"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Loader2,
  Search,
  LayoutGrid,
  List,
  DollarSign,
  Package,
  Rocket,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

interface ProductDev {
  id: string;
  name: string;
  asin?: string | null;
  category?: string | null;
  targetMarket: string;
  status: string;
  priority: string;
  description?: string | null;
  targetPrice?: number | null;
  estimatedCost?: number | null;
  estimatedProfit?: number | null;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { tasks: number; logs: number };
}

interface Stats {
  total: number;
  byStatus: Record<string, number>;
}

const STATUS_COLUMNS = [
  { key: "idea", label: "创意构思", color: "bg-slate-400" },
  { key: "research", label: "市场调研", color: "bg-blue-500" },
  { key: "sampling", label: "打样中", color: "bg-amber-500" },
  { key: "testing", label: "测试中", color: "bg-purple-500" },
  { key: "listing", label: "Listing 准备", color: "bg-indigo-500" },
  { key: "launched", label: "已上架", color: "bg-emerald-500" },
] as const;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  idea: { label: "创意构思", color: "bg-slate-100 text-slate-700" },
  research: { label: "市场调研", color: "bg-blue-50 text-blue-700" },
  sampling: { label: "打样中", color: "bg-amber-50 text-amber-700" },
  testing: { label: "测试中", color: "bg-purple-50 text-purple-700" },
  listing: { label: "Listing 准备", color: "bg-indigo-50 text-indigo-700" },
  launched: { label: "已上架", color: "bg-emerald-50 text-emerald-700" },
  abandoned: { label: "已放弃", color: "bg-red-50 text-red-700" },
};

const PRIORITY_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "warning" | "outline" }> = {
  low: { label: "低", variant: "outline" },
  medium: { label: "中", variant: "secondary" },
  high: { label: "高", variant: "warning" },
  urgent: { label: "紧急", variant: "destructive" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProductDevDashboard() {
  const [items, setItems] = useState<ProductDev[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "list">("kanban");

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [q, setQ] = useState("");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    targetMarket: "US",
    priority: "medium",
    description: "",
  });

  /* ---------- query string ---------- */
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (statusFilter) p.set("status", statusFilter);
    if (priorityFilter) p.set("priority", priorityFilter);
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [statusFilter, priorityFilter, q]);

  /* ---------- fetch ---------- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/product-dev?${queryString}`),
        fetch("/api/product-dev/stats"),
      ]);
      const listData = await listRes.json();
      const statsData = await statsRes.json();
      if (!listRes.ok) throw new Error(listData.message ?? "加载失败");
      setItems(listData.items ?? listData);
      setStats(statsData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- create ---------- */
  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("请输入产品名称");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/product-dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "创建失败");
      toast.success("产品创建成功");
      setCreateOpen(false);
      setForm({ name: "", category: "", targetMarket: "US", priority: "medium", description: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  /* ---------- derived ---------- */
  const activeCount = stats
    ? (stats.byStatus.research ?? 0) +
      (stats.byStatus.sampling ?? 0) +
      (stats.byStatus.testing ?? 0) +
      (stats.byStatus.listing ?? 0)
    : 0;
  const launchedCount = stats?.byStatus.launched ?? 0;
  const avgProfit = useMemo(() => {
    const withProfit = items.filter((i) => i.estimatedProfit != null);
    if (!withProfit.length) return null;
    return withProfit.reduce((s, i) => s + (i.estimatedProfit ?? 0), 0) / withProfit.length;
  }, [items]);

  /* ---------- loading ---------- */
  if (loading && !items.length) {
    return (
      <div className="flex justify-center py-20 text-slate-500">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
      {/* ── Stats ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Package} label="总项目" value={stats?.total ?? 0} />
        <StatCard icon={TrendingUp} label="进行中" value={activeCount} color="text-blue-600" />
        <StatCard icon={Rocket} label="已上架" value={launchedCount} color="text-emerald-600" />
        <StatCard
          icon={DollarSign}
          label="平均利润"
          value={avgProfit != null ? `$${avgProfit.toFixed(2)}` : "—"}
          color="text-amber-600"
        />
      </div>

      {/* ── Toolbar ── */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">状态</label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">全部</option>
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">优先级</label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                >
                  <option value="">全部</option>
                  {Object.entries(PRIORITY_MAP).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">搜索</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
                  <Input
                    className="pl-9"
                    placeholder="产品名、ASIN…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && load()}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => load()}>
                查询
              </Button>
              <div className="flex rounded-lg border border-slate-200 bg-white">
                <Button
                  variant={view === "kanban" ? "default" : "ghost"}
                  size="icon-sm"
                  onClick={() => setView("kanban")}
                >
                  <LayoutGrid className="size-4" />
                </Button>
                <Button
                  variant={view === "list" ? "default" : "ghost"}
                  size="icon-sm"
                  onClick={() => setView("list")}
                >
                  <List className="size-4" />
                </Button>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 size-4" />
                新建产品
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Content ── */}
      {view === "kanban" ? (
        <KanbanView items={items} />
      ) : (
        <ListView items={items} />
      )}

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建产品开发项目</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className="mb-1 block text-sm text-gray-500">产品名称 *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例：便携式筋膜枪"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-500">品类</label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="例：Health & Household"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">目标市场</label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={form.targetMarket}
                  onChange={(e) => setForm((f) => ({ ...f, targetMarket: e.target.value }))}
                >
                  <option value="US">美国 (US)</option>
                  <option value="UK">英国 (UK)</option>
                  <option value="DE">德国 (DE)</option>
                  <option value="JP">日本 (JP)</option>
                  <option value="CA">加拿大 (CA)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">优先级</label>
              <select
                className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="urgent">紧急</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">描述</label>
              <textarea
                className="min-h-[72px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="简要描述产品思路…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
        <Icon className={cn("size-5", color ?? "text-slate-400")} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums text-slate-900">{value}</div>
      </CardContent>
    </Card>
  );
}

/* ── Kanban ── */

function KanbanView({ items }: { items: ProductDev[] }) {
  return (
    <div className="grid gap-4 overflow-x-auto pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {STATUS_COLUMNS.map((col) => {
        const colItems = items.filter((i) => i.status === col.key);
        return (
          <div key={col.key} className="min-w-[220px]">
            <div className="mb-3 flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", col.color)} />
              <span className="text-sm font-semibold text-slate-700">{col.label}</span>
              <span className="ml-auto text-xs text-slate-400">{colItems.length}</span>
            </div>
            <div className="space-y-3">
              {colItems.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">暂无项目</p>
              )}
              {colItems.map((item) => (
                <KanbanCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ item }: { item: ProductDev }) {
  const pri = PRIORITY_MAP[item.priority];
  return (
    <Link href={`/dashboard/product-dev/${item.id}`}>
      <Card className="cursor-pointer border-slate-200/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="space-y-2 p-3">
          <div className="flex items-start justify-between gap-1">
            <span className="text-sm font-medium leading-tight text-slate-900">{item.name}</span>
            {pri && <Badge variant={pri.variant}>{pri.label}</Badge>}
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
            {item.category && <span>{item.category}</span>}
            {item.category && item.targetMarket && <span>·</span>}
            <span>{item.targetMarket}</span>
          </div>
          {(item.targetPrice != null || item.estimatedProfit != null) && (
            <div className="flex gap-3 text-xs">
              {item.targetPrice != null && (
                <span className="text-slate-500">
                  售价 <span className="font-medium text-slate-700">${item.targetPrice}</span>
                </span>
              )}
              {item.estimatedProfit != null && (
                <span className="text-slate-500">
                  利润 <span className="font-medium text-emerald-600">${item.estimatedProfit}</span>
                </span>
              )}
            </div>
          )}
          {item._count.tasks > 0 && (
            <p className="text-xs text-slate-400">{item._count.tasks} 项任务</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

/* ── List View ── */

function ListView({ items }: { items: ProductDev[] }) {
  if (!items.length) {
    return <p className="py-12 text-center text-sm text-slate-500">暂无产品开发项目</p>;
  }

  return (
    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[800px] w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="px-4 py-3 text-left font-medium text-slate-600">产品名称</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">品类</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">市场</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">优先级</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">目标售价</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">预估利润</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">任务</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const st = STATUS_MAP[item.status];
              const pri = PRIORITY_MAP[item.priority];
              return (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/product-dev/${item.id}`}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.category ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.targetMarket}</td>
                  <td className="px-4 py-3">
                    {st && (
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", st.color)}>
                        {st.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {pri && <Badge variant={pri.variant}>{pri.label}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {item.targetPrice != null ? `$${item.targetPrice}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                    {item.estimatedProfit != null ? `$${item.estimatedProfit}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{item._count.tasks}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
