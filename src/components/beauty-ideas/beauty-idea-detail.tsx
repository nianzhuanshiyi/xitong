"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type IdeaDetail = {
  id: string;
  name: string;
  category: string;
  description: string;
  targetMarket: string;
  keyIngredients: string[];
  sellingPoints: string[];
  estimatedPrice: string | null;
  estimatedCost: string | null;
  searchVolume: number | null;
  competitionLevel: string | null;
  avgPrice: number | null;
  avgRating: number | null;
  topCompetitors: string[];
  trendScore: number;
  marketScore: number;
  competitionScore: number;
  profitScore: number;
  totalScore: number;
  recommendation: string;
  aiAnalysis: string | null;
  status: string;
  createdAt: string;
  trend: {
    title: string;
    market: string;
    content: string;
    ingredients: string[];
    trendScore: number;
    source: string;
  } | null;
  comments: { id: string; content: string; createdBy: string; createdAt: string }[];
};

const STATUSES = [
  { value: "draft", label: "草稿" },
  { value: "validated", label: "已验证" },
  { value: "developing", label: "开发中" },
  { value: "abandoned", label: "已放弃" },
];

const REC_CONFIG: Record<string, { label: string; color: string }> = {
  strong_go: { label: "强烈推荐", color: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
  go: { label: "推荐", color: "bg-blue-100 text-blue-800 ring-blue-300" },
  watch: { label: "观望", color: "bg-amber-100 text-amber-800 ring-amber-300" },
  pass: { label: "放弃", color: "bg-slate-100 text-slate-600 ring-slate-300" },
};

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(score, 100) / 100;
  const color = score >= 70 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={5} strokeLinecap="round"
        strokeDasharray={`${pct * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size * 0.3} fontWeight="bold" fill={color}>
        {score}
      </text>
    </svg>
  );
}

function SubBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 shrink-0 text-right text-slate-500">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(value / 25) * 100}%` }} />
      </div>
      <span className="w-6 text-right font-semibold text-slate-700">{value}/25</span>
    </div>
  );
}

export function BeautyIdeaDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/beauty-ideas/${id}`);
      if (!r.ok) { toast.error("加载失败"); return; }
      setData(await r.json());
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (status: string) => {
    const r = await fetch(`/api/beauty-ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (r.ok) { toast.success("状态已更新"); load(); }
    else toast.error("更新失败");
  };

  const handleDelete = async () => {
    if (!confirm("确定删除此创意？")) return;
    const r = await fetch(`/api/beauty-ideas/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("已删除"); router.push("/dashboard/beauty-ideas"); }
    else toast.error("删除失败");
  };

  const submitComment = async () => {
    if (!comment.trim()) return;
    setCommentBusy(true);
    try {
      const r = await fetch(`/api/beauty-ideas/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment }),
      });
      if (r.ok) { setComment(""); load(); toast.success("已添加评论"); }
      else toast.error("添加失败");
    } finally { setCommentBusy(false); }
  };

  const handleCreateProductDev = async () => {
    if (!data) return;
    try {
      const r = await fetch("/api/product-dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.name,
          description: data.description,
          category: data.category,
          targetMarket: data.targetMarket,
        }),
      });
      if (r.ok) {
        const j = await r.json();
        toast.success("已转入产品开发");
        updateStatus("developing");
        router.push(`/dashboard/product-dev/${j.id}`);
      } else toast.error("创建失败");
    } catch { toast.error("创建失败"); }
  };

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-slate-400" /></div>;
  }

  const rec = REC_CONFIG[data.recommendation] ?? REC_CONFIG.watch;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/beauty-ideas" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> 返回列表
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Product info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{data.name}</CardTitle>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{data.category}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{data.targetMarket}</span>
                <span className={cn("rounded px-2 py-0.5 text-xs font-medium ring-1", rec.color)}>{rec.label}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-slate-700">产品描述</h4>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">{data.description}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-700">核心成分</h4>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {data.keyIngredients.map((ing, i) => (
                    <span key={i} className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">{ing}</span>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-700">卖点</h4>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-slate-600">
                  {data.sellingPoints.map((sp, i) => <li key={i}>{sp}</li>)}
                </ul>
              </div>
              <div className="flex gap-6 text-sm">
                {data.estimatedPrice && <div><span className="text-slate-500">预估售价：</span><span className="font-medium">{data.estimatedPrice}</span></div>}
                {data.estimatedCost && <div><span className="text-slate-500">预估成本：</span><span className="font-medium">{data.estimatedCost}</span></div>}
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis */}
          {data.aiAnalysis && (
            <Card>
              <CardHeader><CardTitle className="text-base">AI 分析报告</CardTitle></CardHeader>
              <CardContent>
                <div className="prose prose-sm prose-slate max-w-none whitespace-pre-wrap">{data.aiAnalysis}</div>
              </CardContent>
            </Card>
          )}

          {/* Trend source */}
          {data.trend && (
            <Card>
              <CardHeader><CardTitle className="text-base">趋势来源</CardTitle></CardHeader>
              <CardContent>
                <h4 className="font-medium">{data.trend.title}</h4>
                <div className="mt-1 flex gap-2 text-xs text-slate-500">
                  <span>市场: {data.trend.market}</span>
                  <span>来源: {data.trend.source}</span>
                  <span>热度: {data.trend.trendScore}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{data.trend.content}</p>
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-1.5"><MessageSquare className="size-4" /> 讨论</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <input
                  className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="添加评论…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
                />
                <Button size="sm" onClick={submitComment} disabled={commentBusy || !comment.trim()}>
                  <Send className="size-3.5" />
                </Button>
              </div>
              {data.comments.length === 0 ? (
                <p className="text-xs text-slate-400">暂无评论</p>
              ) : (
                <div className="space-y-2">
                  {data.comments.map((c) => (
                    <div key={c.id} className="rounded border bg-slate-50 px-3 py-2 text-sm">
                      <p>{c.content}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString("zh-CN")}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Score card */}
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-4">
              <ScoreRing score={data.totalScore} size={100} />
              <span className={cn("rounded-full px-3 py-1 text-sm font-semibold ring-1", rec.color)}>{rec.label}</span>
              <div className="w-full space-y-2 pt-2">
                <SubBar label="趋势" value={data.trendScore} />
                <SubBar label="市场" value={data.marketScore} />
                <SubBar label="竞争" value={data.competitionScore} />
                <SubBar label="利润" value={data.profitScore} />
              </div>
            </CardContent>
          </Card>

          {/* Market data */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">市场数据</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">月搜索量</span><span className="font-medium">{data.searchVolume?.toLocaleString() ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">竞争程度</span><span className="font-medium">{data.competitionLevel ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">市场均价</span><span className="font-medium">{data.avgPrice ? `$${data.avgPrice.toFixed(2)}` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">平均评分</span><span className="font-medium">{data.avgRating?.toFixed(1) ?? "—"}</span></div>
              {data.topCompetitors.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">头部竞品</p>
                  <div className="flex flex-wrap gap-1">
                    {data.topCompetitors.map((asin, i) => (
                      <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">{asin}</span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">状态管理</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {STATUSES.map((s) => (
                  <Button
                    key={s.value}
                    size="sm"
                    variant={data.status === s.value ? "default" : "outline"}
                    className="text-xs"
                    onClick={() => updateStatus(s.value)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-2">
            <Button className="w-full gap-1.5" onClick={handleCreateProductDev}>
              转入产品开发
            </Button>
            <Button variant="destructive" size="sm" className="w-full gap-1.5" onClick={handleDelete}>
              <Trash2 className="size-3.5" /> 删除创意
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
