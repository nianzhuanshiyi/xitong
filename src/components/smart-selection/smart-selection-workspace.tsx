"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Microscope,
  Pause,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  EMPTY_FILTERS_PLACEHOLDER,
  US_BEAUTY_DEFAULT_FILTERS,
  parseFiltersJson,
  type SmartSelectionFilters,
} from "@/lib/smart-selection-filters";

type PlanListItem = {
  id: string;
  name: string;
  slug: string;
  marketplace: string;
  category: string | null;
  active: boolean;
};

type ResultRow = {
  id: string;
  asin: string;
  marketplace: string;
  imageUrl: string | null;
  title: string | null;
  price: number | null;
  bsr: number | null;
  rating: number | null;
  reviewCount: number | null;
  monthlySales: number | null;
  aiScore: number | null;
  aiSummary: string | null;
  aiJson: string | null;
  productJson: string;
};

type Stats = {
  totalResults: number;
  recommended: number;
  candidate: number;
  excluded: number;
  passedHard: number;
  rejectedAi: number;
  excludeListCount: number;
  lastBatchAt: string | null;
  lastRunStats: Record<string, number> | null;
};

const labelCls = "text-xs font-medium text-gray-500";

function MinMax({
  label,
  min,
  max,
  onMin,
  onMax,
  suffix,
}: {
  label: string;
  min: number | null;
  max: number | null;
  onMin: (v: number | null) => void;
  onMax: (v: number | null) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <p className={labelCls}>{label}</p>
      <div className="flex items-center gap-2">
        <Input
          className="h-8 min-w-0 flex-1"
          inputMode="decimal"
          placeholder="最小"
          value={min ?? ""}
          onChange={(e) => {
            const t = e.target.value;
            onMin(t === "" ? null : Number(t));
          }}
        />
        <span className="text-muted-foreground">~</span>
        <Input
          className="h-8 min-w-0 flex-1"
          inputMode="decimal"
          placeholder="最大"
          value={max ?? ""}
          onChange={(e) => {
            const t = e.target.value;
            onMax(t === "" ? null : Number(t));
          }}
        />
        {suffix ? (
          <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </div>
  );
}

/* ScoreRing, parsePainTags, parseMargin removed — no AI scoring in scan phase */

const PRESET_SUBCATEGORIES = [
  { nodeIdPath: "3760911:11060451:11060711:7792636011", label: "面部套装 Facial Kits" },
  { nodeIdPath: "3760911:11060451:11060711:11062031:7792528011", label: "精华 Serums" },
  { nodeIdPath: "3760911:11060451:11060711:11062031:11061121", label: "面膜 Masks" },
  { nodeIdPath: "3760911:11060451:11060711:11061301:16479981011", label: "面霜保湿 Face Moisturizers" },
  { nodeIdPath: "3760911:11060451:11060711:11062031:7792926011", label: "去角质 Facial Peels" },
  { nodeIdPath: "3760911:11060451:11060711:11061931", label: "化妆水 Toners" },
  { nodeIdPath: "3760911:11060451:11062591:11062651:7792567011", label: "面部防晒 Facial Sunscreens" },
  { nodeIdPath: "3760911:11060451:11061941:11061971", label: "眼膜 Eye Masks" },
  { nodeIdPath: "3760911:11060451:11061941:7730090011", label: "眼霜 Eye Creams" },
  { nodeIdPath: "3760911:11060451:3761351:979546011", label: "润唇膏 Lip Balms" },
  { nodeIdPath: "3760911:11060451:11060711:11061301:15239989011", label: "保湿喷雾 Face Mists" },
  { nodeIdPath: "3760911:11060451:11060711:11060901:7730193011", label: "洁面 Face Washes" },
  { nodeIdPath: "3760911:11060451:11060521:11056471", label: "身体磨砂 Body Scrubs" },
];

type ScanFiltersJson = {
  marketplace?: string;
  subcategories?: Array<{ nodeIdPath: string; label: string }>;
  newProductMonths?: number;
  minPrice?: number;
  maxPrice?: number;
  minMonthlyRevenue?: number;
  maxReviews?: number;
  minRating?: number;
  supplyChainTags?: string[];
};

function parseScanConfig(filters: SmartSelectionFilters): ScanFiltersJson {
  try {
    const raw = (filters as unknown as Record<string, unknown>)._scanConfig;
    if (raw && typeof raw === "object") return raw as ScanFiltersJson;
  } catch { /* ignore */ }
  return {};
}

function ScanCategoryConfig({
  filters,
  setFilters,
}: {
  filters: SmartSelectionFilters;
  setFilters: React.Dispatch<React.SetStateAction<SmartSelectionFilters>>;
}) {
  const scanConfig = parseScanConfig(filters);
  const selected = scanConfig.subcategories ?? [];
  const [customPath, setCustomPath] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  const updateScan = (patch: Partial<ScanFiltersJson>) => {
    setFilters((f) => ({
      ...f,
      _scanConfig: { ...parseScanConfig(f), ...patch },
    } as SmartSelectionFilters));
  };

  const toggleSubcat = (item: { nodeIdPath: string; label: string }) => {
    const has = selected.some((s) => s.nodeIdPath === item.nodeIdPath);
    const next = has
      ? selected.filter((s) => s.nodeIdPath !== item.nodeIdPath)
      : [...selected, item];
    updateScan({ subcategories: next });
  };

  const addCustom = () => {
    if (!customPath.trim() || !customLabel.trim()) return;
    const item = { nodeIdPath: customPath.trim(), label: customLabel.trim() };
    if (!selected.some((s) => s.nodeIdPath === item.nodeIdPath)) {
      updateScan({ subcategories: [...selected, item] });
    }
    setCustomPath("");
    setCustomLabel("");
  };

  return (
    <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/30 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-indigo-900">扫描配置（类目 & 筛选条件）</h3>

      <div className="space-y-2">
        <p className={labelCls}>扫描类目（勾选需要扫描的类目）</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {PRESET_SUBCATEGORIES.map((item) => (
            <label key={item.nodeIdPath} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.some((s) => s.nodeIdPath === item.nodeIdPath)}
                onCheckedChange={() => toggleSubcat(item)}
              />
              {item.label}
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input className="h-8 flex-1" placeholder="自定义 nodeIdPath" value={customPath} onChange={(e) => setCustomPath(e.target.value)} />
          <Input className="h-8 w-32" placeholder="类目名称" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} />
          <Button type="button" size="sm" variant="outline" onClick={addCustom}>添加</Button>
        </div>
        {selected.length > 0 && (
          <p className="text-xs text-muted-foreground">已选 {selected.length} 个类目</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <p className={labelCls}>新品定义（月）</p>
          <Input className="h-8" type="number" value={scanConfig.newProductMonths ?? 6}
            onChange={(e) => updateScan({ newProductMonths: Number(e.target.value) || 6 })} />
        </div>
        <div className="space-y-1">
          <p className={labelCls}>最低售价 ($)</p>
          <Input className="h-8" type="number" value={scanConfig.minPrice ?? 20}
            onChange={(e) => updateScan({ minPrice: Number(e.target.value) || 0 })} />
        </div>
        <div className="space-y-1">
          <p className={labelCls}>最高售价 ($)</p>
          <Input className="h-8" type="number" value={scanConfig.maxPrice ?? 200}
            onChange={(e) => updateScan({ maxPrice: Number(e.target.value) || 200 })} />
        </div>
        <div className="space-y-1">
          <p className={labelCls}>最低月收入 ($)</p>
          <Input className="h-8" type="number" value={scanConfig.minMonthlyRevenue ?? 30000}
            onChange={(e) => updateScan({ minMonthlyRevenue: Number(e.target.value) || 0 })} />
        </div>
        <div className="space-y-1">
          <p className={labelCls}>最多评论数</p>
          <Input className="h-8" type="number" value={scanConfig.maxReviews ?? 500}
            onChange={(e) => updateScan({ maxReviews: Number(e.target.value) || 500 })} />
        </div>
        <div className="space-y-1">
          <p className={labelCls}>最低评分</p>
          <Input className="h-8" type="number" step="0.1" value={scanConfig.minRating ?? 3.0}
            onChange={(e) => updateScan({ minRating: Number(e.target.value) || 0 })} />
        </div>
      </div>

      <div className="space-y-1">
        <p className={labelCls}>供应链标签</p>
        <div className="flex gap-3 text-sm">
          {["韩国", "美国", "中国"].map((tag) => (
            <label key={tag} className="flex items-center gap-2">
              <Checkbox
                checked={(scanConfig.supplyChainTags ?? []).includes(tag)}
                onCheckedChange={() => {
                  const arr = scanConfig.supplyChainTags ?? [];
                  const next = arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag];
                  updateScan({ supplyChainTags: next });
                }}
              />
              {tag}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SmartSelectionWorkspace() {
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<SmartSelectionFilters>(
    US_BEAUTY_DEFAULT_FILTERS
  );
  const [savingFilters, setSavingFilters] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStep, setScanStep] = useState("");
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [candidates, setCandidates] = useState<ResultRow[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [plansLoaded, setPlansLoaded] = useState(false);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === planId) ?? null,
    [plans, planId]
  );

  // tokenEst removed — scan phase has zero AI token cost

  const loadPlans = useCallback(async () => {
    const res = await fetch("/api/smart-selection/plans");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.message ?? "加载方案失败");
      setPlansLoaded(true);
      return;
    }
    const list = j as PlanListItem[];
    setPlans(list);
    setPlansLoaded(true);
    setPlanId((prev) => {
      if (prev) return prev;
      const first = list.find((p) => p.slug === "us-beauty") ?? list[0];
      return first?.id ?? null;
    });
  }, []);

  const loadPlanDetail = useCallback(async (id: string) => {
    setLoadingPlan(true);
    try {
      const [pRes, lRes, sRes] = await Promise.all([
        fetch(`/api/smart-selection/plans/${id}`),
        fetch(`/api/smart-selection/plans/${id}/latest`),
        fetch(`/api/smart-selection/plans/${id}/stats`),
      ]);
      const pj = await pRes.json().catch(() => ({}));
      if (!pRes.ok) throw new Error(pj.message ?? "加载方案失败");
      const plan = pj as {
        filtersJson: string;
        slug: string;
      };
      const base =
        plan.slug === "us-beauty"
          ? US_BEAUTY_DEFAULT_FILTERS
          : EMPTY_FILTERS_PLACEHOLDER;
      setFilters(parseFiltersJson(plan.filtersJson, base));

      const lj = await lRes.json().catch(() => ({}));
      if (lRes.ok && Array.isArray(lj.results)) {
        setResults(lj.results as ResultRow[]);
      } else {
        setResults([]);
      }

      const sj = await sRes.json().catch(() => ({}));
      if (sRes.ok) setStats(sj as Stats);
      else setStats(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (planId) loadPlanDetail(planId);
  }, [planId, loadPlanDetail]);

  async function saveFilters() {
    if (!planId) return;
    setSavingFilters(true);
    try {
      const res = await fetch(`/api/smart-selection/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filtersJson: JSON.stringify(filters) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "保存失败");
      toast.success("筛选条件已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingFilters(false);
    }
  }

  async function runScan() {
    if (!planId) {
      toast.error("请先选择一个方案");
      return;
    }
    setScanning(true);
    setScanProgress(0);
    setScanStep("保存筛选条件…");

    // Auto-save filters to DB before scanning so scan route reads latest config
    try {
      const saveRes = await fetch(`/api/smart-selection/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filtersJson: JSON.stringify(filters) }),
      });
      if (!saveRes.ok) {
        const sj = await saveRes.json().catch(() => ({}));
        throw new Error((sj as { message?: string }).message ?? "保存筛选条件失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
      setScanning(false);
      return;
    }

    setScanStep("连接扫描服务…");
    try {
      const res = await fetch("/api/smart-selection/scan/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "扫描请求失败");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const block of parts) {
          const line = block.startsWith("data: ") ? block.slice(6) : block;
          try {
            const msg = JSON.parse(line) as {
              type: string;
              step?: number;
              label?: string;
              progress?: number;
              message?: string;
              ok?: boolean;
            };
            if (msg.type === "step" && msg.label) {
              setScanStep(msg.label);
              if (typeof msg.progress === "number") {
                setScanProgress(msg.progress);
              }
            }
            if (msg.type === "done") {
              setScanProgress(100);
              setScanStep(msg.message ?? "完成");
              if (msg.ok) {
                toast.success("扫描完成");
              } else {
                toast.message(msg.message ?? "阶段提示", { duration: 6000 });
              }
            }
            if (msg.type === "error") {
              throw new Error((msg as { message?: string }).message ?? "错误");
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "扫描失败");
    } finally {
      setScanning(false);
      if (planId) {
        loadPlanDetail(planId);
      }
    }
  }

  const loadCandidates = useCallback(async () => {
    if (!planId) return;
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/smart-selection/plans/${planId}/candidates`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "加载失败");
      setCandidates(j as ResultRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoadingCandidates(false);
    }
  }, [planId]);

  useEffect(() => {
    if (candidatesOpen && planId) void loadCandidates();
  }, [candidatesOpen, planId, loadCandidates]);

  async function postExclude(asin: string) {
    if (!planId) return;
    try {
      const res = await fetch(`/api/smart-selection/plans/${planId}/exclude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asin, reason: "不感兴趣" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "操作失败");
      toast.success("已加入排除列表");
      setResults((r) => r.filter((x) => x.asin !== asin));
      loadPlanDetail(planId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  async function postCandidate(row: ResultRow) {
    if (!planId) return;
    try {
      const res = await fetch(`/api/smart-selection/plans/${planId}/candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin: row.asin,
          marketplace: row.marketplace,
          productJson: row.productJson,
          imageUrl: row.imageUrl,
          title: row.title,
          price: row.price,
          bsr: row.bsr,
          rating: row.rating,
          reviewCount: row.reviewCount,
          monthlySales: row.monthlySales,
          aiScore: row.aiScore,
          aiSummary: row.aiSummary,
          aiJson: row.aiJson,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "操作失败");
      toast.success("已加入候选清单");
      loadPlanDetail(planId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  function exportCandidatesCsv() {
    const headers = [
      "ASIN",
      "标题",
      "站点",
      "价格",
      "BSR",
      "评分",
      "评论数",
      "月销量",
      "AI分",
    ];
    const lines = [
      headers.join(","),
      ...candidates.map((r) =>
        [
          r.asin,
          `"${(r.title ?? "").replace(/"/g, '""')}"`,
          r.marketplace,
          r.price ?? "",
          r.bsr ?? "",
          r.rating ?? "",
          r.reviewCount ?? "",
          r.monthlySales ?? "",
          r.aiScore ?? "",
        ].join(",")
      ),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `smart-selection-candidates-${planId ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function createPlan(name?: string) {
    const planName = (name ?? newPlanName).trim();
    if (!planName) {
      toast.error("请填写方案名称");
      return;
    }
    // Auto-generate slug from name
    const slug = planName
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `plan-${Date.now()}`;
    setCreatingPlan(true);
    try {
      const res = await fetch("/api/smart-selection/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: planName, slug, marketplace: "US" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "创建失败");
      toast.success("方案已创建，请勾选类目后开始扫描");
      setNewPlanOpen(false);
      setNewPlanName("");
      await loadPlans();
      setPlanId(j.id as string);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreatingPlan(false);
    }
  }

  const setSp = (patch: Partial<SmartSelectionFilters["salesPerformance"]>) => {
    setFilters((f) => ({
      ...f,
      salesPerformance: { ...f.salesPerformance, ...patch },
    }));
  };
  const setPi = (patch: Partial<SmartSelectionFilters["productInfo"]>) => {
    setFilters((f) => ({
      ...f,
      productInfo: { ...f.productInfo, ...patch },
    }));
  };
  const setCp = (patch: Partial<SmartSelectionFilters["competitor"]>) => {
    setFilters((f) => ({
      ...f,
      competitor: { ...f.competitor, ...patch },
    }));
  };
  const setDev = (patch: Partial<SmartSelectionFilters["devStandards"]>) => {
    setFilters((f) => ({
      ...f,
      devStandards: { ...f.devStandards, ...patch },
    }));
  };

  const fulfillmentToggle = (v: string) => {
    setFilters((f) => {
      const arr = f.competitor.fulfillment;
      const has = arr.includes(v);
      return {
        ...f,
        competitor: {
          ...f.competitor,
          fulfillment: has ? arr.filter((x) => x !== v) : [...arr, v],
        },
      };
    });
  };

  const badgeToggle = (v: string) => {
    setFilters((f) => {
      const arr = f.competitor.badges;
      const has = arr.includes(v);
      return {
        ...f,
        competitor: {
          ...f.competitor,
          badges: has ? arr.filter((x) => x !== v) : [...arr, v],
        },
      };
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold text-slate-900 sm:text-2xl">
            智能选品
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按预设类目和筛选条件从亚马逊拉取新品数据，纯代码过滤，零 AI 消耗。点击「深度分析」跳转选品分析页做详细评估。
          </p>
        </div>
        {plans.length > 0 && (
          <Button type="button" variant="outline" onClick={() => setNewPlanOpen(true)}>
            <Plus className="mr-1 size-4" />
            新建方案
          </Button>
        )}
      </div>

      {/* No plans: show inline creation */}
      {plansLoaded && plans.length === 0 && (
        <Card>
          <CardContent className="py-10">
            <div className="mx-auto max-w-md space-y-4 text-center">
              <Sparkles className="mx-auto size-10 text-indigo-400" />
              <h2 className="text-lg font-semibold text-slate-800">创建你的第一个选品方案</h2>
              <p className="text-sm text-muted-foreground">
                给方案起个名字（如「2026年5月·护肤选品」），创建后即可勾选类目、设条件、开始扫描。
              </p>
              <div className="flex gap-2 justify-center">
                <Input
                  className="max-w-xs"
                  placeholder="输入方案名称…"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createPlan()}
                />
                <Button onClick={() => createPlan()} disabled={creatingPlan || !newPlanName.trim()}>
                  {creatingPlan ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}
                  创建方案
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Has plans: show plan tabs */}
      {plans.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlanId(p.id)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                planId === p.id
                  ? "bg-indigo-100 text-indigo-900"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {!planId && plans.length > 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            请在上方选择一个方案开始操作。
          </CardContent>
        </Card>
      )}

      {loadingPlan && planId ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
        </div>
      ) : planId ? (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">筛选条件</CardTitle>
                <CardDescription>
                  参考卖家精灵维度；开发标准将传入 Claude 评估 Prompt。
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFiltersOpen((o) => !o)}
              >
                {filtersOpen ? (
                  <ChevronDown className="mr-1 size-4" />
                ) : (
                  <ChevronRight className="mr-1 size-4" />
                )}
                {filtersOpen ? "收起" : "展开"}
              </Button>
            </CardHeader>
            {filtersOpen ? (
              <CardContent className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-800">
                      销售表现
                    </h3>
                    <MinMax
                      label="月销量"
                      min={filters.salesPerformance.monthlySalesMin}
                      max={filters.salesPerformance.monthlySalesMax}
                      onMin={(v) => setSp({ monthlySalesMin: v })}
                      onMax={(v) => setSp({ monthlySalesMax: v })}
                    />
                    <MinMax
                      label="月销售额"
                      min={filters.salesPerformance.monthlyRevenueMin}
                      max={filters.salesPerformance.monthlyRevenueMax}
                      onMin={(v) => setSp({ monthlyRevenueMin: v })}
                      onMax={(v) => setSp({ monthlyRevenueMax: v })}
                    />
                    <MinMax
                      label="子体销量"
                      min={filters.salesPerformance.childSalesMin}
                      max={filters.salesPerformance.childSalesMax}
                      onMin={(v) => setSp({ childSalesMin: v })}
                      onMax={(v) => setSp({ childSalesMax: v })}
                    />
                    <MinMax
                      label="月销量增长率"
                      min={filters.salesPerformance.monthlySalesGrowthMin}
                      max={filters.salesPerformance.monthlySalesGrowthMax}
                      onMin={(v) => setSp({ monthlySalesGrowthMin: v })}
                      onMax={(v) => setSp({ monthlySalesGrowthMax: v })}
                      suffix="%"
                    />
                    <MinMax
                      label="BSR"
                      min={filters.salesPerformance.bsrMin}
                      max={filters.salesPerformance.bsrMax}
                      onMin={(v) => setSp({ bsrMin: v })}
                      onMax={(v) => setSp({ bsrMax: v })}
                    />
                    <MinMax
                      label="小类 BSR"
                      min={filters.salesPerformance.subBsrMin}
                      max={filters.salesPerformance.subBsrMax}
                      onMin={(v) => setSp({ subBsrMin: v })}
                      onMax={(v) => setSp({ subBsrMax: v })}
                    />
                    <MinMax
                      label="BSR 增长数"
                      min={filters.salesPerformance.bsrGrowthCountMin}
                      max={filters.salesPerformance.bsrGrowthCountMax}
                      onMin={(v) => setSp({ bsrGrowthCountMin: v })}
                      onMax={(v) => setSp({ bsrGrowthCountMax: v })}
                    />
                    <MinMax
                      label="BSR 增长率"
                      min={filters.salesPerformance.bsrGrowthRateMin}
                      max={filters.salesPerformance.bsrGrowthRateMax}
                      onMin={(v) => setSp({ bsrGrowthRateMin: v })}
                      onMax={(v) => setSp({ bsrGrowthRateMax: v })}
                      suffix="%"
                    />
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-800">
                      产品信息
                    </h3>
                    <MinMax
                      label="变体数"
                      min={filters.productInfo.variantCountMin}
                      max={filters.productInfo.variantCountMax}
                      onMin={(v) => setPi({ variantCountMin: v })}
                      onMax={(v) => setPi({ variantCountMax: v })}
                    />
                    <MinMax
                      label="价格 ($)"
                      min={filters.productInfo.priceMin}
                      max={filters.productInfo.priceMax}
                      onMin={(v) => setPi({ priceMin: v })}
                      onMax={(v) => setPi({ priceMax: v })}
                    />
                    <MinMax
                      label="Q&A 数量"
                      min={filters.productInfo.qaMin}
                      max={filters.productInfo.qaMax}
                      onMin={(v) => setPi({ qaMin: v })}
                      onMax={(v) => setPi({ qaMax: v })}
                    />
                    <MinMax
                      label="月评新增"
                      min={filters.productInfo.monthlyNewReviewsMin}
                      max={filters.productInfo.monthlyNewReviewsMax}
                      onMin={(v) => setPi({ monthlyNewReviewsMin: v })}
                      onMax={(v) => setPi({ monthlyNewReviewsMax: v })}
                    />
                    <MinMax
                      label="留评率"
                      min={filters.productInfo.reviewRateMin}
                      max={filters.productInfo.reviewRateMax}
                      onMin={(v) => setPi({ reviewRateMin: v })}
                      onMax={(v) => setPi({ reviewRateMax: v })}
                      suffix="%"
                    />
                    <MinMax
                      label="毛利率"
                      min={filters.productInfo.grossMarginMin}
                      max={filters.productInfo.grossMarginMax}
                      onMin={(v) => setPi({ grossMarginMin: v })}
                      onMax={(v) => setPi({ grossMarginMax: v })}
                      suffix="%"
                    />
                    <MinMax
                      label="LQS"
                      min={filters.productInfo.lqsMin}
                      max={filters.productInfo.lqsMax}
                      onMin={(v) => setPi({ lqsMin: v })}
                      onMax={(v) => setPi({ lqsMax: v })}
                    />
                    <div className="space-y-1">
                      <p className={labelCls}>包装尺寸</p>
                      <Select
                        value={filters.productInfo.packageSize || "__none__"}
                        onValueChange={(v) =>
                          setPi({
                            packageSize:
                              !v || v === "__none__" ? "" : String(v),
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue placeholder="不限" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">不限</SelectItem>
                          <SelectItem value="small">小号</SelectItem>
                          <SelectItem value="standard">标准</SelectItem>
                          <SelectItem value="oversize">超大件</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={filters.productInfo.lowPriceProduct}
                        onCheckedChange={(c) =>
                          setPi({ lowPriceProduct: c === true })
                        }
                      />
                      低价商品（Low price）
                    </label>
                    <MinMax
                      label="评分数"
                      min={filters.productInfo.reviewCountMin}
                      max={filters.productInfo.reviewCountMax}
                      onMin={(v) => setPi({ reviewCountMin: v })}
                      onMax={(v) => setPi({ reviewCountMax: v })}
                    />
                    <MinMax
                      label="评分值"
                      min={filters.productInfo.ratingMin}
                      max={filters.productInfo.ratingMax}
                      onMin={(v) => setPi({ ratingMin: v })}
                      onMax={(v) => setPi({ ratingMax: v })}
                    />
                    <MinMax
                      label="FBA 运费 ($)"
                      min={filters.productInfo.fbaFeeMin}
                      max={filters.productInfo.fbaFeeMax}
                      onMin={(v) => setPi({ fbaFeeMin: v })}
                      onMax={(v) => setPi({ fbaFeeMax: v })}
                    />
                    <div className="space-y-1">
                      <p className={labelCls}>上架时间</p>
                      <Select
                        value={filters.productInfo.listingAge || "__none__"}
                        onValueChange={(v) =>
                          setPi({
                            listingAge:
                              !v || v === "__none__" ? "" : String(v),
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue placeholder="不限" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">不限</SelectItem>
                          <SelectItem value="1y">近 1 年</SelectItem>
                          <SelectItem value="2y">近 2 年</SelectItem>
                          <SelectItem value="3y">近 3 年</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <MinMax
                      label="包装重量"
                      min={filters.productInfo.packageWeightMin}
                      max={filters.productInfo.packageWeightMax}
                      onMin={(v) => setPi({ packageWeightMin: v })}
                      onMax={(v) => setPi({ packageWeightMax: v })}
                    />
                    <MinMax
                      label="买家运费 ($)"
                      min={filters.productInfo.buyerShippingMin}
                      max={filters.productInfo.buyerShippingMax}
                      onMin={(v) => setPi({ buyerShippingMin: v })}
                      onMax={(v) => setPi({ buyerShippingMax: v })}
                    />
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-800">
                      竞品筛选
                    </h3>
                    <MinMax
                      label="卖家数量"
                      min={filters.competitor.sellerCountMin}
                      max={filters.competitor.sellerCountMax}
                      onMin={(v) => setCp({ sellerCountMin: v })}
                      onMax={(v) => setCp({ sellerCountMax: v })}
                    />
                    <div className="space-y-1">
                      <p className={labelCls}>卖家所属地</p>
                      <Input
                        className="h-8"
                        placeholder="如 US / CN"
                        value={filters.competitor.sellerRegion}
                        onChange={(e) =>
                          setCp({ sellerRegion: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>包含品牌</p>
                      <Input
                        className="h-8"
                        value={filters.competitor.includeBrands}
                        onChange={(e) =>
                          setCp({ includeBrands: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>排除品牌</p>
                      <Input
                        className="h-8"
                        value={filters.competitor.excludeBrands}
                        onChange={(e) =>
                          setCp({ excludeBrands: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>包含卖家</p>
                      <Input
                        className="h-8"
                        value={filters.competitor.includeSellers}
                        onChange={(e) =>
                          setCp({ includeSellers: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>排除卖家</p>
                      <Input
                        className="h-8"
                        value={filters.competitor.excludeSellers}
                        onChange={(e) =>
                          setCp({ excludeSellers: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>排除关键词</p>
                      <Input
                        className="h-8"
                        value={filters.competitor.excludeKeywords}
                        onChange={(e) =>
                          setCp({ excludeKeywords: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>包含关键词</p>
                      <Input
                        className="h-8"
                        value={filters.competitor.includeKeywords}
                        onChange={(e) =>
                          setCp({ includeKeywords: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>匹配方式</p>
                      <Select
                        value={filters.competitor.includeKeywordMode}
                        onValueChange={(v) =>
                          setCp({
                            includeKeywordMode: v as SmartSelectionFilters["competitor"]["includeKeywordMode"],
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fuzzy">模糊匹配</SelectItem>
                          <SelectItem value="phrase">词组匹配</SelectItem>
                          <SelectItem value="exact">精准匹配</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className={labelCls}>配送方式</p>
                      <div className="flex flex-wrap gap-3 text-sm">
                        {["AMZ", "FBA", "FBM"].map((x) => (
                          <label key={x} className="flex items-center gap-2">
                            <Checkbox
                              checked={filters.competitor.fulfillment.includes(
                                x
                              )}
                              onCheckedChange={() => fulfillmentToggle(x)}
                            />
                            {x}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>主图视频</p>
                      <Select
                        value={filters.competitor.mainImageVideo}
                        onValueChange={(v) =>
                          setCp({
                            mainImageVideo: v as SmartSelectionFilters["competitor"]["mainImageVideo"],
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">不限</SelectItem>
                          <SelectItem value="with">含视频</SelectItem>
                          <SelectItem value="without">不含视频</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className={labelCls}>商品标识</p>
                      <div className="flex flex-col gap-2 text-sm">
                        {(
                          [
                            { k: "Best Seller", l: "Best Seller" },
                            { k: "AmazonChoice", l: "Amazon's Choice" },
                            { k: "NewRelease", l: "New Release" },
                            { k: "APlus", l: "A+" },
                            { k: "NoAPlus", l: "不含 A+" },
                          ] as const
                        ).map(({ k, l }) => (
                          <label key={k} className="flex items-center gap-2">
                            <Checkbox
                              checked={filters.competitor.badges.includes(k)}
                              onCheckedChange={() => badgeToggle(k)}
                            />
                            {l}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <ScanCategoryConfig
                  filters={filters}
                  setFilters={setFilters}
                />

                <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-amber-900">
                    我们的开发标准（AI 评估用）
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className={labelCls}>售价至少 ($)</p>
                      <Input
                        className="h-8"
                        type="number"
                        value={filters.devStandards.minPriceUsd}
                        onChange={(e) =>
                          setDev({
                            minPriceUsd: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className={labelCls}>利润率预估 ≥ (%)</p>
                      <Input
                        className="h-8"
                        type="number"
                        value={filters.devStandards.minProfitMarginPct}
                        onChange={(e) =>
                          setDev({
                            minProfitMarginPct: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={filters.devStandards.requireReviewPainPoints}
                        onCheckedChange={(c) =>
                          setDev({ requireReviewPainPoints: c === true })
                        }
                      />
                      差评中有明显可改进痛点
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={filters.devStandards.avoidBrandMonopoly}
                        onCheckedChange={(c) =>
                          setDev({ avoidBrandMonopoly: c === true })
                        }
                      />
                      品牌集中度不能太高
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={
                          filters.devStandards.requireDifferentiationSpace
                        }
                        onCheckedChange={(c) =>
                          setDev({ requireDifferentiationSpace: c === true })
                        }
                      />
                      有差异化空间（材质/设计/功能/包装）
                    </label>
                    <div className="sm:col-span-2 space-y-1">
                      <p className={labelCls}>供应链说明</p>
                      <Input
                        value={filters.devStandards.supplyChainNote}
                        onChange={(e) =>
                          setDev({ supplyChainNote: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => saveFilters()}
                    disabled={savingFilters}
                  >
                    {savingFilters ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    保存筛选条件
                  </Button>
                  {null}
                </div>
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">操作</CardTitle>
              <CardDescription>
                扫描方案中配置的类目，通过卖家精灵拉取数据并按筛选条件过滤新品。零 AI token 消耗。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto"
                disabled={scanning}
                onClick={() => runScan()}
              >
                {scanning ? (
                  <Loader2 className="mr-2 size-5 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 size-5" />
                )}
                开始智能扫描
              </Button>
              {(scanning || scanProgress > 0) && (
                <div className="space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">{scanStep}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              本次推荐
            </h2>
            {results.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  暂无推荐结果。请先配置扫描类目，然后点击「开始智能扫描」。
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {results.map((row) => {
                  let categoryLabel: string | null = null;
                  let totalRevenue: number | null = null;
                  let shelfDate: string | null = null;
                  try {
                    const pj = JSON.parse(row.productJson) as Record<string, unknown>;
                    if (typeof pj._categoryLabel === "string") categoryLabel = pj._categoryLabel;
                    const rev = typeof pj.totalRevenue === "number" ? pj.totalRevenue
                      : typeof pj.totalAmount === "number" ? pj.totalAmount : null;
                    totalRevenue = rev;
                    const sd = pj.shelfDate ?? pj.availableDate ?? pj.available_date;
                    if (typeof sd === "string" && sd.trim()) shelfDate = sd.trim().slice(0, 10);
                  } catch { /* ignore */ }
                  return (
                    <Card key={row.id} className="overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex gap-3 p-4">
                          <div className="size-20 shrink-0 overflow-hidden rounded-md bg-slate-100">
                            {row.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.imageUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <div className="flex size-full items-center justify-center text-xs text-muted-foreground">无图</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-medium">
                              {row.title ? (row.title.length > 50 ? row.title.slice(0, 50) + "…" : row.title) : row.asin}
                            </p>
                            <p className="mt-1 font-mono text-xs text-muted-foreground">{row.asin}</p>
                            {categoryLabel && (
                              <Badge variant="secondary" className="mt-1 text-[10px]">{categoryLabel}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1 border-t border-slate-100 px-4 py-2 text-center text-xs">
                          <div>
                            <p className="font-medium text-slate-700">{row.price != null ? `$${row.price}` : "—"}</p>
                            <p className="text-muted-foreground">售价</p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">{row.monthlySales ?? "—"}</p>
                            <p className="text-muted-foreground">月销量</p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">{totalRevenue != null ? `$${Math.round(totalRevenue).toLocaleString()}` : "—"}</p>
                            <p className="text-muted-foreground">月收入</p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">{row.reviewCount ?? "—"}</p>
                            <p className="text-muted-foreground">评论数</p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">{row.rating != null ? `★${row.rating}` : "—"}</p>
                            <p className="text-muted-foreground">评分</p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">{shelfDate ?? "—"}</p>
                            <p className="text-muted-foreground">上架</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
                          <Link
                            href={`/dashboard/product-analysis?prefill=${encodeURIComponent(row.asin)}&marketplace=${encodeURIComponent(row.marketplace || currentPlan?.marketplace || "US")}&forceRefresh=1`}
                            className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1")}
                          >
                            <Microscope className="size-3.5" />
                            深度分析
                          </Link>
                          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => postCandidate(row)}>
                            <Pause className="size-3.5" />
                            暂缓
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => postExclude(row.asin)}>
                            <X className="size-3.5" />
                            不感兴趣
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="secondary"
                disabled={scanning}
                onClick={() => runScan()}
              >
                重新扫描
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCandidatesOpen(true)}
              >
                候选清单
                {stats?.candidate != null && stats.candidate > 0 ? (
                  <Badge className="ml-2" variant="secondary">
                    {stats.candidate}
                  </Badge>
                ) : null}
              </Button>
            </div>

            {stats ? (
              <p className="mt-4 text-sm text-muted-foreground">
                已扫描（累计记录）{stats.totalResults} 条 · 推荐{" "}
                {stats.recommended} · 候选 {stats.candidate} · 排除表{" "}
                {stats.excludeListCount}
                {stats.lastBatchAt
                  ? ` · 最近批次 ${new Date(stats.lastBatchAt).toLocaleString("zh-CN")}`
                  : ""}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <Sheet open={candidatesOpen} onOpenChange={setCandidatesOpen}>
        <SheetContent
          className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-xl"
          showCloseButton
        >
          <SheetHeader className="border-b border-slate-100 pb-4 text-left">
            <SheetTitle>候选清单</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => exportCandidatesCsv()}
                disabled={!candidates.length}
              >
                导出 CSV
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => loadCandidates()}
                disabled={loadingCandidates}
              >
                {loadingCandidates ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "刷新"
                )}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ASIN</TableHead>
                    <TableHead>标题</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-10 text-center text-muted-foreground"
                      >
                        暂无候选
                      </TableCell>
                    </TableRow>
                  ) : (
                    candidates.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">
                          {r.asin}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {r.title ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/dashboard/product-analysis?asin=${encodeURIComponent(r.asin)}&marketplace=${encodeURIComponent(r.marketplace || "US")}`}
                            className={cn(
                              buttonVariants({ variant: "link", size: "sm" }),
                              "h-auto px-0"
                            )}
                          >
                            完整分析
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建选品方案</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <p className={labelCls}>方案名称</p>
              <Input
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createPlan()}
                placeholder="如：2026年5月·护肤选品"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewPlanOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => createPlan()} disabled={creatingPlan || !newPlanName.trim()}>
              {creatingPlan ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
