"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Search,
  Star,
  Store,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  Tag,
  Users,
  DollarSign,
  ShoppingBag,
  Clock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TaskStatus = "pending" | "running" | "done" | "failed";

type TaskSummary = {
  id: string;
  keyword: string;
  status: TaskStatus;
  totalFound: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type EtsyProductRow = {
  id: string;
  listingId: string;
  url: string;
  title: string;
  price: number | null;
  currencyCode: string | null;
  shopName: string;
  shopUrl: string | null;
  shopSales: number | null;
  favoriteCount: number | null;
  reviewCount: number | null;
  rating: number | null;
  tags: string[];
  imageUrl: string | null;
  aiAnalyzed: boolean;
  aiSellingPoints: string | null;
  aiPricingStrategy: string | null;
  aiKeywords: string[];
  aiTargetAudience: string | null;
  aiSummary: string | null;
};

type TaskDetail = TaskSummary & {
  products: EtsyProductRow[];
};

type SearchFilters = {
  minShopSales: string;
  minReviews: string;
  minRating: string;
  minPrice: string;
  maxPrice: string;
  maxPages: string;
};

const DEFAULT_FILTERS: SearchFilters = {
  minShopSales: "1000",
  minReviews: "",
  minRating: "",
  minPrice: "",
  maxPrice: "",
  maxPages: "3",
};

function StatusBadge({ status }: { status: TaskStatus }) {
  if (status === "running")
    return (
      <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
        <Loader2 className="mr-1 size-3 animate-spin" />
        进行中
      </Badge>
    );
  if (status === "done")
    return (
      <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700">
        <CheckCircle2 className="mr-1 size-3" />
        完成
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
        <AlertCircle className="mr-1 size-3" />
        失败
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-gray-300 text-gray-600">
      <Clock className="mr-1 size-3" />
      等待中
    </Badge>
  );
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex items-center gap-1 text-sm font-medium text-amber-600">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      {rating.toFixed(1)}
    </span>
  );
}

function ProductCard({
  product,
  onAnalyze,
  analyzing,
}: {
  product: EtsyProductRow;
  keyword?: string;
  onAnalyze: (id: string) => void;
  analyzing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          {/* Image */}
          <div className="shrink-0">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.title}
                className="size-20 rounded-lg object-cover ring-1 ring-slate-200 sm:size-24"
                loading="lazy"
              />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-lg bg-slate-100 text-slate-400 sm:size-24">
                <ShoppingBag className="size-8" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start gap-2">
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm font-medium text-slate-900 hover:text-indigo-600 hover:underline line-clamp-2"
              >
                {product.title}
                <ExternalLink className="ml-1 inline size-3 text-slate-400" />
              </a>
            </div>

            {/* Metrics */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {product.price != null && (
                <span className="flex items-center gap-1 font-semibold text-slate-800">
                  <DollarSign className="size-3.5 text-green-600" />
                  {product.price.toFixed(2)} {product.currencyCode ?? "USD"}
                </span>
              )}
              {product.shopSales != null && (
                <span className="flex items-center gap-1">
                  <Store className="size-3.5 text-indigo-500" />
                  店铺 {product.shopSales.toLocaleString()} 销量
                </span>
              )}
              <StarRating rating={product.rating} />
              {product.reviewCount != null && (
                <span>{product.reviewCount.toLocaleString()} 评论</span>
              )}
              {product.favoriteCount != null && (
                <span>❤ {product.favoriteCount.toLocaleString()}</span>
              )}
            </div>

            {/* Shop link */}
            {product.shopUrl ? (
              <a
                href={product.shopUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
              >
                <Store className="size-3" />
                {product.shopName}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">{product.shopName}</span>
            )}

            {/* AI Summary */}
            {product.aiSummary && (
              <p className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-800">
                <Sparkles className="mr-1 inline size-3 text-indigo-500" />
                {product.aiSummary}
              </p>
            )}
          </div>
        </div>

        {/* Tags */}
        {product.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t px-4 py-2">
            {product.tags.slice(0, 8).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* AI Analysis section */}
        {product.aiAnalyzed ? (
          <div>
            <button
              type="button"
              className="flex w-full items-center justify-between border-t bg-gradient-to-r from-indigo-50/80 to-purple-50/50 px-4 py-2 text-xs font-medium text-indigo-700 hover:from-indigo-100/80"
              onClick={() => setExpanded((v) => !v)}
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                AI 分析结果
              </span>
              {expanded ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
            {expanded && (
              <div className="space-y-3 border-t bg-gradient-to-b from-indigo-50/40 to-white px-4 py-3">
                {product.aiSellingPoints && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-slate-700">
                      核心卖点
                    </h4>
                    <p className="text-xs leading-relaxed text-slate-600">
                      {product.aiSellingPoints}
                    </p>
                  </div>
                )}
                {product.aiPricingStrategy && (
                  <div>
                    <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <DollarSign className="size-3.5 text-green-600" />
                      定价策略
                    </h4>
                    <p className="text-xs leading-relaxed text-slate-600">
                      {product.aiPricingStrategy}
                    </p>
                  </div>
                )}
                {product.aiTargetAudience && (
                  <div>
                    <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Users className="size-3.5 text-violet-600" />
                      目标客群
                    </h4>
                    <p className="text-xs leading-relaxed text-slate-600">
                      {product.aiTargetAudience}
                    </p>
                  </div>
                )}
                {product.aiKeywords && product.aiKeywords.length > 0 && (
                  <div>
                    <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Tag className="size-3.5 text-blue-600" />
                      推荐关键词
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {product.aiKeywords.map((kw) => (
                        <Badge
                          key={kw}
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-[10px] text-blue-700"
                        >
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-end border-t px-4 py-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={analyzing}
              onClick={() => onAnalyze(product.id)}
            >
              {analyzing ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 size-3" />
              )}
              AI 分析卖点
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EtsySelectionWorkspace() {
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/etsy/tasks");
    const j = await res.json().catch(() => []);
    if (res.ok) setTasks(j as TaskSummary[]);
  }, []);

  const loadDetail = useCallback(async (taskId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/etsy/tasks/${taskId}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setTaskDetail(j as TaskDetail);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Poll running tasks
  useEffect(() => {
    const poll = async () => {
      const running = tasks.some((t) => t.status === "running" || t.status === "pending");
      if (!running) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }
      await loadTasks();
      if (activeTaskId) {
        const active = tasks.find((t) => t.id === activeTaskId);
        if (active?.status === "running" || active?.status === "pending") {
          await loadDetail(activeTaskId);
        }
      }
    };

    if (tasks.some((t) => t.status === "running" || t.status === "pending")) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => void poll(), 4000);
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [tasks, activeTaskId, loadTasks, loadDetail]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (activeTaskId) void loadDetail(activeTaskId);
  }, [activeTaskId, loadDetail]);

  async function handleSearch() {
    const kw = keyword.trim();
    if (!kw) {
      toast.error("请输入搜索关键词");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        keyword: kw,
        aiAnalyze: true,
        maxPages: parseInt(filters.maxPages) || 3,
        ...(filters.minShopSales ? { minShopSales: parseInt(filters.minShopSales) } : {}),
        ...(filters.minReviews ? { minReviews: parseInt(filters.minReviews) } : {}),
        ...(filters.minRating ? { minRating: parseFloat(filters.minRating) } : {}),
        ...(filters.minPrice ? { minPrice: parseFloat(filters.minPrice) } : {}),
        ...(filters.maxPrice ? { maxPrice: parseFloat(filters.maxPrice) } : {}),
      };

      const res = await fetch("/api/etsy/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string }).message ?? "创建任务失败");

      const { taskId } = j as { taskId: string };
      toast.success("搜索任务已启动，正在抓取数据…");
      await loadTasks();
      setActiveTaskId(taskId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAnalyze(productId: string) {
    if (!activeTaskId || analyzingId) return;
    setAnalyzingId(productId);
    try {
      const res = await fetch(`/api/etsy/tasks/${activeTaskId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [productId] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string }).message ?? "分析失败");
      toast.success("AI 分析完成");
      await loadDetail(activeTaskId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分析失败");
    } finally {
      setAnalyzingId(null);
    }
  }

  async function handleAnalyzeAll() {
    if (!activeTaskId || analyzingAll) return;
    setAnalyzingAll(true);
    try {
      const res = await fetch(`/api/etsy/tasks/${activeTaskId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string }).message ?? "分析失败");
      const { analyzed } = j as { analyzed: number };
      toast.success(`已完成 ${analyzed} 个产品的 AI 分析`);
      await loadDetail(activeTaskId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分析失败");
    } finally {
      setAnalyzingAll(false);
    }
  }

  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null;
  const unanalyzedCount = taskDetail?.products.filter((p) => !p.aiAnalyzed).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-10">
      {/* Header */}
      <div>
        <h1 className="font-heading text-xl font-semibold text-slate-900 sm:text-2xl">
          Etsy 选品助手
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          输入关键词（如 men&apos;s toupee），自动抓取高销量产品链接，并用 AI
          分析产品卖点、定价策略和目标客群。
        </p>
      </div>

      {/* Search card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">搜索 Etsy 产品</CardTitle>
          <CardDescription>输入产品关键词，系统将抓取 Etsy 搜索结果并筛选高销量店铺的产品</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="例如：men's toupee、personalized jewelry…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !submitting && void handleSearch()}
              className="flex-1"
            />
            <Button
              type="button"
              disabled={submitting || !keyword.trim()}
              onClick={() => void handleSearch()}
            >
              {submitting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Search className="mr-2 size-4" />
              )}
              搜索
            </Button>
          </div>

          {/* Filters toggle */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              {filtersOpen ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
              高级筛选条件
            </button>
            {filtersOpen && (
              <div className="mt-3 grid gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">最低店铺销量</p>
                  <Input
                    className="h-8"
                    type="number"
                    placeholder="1000"
                    value={filters.minShopSales}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, minShopSales: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">最低评论数</p>
                  <Input
                    className="h-8"
                    type="number"
                    placeholder="不限"
                    value={filters.minReviews}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, minReviews: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">最低评分</p>
                  <Input
                    className="h-8"
                    type="number"
                    step="0.1"
                    placeholder="不限"
                    value={filters.minRating}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, minRating: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">最低价格 ($)</p>
                  <Input
                    className="h-8"
                    type="number"
                    placeholder="不限"
                    value={filters.minPrice}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, minPrice: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">最高价格 ($)</p>
                  <Input
                    className="h-8"
                    type="number"
                    placeholder="不限"
                    value={filters.maxPrice}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, maxPrice: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-600">抓取页数 (1-5)</p>
                  <Input
                    className="h-8"
                    type="number"
                    min="1"
                    max="5"
                    value={filters.maxPages}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, maxPages: e.target.value }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Task history */}
      {tasks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">搜索历史</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {tasks.slice(0, 10).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTaskId(t.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors text-left",
                    activeTaskId === t.id
                      ? "bg-indigo-100 text-indigo-900"
                      : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <StatusBadge status={t.status} />
                  <span className="flex-1 font-medium truncate">{t.keyword}</span>
                  {t.totalFound != null && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t.totalFound} 个产品
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task detail / results */}
      {activeTaskId && (
        <div className="space-y-4">
          {/* Task status header */}
          {activeTask && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status={activeTask.status} />
                <h2 className="text-base font-semibold text-slate-800">
                  &ldquo;{activeTask.keyword}&rdquo; 的搜索结果
                </h2>
                {activeTask.totalFound != null && (
                  <span className="text-sm text-muted-foreground">
                    共 {activeTask.totalFound} 个产品
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadDetail(activeTaskId)}
                  disabled={loadingDetail}
                >
                  <RefreshCw
                    className={cn("mr-1.5 size-3.5", loadingDetail && "animate-spin")}
                  />
                  刷新
                </Button>
                {unanalyzedCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleAnalyzeAll()}
                    disabled={analyzingAll}
                  >
                    {analyzingAll ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 size-3.5" />
                    )}
                    AI 分析全部 ({unanalyzedCount})
                  </Button>
                )}
              </div>
            </div>
          )}

          {activeTask?.status === "failed" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mr-2 inline size-4" />
              搜索失败：{activeTask.errorMessage ?? "未知错误"}
            </div>
          )}

          {activeTask?.status === "running" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="size-5 animate-spin text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-800">正在抓取 Etsy 数据…</p>
                  <p className="text-xs text-blue-600">
                    系统正在搜索并分析产品，通常需要 1-3 分钟，请稍等。页面将自动刷新。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loadingDetail && (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
            </div>
          )}

          {/* Products list */}
          {!loadingDetail && taskDetail && taskDetail.products.length > 0 && (
            <div className="grid gap-4">
              {taskDetail.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAnalyze={(id) => void handleAnalyze(id)}
                  analyzing={analyzingId === product.id}
                />
              ))}
            </div>
          )}

          {/* Empty */}
          {!loadingDetail &&
            taskDetail &&
            taskDetail.status === "done" &&
            taskDetail.products.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <ShoppingBag className="mx-auto mb-4 size-12 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">
                    未找到符合条件的产品
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    尝试降低筛选条件（如最低店铺销量）或更换关键词
                  </p>
                </CardContent>
              </Card>
            )}
        </div>
      )}

      {/* Empty state */}
      {tasks.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="mx-auto mb-4 size-12 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              输入关键词开始 Etsy 选品
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              例如：men&apos;s toupee、custom necklace、handmade candle…
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
