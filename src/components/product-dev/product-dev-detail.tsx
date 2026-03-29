"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Check,
  Save,
  Clock,
  CalendarDays,
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

interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  assignee?: string | null;
  dueDate?: string | null;
  sortOrder: number;
}

interface Log {
  id: string;
  action: string;
  content: string;
  createdBy?: string | null;
  createdAt: string;
}

interface ProductDevData {
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
  moq?: number | null;
  competitorAsins?: string | null;
  marketSize?: string | null;
  competitionLevel?: string | null;
  supplierName?: string | null;
  supplierContact?: string | null;
  sampleStatus?: string | null;
  sampleCost?: number | null;
  diffPoints?: string | null;
  painPoints?: string | null;
  ideaDate: string;
  targetLaunchDate?: string | null;
  actualLaunchDate?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  logs: Log[];
}

const STATUS_OPTIONS = [
  { key: "idea", label: "创意构思" },
  { key: "research", label: "市场调研" },
  { key: "sampling", label: "打样中" },
  { key: "testing", label: "测试中" },
  { key: "listing", label: "Listing 准备" },
  { key: "launched", label: "已上架" },
  { key: "abandoned", label: "已放弃" },
];

const STATUS_COLORS: Record<string, string> = {
  idea: "bg-slate-100 text-slate-700",
  research: "bg-blue-50 text-blue-700",
  sampling: "bg-amber-50 text-amber-700",
  testing: "bg-purple-50 text-purple-700",
  listing: "bg-indigo-50 text-indigo-700",
  launched: "bg-emerald-50 text-emerald-700",
  abandoned: "bg-red-50 text-red-700",
};

const PRIORITY_OPTIONS = [
  { key: "low", label: "低" },
  { key: "medium", label: "中" },
  { key: "high", label: "高" },
  { key: "urgent", label: "紧急" },
];

const SAMPLE_STATUS_OPTIONS = [
  { key: "not_ordered", label: "未下单" },
  { key: "ordered", label: "已下单" },
  { key: "received", label: "已收到" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已拒绝" },
];

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  todo: { label: "待办", color: "bg-slate-100 text-slate-600" },
  in_progress: { label: "进行中", color: "bg-blue-50 text-blue-700" },
  done: { label: "已完成", color: "bg-emerald-50 text-emerald-700" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProductDevDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<ProductDevData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);

  // Task dialog
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assignee: "" });
  const [creatingTask, setCreatingTask] = useState(false);

  /* ---------- fetch ---------- */
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/product-dev/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "加载失败");
      setData(json);
      setForm(buildForm(json));
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- save ---------- */
  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/product-dev/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "保存失败");
      toast.success("已保存");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- task actions ---------- */
  async function addTask() {
    if (!taskForm.title.trim()) return;
    setCreatingTask(true);
    try {
      const res = await fetch(`/api/product-dev/${id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskForm),
      });
      if (!res.ok) throw new Error("添加失败");
      toast.success("任务已添加");
      setTaskOpen(false);
      setTaskForm({ title: "", description: "", assignee: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    } finally {
      setCreatingTask(false);
    }
  }

  async function toggleTaskStatus(task: Task) {
    const next = task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
    try {
      const res = await fetch(`/api/product-dev/${id}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("更新失败");
      load();
    } catch {
      toast.error("更新失败");
    }
  }

  async function deleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/product-dev/${id}/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      toast.success("任务已删除");
      load();
    } catch {
      toast.error("删除失败");
    }
  }

  /* ---------- helpers ---------- */
  function updateField(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  /* ---------- loading ---------- */
  if (loading) {
    return (
      <div className="flex justify-center py-20 text-slate-500">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <p className="py-12 text-center text-sm text-slate-500">项目不存在</p>;
  }

  const profit =
    form.targetPrice != null && form.estimatedCost != null
      ? Number(form.targetPrice) - Number(form.estimatedCost)
      : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/product-dev")}>
          <ArrowLeft className="mr-1 size-4" />
          返回
        </Button>
        <h1 className="flex-1 font-heading text-xl font-semibold text-slate-900">{data.name}</h1>
        {dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
            保存修改
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ════════════════ LEFT (2 cols) ════════════════ */}
        <div className="space-y-6 lg:col-span-2">
          {/* ── Basic Info ── */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">基本信息</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="产品名称">
                <Input
                  value={(form.name as string) ?? ""}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </Field>
              <Field label="ASIN">
                <Input
                  value={(form.asin as string) ?? ""}
                  onChange={(e) => updateField("asin", e.target.value || null)}
                  placeholder="B0XXXXXXXX"
                />
              </Field>
              <Field label="品类">
                <Input
                  value={(form.category as string) ?? ""}
                  onChange={(e) => updateField("category", e.target.value || null)}
                />
              </Field>
              <Field label="目标市场">
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={(form.targetMarket as string) ?? "US"}
                  onChange={(e) => updateField("targetMarket", e.target.value)}
                >
                  <option value="US">美国 (US)</option>
                  <option value="UK">英国 (UK)</option>
                  <option value="DE">德国 (DE)</option>
                  <option value="JP">日本 (JP)</option>
                  <option value="CA">加拿大 (CA)</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="描述">
                  <textarea
                    className="min-h-[72px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                    value={(form.description as string) ?? ""}
                    onChange={(e) => updateField("description", e.target.value || null)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* ── Diff & Pain Points ── */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">差异化卖点 & 用户痛点</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="差异化卖点">
                <textarea
                  className="min-h-[80px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                  value={(form.diffPoints as string) ?? ""}
                  onChange={(e) => updateField("diffPoints", e.target.value || null)}
                  placeholder="每行一个卖点"
                />
              </Field>
              <Field label="用户痛点">
                <textarea
                  className="min-h-[80px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                  value={(form.painPoints as string) ?? ""}
                  onChange={(e) => updateField("painPoints", e.target.value || null)}
                  placeholder="每行一个痛点"
                />
              </Field>
            </CardContent>
          </Card>

          {/* ── Supplier ── */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">供应商信息</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="供应商名称">
                <Input
                  value={(form.supplierName as string) ?? ""}
                  onChange={(e) => updateField("supplierName", e.target.value || null)}
                />
              </Field>
              <Field label="供应商联系方式">
                <Input
                  value={(form.supplierContact as string) ?? ""}
                  onChange={(e) => updateField("supplierContact", e.target.value || null)}
                />
              </Field>
              <Field label="打样状态">
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={(form.sampleStatus as string) ?? ""}
                  onChange={(e) => updateField("sampleStatus", e.target.value || null)}
                >
                  <option value="">未设置</option>
                  {SAMPLE_STATUS_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="打样费用">
                <Input
                  type="number"
                  value={(form.sampleCost as number) ?? ""}
                  onChange={(e) => updateField("sampleCost", e.target.value ? Number(e.target.value) : null)}
                  placeholder="$"
                />
              </Field>
              <Field label="MOQ">
                <Input
                  type="number"
                  value={(form.moq as number) ?? ""}
                  onChange={(e) => updateField("moq", e.target.value ? Number(e.target.value) : null)}
                />
              </Field>
            </CardContent>
          </Card>

          {/* ── Tasks ── */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">任务列表</CardTitle>
              <Button size="sm" onClick={() => setTaskOpen(true)}>
                <Plus className="mr-1 size-3.5" />
                添加任务
              </Button>
            </CardHeader>
            <CardContent>
              {data.tasks.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">暂无任务</p>
              ) : (
                <div className="space-y-2">
                  {data.tasks.map((t) => {
                    const ts = TASK_STATUS[t.status] ?? TASK_STATUS.todo;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2"
                      >
                        <button
                          onClick={() => toggleTaskStatus(t)}
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                            t.status === "done"
                              ? "border-emerald-300 bg-emerald-100 text-emerald-600"
                              : "border-slate-300 hover:border-indigo-400",
                          )}
                        >
                          {t.status === "done" && <Check className="size-3" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "text-sm",
                              t.status === "done" && "text-slate-400 line-through",
                            )}
                          >
                            {t.title}
                          </span>
                          {t.assignee && (
                            <span className="ml-2 text-xs text-slate-400">@{t.assignee}</span>
                          )}
                        </div>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ts.color)}>
                          {ts.label}
                        </span>
                        {t.dueDate && (
                          <span className="text-xs text-slate-400">
                            {new Date(t.dueDate).toLocaleDateString("zh-CN")}
                          </span>
                        )}
                        <button
                          onClick={() => deleteTask(t.id)}
                          className="text-slate-300 hover:text-red-500"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ════════════════ RIGHT (1 col) ════════════════ */}
        <div className="space-y-6">
          {/* ── Status & Priority ── */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">当前阶段</label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={(form.status as string) ?? "idea"}
                  onChange={(e) => updateField("status", e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">优先级</label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={(form.priority as string) ?? "medium"}
                  onChange={(e) => updateField("priority", e.target.value)}
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className={cn("rounded-lg px-3 py-2 text-center text-sm font-medium", STATUS_COLORS[form.status as string] ?? "bg-slate-100 text-slate-600")}>
                {STATUS_OPTIONS.find((o) => o.key === form.status)?.label ?? String(form.status ?? "")}
              </div>
            </CardContent>
          </Card>

          {/* ── Dates ── */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">日期</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="创意日期">
                <Input
                  type="date"
                  value={dateValue(form.ideaDate as string)}
                  onChange={(e) => updateField("ideaDate", e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                />
              </Field>
              <Field label="目标上架日期">
                <Input
                  type="date"
                  value={dateValue(form.targetLaunchDate as string)}
                  onChange={(e) => updateField("targetLaunchDate", e.target.value ? new Date(e.target.value).toISOString() : null)}
                />
              </Field>
              <Field label="实际上架日期">
                <Input
                  type="date"
                  value={dateValue(form.actualLaunchDate as string)}
                  onChange={(e) => updateField("actualLaunchDate", e.target.value ? new Date(e.target.value).toISOString() : null)}
                />
              </Field>
            </CardContent>
          </Card>

          {/* ── Profit Calc ── */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">利润计算</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="目标售价 ($)">
                <Input
                  type="number"
                  value={(form.targetPrice as number) ?? ""}
                  onChange={(e) => updateField("targetPrice", e.target.value ? Number(e.target.value) : null)}
                />
              </Field>
              <Field label="预估成本 ($)">
                <Input
                  type="number"
                  value={(form.estimatedCost as number) ?? ""}
                  onChange={(e) => updateField("estimatedCost", e.target.value ? Number(e.target.value) : null)}
                />
              </Field>
              {profit != null && (
                <div className={cn(
                  "rounded-lg px-3 py-3 text-center",
                  profit > 0 ? "bg-emerald-50" : "bg-red-50",
                )}>
                  <p className="text-xs text-slate-500">预估利润</p>
                  <p className={cn("text-xl font-semibold tabular-nums", profit > 0 ? "text-emerald-600" : "text-red-600")}>
                    ${profit.toFixed(2)}
                  </p>
                </div>
              )}
              <Field label="预估利润 (手动)">
                <Input
                  type="number"
                  value={(form.estimatedProfit as number) ?? ""}
                  onChange={(e) => updateField("estimatedProfit", e.target.value ? Number(e.target.value) : null)}
                />
              </Field>
            </CardContent>
          </Card>

          {/* ── Notes ── */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">备注</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                value={(form.notes as string) ?? ""}
                onChange={(e) => updateField("notes", e.target.value || null)}
              />
            </CardContent>
          </Card>

          {/* ── Logs ── */}
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">操作日志</CardTitle>
            </CardHeader>
            <CardContent>
              {data.logs.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">暂无日志</p>
              ) : (
                <div className="space-y-3">
                  {data.logs.map((log) => (
                    <div key={log.id} className="flex gap-3 text-sm">
                      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100">
                        <Clock className="size-3 text-slate-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-700">{log.content}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {new Date(log.createdAt).toLocaleString("zh-CN")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Add Task Dialog ── */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加任务</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className="mb-1 block text-sm text-gray-500">任务标题 *</label>
              <Input
                value={taskForm.title}
                onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="例：确定供应商"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">描述</label>
              <textarea
                className="min-h-[60px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                value={taskForm.description}
                onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">负责人</label>
              <Input
                value={taskForm.assignee}
                onChange={(e) => setTaskForm((f) => ({ ...f, assignee: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>
              取消
            </Button>
            <Button onClick={addTask} disabled={creatingTask}>
              {creatingTask ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function buildForm(data: ProductDevData): Record<string, unknown> {
  return {
    name: data.name,
    asin: data.asin,
    category: data.category,
    targetMarket: data.targetMarket,
    status: data.status,
    priority: data.priority,
    description: data.description,
    targetPrice: data.targetPrice,
    estimatedCost: data.estimatedCost,
    estimatedProfit: data.estimatedProfit,
    moq: data.moq,
    competitorAsins: data.competitorAsins,
    marketSize: data.marketSize,
    competitionLevel: data.competitionLevel,
    supplierName: data.supplierName,
    supplierContact: data.supplierContact,
    sampleStatus: data.sampleStatus,
    sampleCost: data.sampleCost,
    diffPoints: data.diffPoints,
    painPoints: data.painPoints,
    ideaDate: data.ideaDate,
    targetLaunchDate: data.targetLaunchDate,
    actualLaunchDate: data.actualLaunchDate,
    notes: data.notes,
    imageUrl: data.imageUrl,
  };
}

function dateValue(val: string | null | undefined): string {
  if (!val) return "";
  try {
    return new Date(val).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}
