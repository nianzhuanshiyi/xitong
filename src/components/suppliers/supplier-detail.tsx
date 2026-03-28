"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Sparkles,
  Upload,
  Eye,
  Download,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  FILE_CATEGORY_LABEL,
  SUPPLIER_STATUS_LABEL,
  countryFlag,
} from "@/lib/supplier-labels";

type FileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  uploadedAt: string;
  analysis: {
    summary: string | null;
    structuredJson: string | null;
    certExpiryDate: string | null;
  } | null;
};

type FullSupplier = {
  id: string;
  name: string;
  nameEn: string | null;
  country: string;
  countryCode: string | null;
  website: string | null;
  address: string | null;
  mainCategories: string | null;
  contact: string | null;
  paymentTerms: string | null;
  moq: string | null;
  sampleLeadDays: number | null;
  productionLeadDays: number | null;
  cooperationStartDate: string | null;
  remarks: string | null;
  status: string;
  overallScore: number | null;
  profileSummary: string | null;
  aiEvaluationJson: string | null;
  websiteScrapedAt: string | null;
  updatedAt: string;
  contacts: Array<{
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    wechat: string | null;
    whatsapp: string | null;
    lineId: string | null;
    isPrimary: boolean;
  }>;
  files: FileRow[];
  ratings: Array<{
    id: string;
    quality: number;
    priceCompete: number;
    delivery: number;
    communication: number;
    cooperation: number;
    rdCapability: number;
    comment: string | null;
    createdAt: string;
  }>;
  orders: Array<{
    id: string;
    orderDate: string;
    productDesc: string;
    quantity: number | null;
    amount: number | null;
    currency: string | null;
    status: string | null;
  }>;
  samples: Array<{
    id: string;
    sampleDate: string;
    productDesc: string;
    status: string | null;
    notes: string | null;
  }>;
  qualityIssues: Array<{
    id: string;
    issueDate: string;
    description: string;
    severity: string | null;
  }>;
  supplierNotes: Array<{
    id: string;
    title: string | null;
    content: string;
    createdAt: string;
  }>;
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

export function SupplierDetail({ id }: { id: string }) {
  const [data, setData] = useState<FullSupplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{
    fileId: string;
    name: string;
    mime: string;
  } | null>(null);
  const [drag, setDrag] = useState(false);
  const [uploadCat, setUploadCat] = useState("");
  const [matchHint, setMatchHint] = useState("");
  const [matchResult, setMatchResult] = useState<unknown>(null);

  const [form, setForm] = useState<Partial<FullSupplier>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "加载失败");
      setData(j);
      setForm(j);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveBasic() {
    setSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          nameEn: form.nameEn,
          country: form.country,
          countryCode: form.countryCode,
          website: form.website,
          address: form.address,
          mainCategories: form.mainCategories,
          contact: form.contact,
          paymentTerms: form.paymentTerms,
          moq: form.moq,
          sampleLeadDays: form.sampleLeadDays,
          productionLeadDays: form.productionLeadDays,
          cooperationStartDate: form.cooperationStartDate
            ? new Date(form.cooperationStartDate).toISOString()
            : null,
          remarks: form.remarks,
          status: form.status,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "保存失败");
      toast.success("已保存");
      setData((d) => (d ? { ...d, ...j } : j));
      setForm((f) => ({ ...f, ...j }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function scrape() {
    try {
      const res = await fetch(`/api/suppliers/${id}/scrape-website`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "抓取失败");
      toast.success("网站信息已更新");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "抓取失败");
    }
  }

  async function evaluate() {
    try {
      const res = await fetch(`/api/suppliers/${id}/evaluate`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "评估失败");
      toast.success("AI 综合评估已更新");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "评估失败");
    }
  }

  async function runMatch() {
    if (!matchHint.trim()) {
      toast.error("请填写品类或需求描述");
      return;
    }
    try {
      const res = await fetch("/api/suppliers/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryHint: matchHint }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "匹配失败");
      setMatchResult(j.matches ?? j);
      toast.success("已生成推荐");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "匹配失败");
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    const fd = new FormData();
    if (uploadCat) fd.set("category", uploadCat);
    arr.forEach((f) => fd.append("file", f));
    try {
      const res = await fetch(`/api/suppliers/${id}/files`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "上传失败");
      toast.success("上传成功");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    }
  }

  async function analyzeFile(fileId: string) {
    try {
      const res = await fetch(`/api/suppliers/${id}/files/${fileId}/analyze`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "分析失败");
      toast.success("AI 分析完成");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分析失败");
    }
  }

  async function patchFileCategory(fileId: string, category: string) {
    await fetch(`/api/suppliers/${id}/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    await load();
  }

  async function deleteFile(fileId: string) {
    if (!confirm("确定删除该文件？")) return;
    const res = await fetch(`/api/suppliers/${id}/files/${fileId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("已删除");
      await load();
    }
  }

  const contentUrl = (fileId: string, mode: "inline" | "download") =>
    `/api/suppliers/${id}/files/${fileId}/content?mode=${mode}`;

  const evalParsed = data?.aiEvaluationJson
    ? (() => {
        try {
          return JSON.parse(data.aiEvaluationJson!) as Record<string, unknown>;
        } catch {
          return null;
        }
      })()
    : null;

  const certAlerts =
    data?.files.flatMap((f) => {
      const raw = f.analysis?.certExpiryDate;
      if (!raw) return [];
      const exp = new Date(raw);
      const now = new Date();
      const diff = exp.getTime() - now.getTime();
      if (diff <= 0 || diff > 30 * 86400000) return [];
      return [exp];
    }) ?? [];

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-500">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="py-12 text-center text-slate-500">
        未找到供应商。{" "}
        <Link href="/dashboard/suppliers" className="text-indigo-600 underline">
          返回列表
        </Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/suppliers"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft className="mr-1 size-4" />
          返回列表
        </Link>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <h1 className="font-heading text-2xl font-semibold text-slate-900">
          {data.name}
        </h1>
        <Badge variant="secondary">
          {countryFlag(data.countryCode)} {data.country}
        </Badge>
        <Badge className="bg-indigo-50 text-indigo-800 hover:bg-indigo-50">
          {SUPPLIER_STATUS_LABEL[data.status] ?? data.status}
        </Badge>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-slate-100/80 p-1">
          <TabsTrigger value="basic">基本信息</TabsTrigger>
          <TabsTrigger value="files">文件资料</TabsTrigger>
          <TabsTrigger value="ai">AI 分析</TabsTrigger>
          <TabsTrigger value="records">合作记录</TabsTrigger>
          <TabsTrigger value="rating">评分</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="mt-6 space-y-6">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">公司信息</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>公司名称（中文）</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>英文名称</Label>
                <Input
                  value={form.nameEn ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nameEn: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>国家代码</Label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={form.countryCode ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, countryCode: e.target.value || null }))
                  }
                >
                  <option value="">未设置</option>
                  <option value="US">美国 US</option>
                  <option value="KR">韩国 KR</option>
                  <option value="CN">中国 CN</option>
                  <option value="OTHER">其他</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>国家/地区（显示）</Label>
                <Input
                  value={form.country ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, country: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="mb-0">官网</Label>
                  {form.website && (
                    <a
                      href={
                        form.website.startsWith("http")
                          ? form.website
                          : `https://${form.website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                    >
                      打开 <ExternalLink className="size-3.5" />
                    </a>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => scrape()}
                  >
                    <Sparkles className="mr-1 size-3.5" />
                    AI 抓取网站信息
                  </Button>
                </div>
                <Input
                  value={form.website ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, website: e.target.value }))
                  }
                  placeholder="https://"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>详细地址</Label>
                <textarea
                  className="min-h-[72px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                  value={form.address ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>主营品类（逗号分隔）</Label>
                <Input
                  value={form.mainCategories ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, mainCategories: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>合作状态</Label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={form.status ?? "EVALUATING"}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  <option value="COOPERATING">已合作</option>
                  <option value="EVALUATING">评估中</option>
                  <option value="CANDIDATE">备选</option>
                  <option value="REJECTED">已淘汰</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>付款方式</Label>
                <Input
                  value={form.paymentTerms ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, paymentTerms: e.target.value }))
                  }
                  placeholder="T/T、信用证、账期…"
                />
              </div>
              <div className="space-y-2">
                <Label>最小起订 MOQ</Label>
                <Input
                  value={form.moq ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, moq: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>打样周期（天）</Label>
                <Input
                  type="number"
                  value={form.sampleLeadDays ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sampleLeadDays: e.target.value
                        ? Number(e.target.value)
                        : null,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>生产周期（天）</Label>
                <Input
                  type="number"
                  value={form.productionLeadDays ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      productionLeadDays: e.target.value
                        ? Number(e.target.value)
                        : null,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>合作开始日期</Label>
                <Input
                  type="datetime-local"
                  value={
                    form.cooperationStartDate
                      ? new Date(form.cooperationStartDate)
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cooperationStartDate: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>备注</Label>
                <textarea
                  className="min-h-[88px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                  value={form.remarks ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, remarks: e.target.value }))
                  }
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button onClick={() => saveBasic()} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <ContactsSection supplierId={id} contacts={data.contacts} onChange={load} />
        </TabsContent>

        <TabsContent value="files" className="mt-6 space-y-6">
          <Card
            className={cn(
              "border-2 border-dashed transition-colors",
              drag ? "border-indigo-400 bg-indigo-50/40" : "border-slate-200"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              uploadFiles(e.dataTransfer.files);
            }}
          >
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <Upload className="size-10 text-indigo-400" />
              <p className="text-sm font-medium text-slate-700">
                拖拽文件到此处，或选择文件（支持批量）
              </p>
              <p className="text-center text-xs text-slate-500">
                PDF、Word、Excel、PPT、jpg/png/webp
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <select
                  className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
                  value={uploadCat}
                  onChange={(e) => setUploadCat(e.target.value)}
                >
                  <option value="">上传后 AI 自动分类</option>
                  {Object.entries(FILE_CATEGORY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <Input
                  type="file"
                  multiple
                  className="max-w-xs cursor-pointer text-sm"
                  onChange={(e) => {
                    if (e.target.files) uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {data.files.map((f) => (
              <Card key={f.id} className="border-slate-200/80 shadow-sm">
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-medium text-slate-900">{f.originalName}</div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <select
                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs"
                        value={f.category}
                        onChange={(e) => patchFileCategory(f.id, e.target.value)}
                      >
                        {Object.entries(FILE_CATEGORY_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <span>{fmtBytes(f.size)}</span>
                      <span>{fmtTime(f.uploadedAt)}</span>
                    </div>
                    {f.analysis?.summary && (
                      <p className="text-sm text-slate-600 line-clamp-2">
                        {f.analysis.summary}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(f.mimeType.startsWith("image/") ||
                      f.mimeType === "application/pdf") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPreview({
                            fileId: f.id,
                            name: f.originalName,
                            mime: f.mimeType,
                          })
                        }
                      >
                        <Eye className="mr-1 size-3.5" />
                        预览
                      </Button>
                    )}
                    <a
                      href={contentUrl(f.id, "download")}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Download className="mr-1 size-3.5" />
                      下载
                    </a>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => analyzeFile(f.id)}
                    >
                      <Sparkles className="mr-1 size-3.5" />
                      AI 分析
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => deleteFile(f.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {data.files.length === 0 && (
              <p className="text-center text-sm text-slate-500">暂无文件</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="ai" className="mt-6 space-y-6">
          {certAlerts.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/80">
              <CardHeader>
                <CardTitle className="text-base text-amber-900">
                  资质证书即将到期（30 天内）
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-amber-900">
                {certAlerts.map((d, i) => (
                  <div key={i}>{d.toLocaleDateString("zh-CN")}</div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">供应商画像摘要</CardTitle>
              <Button size="sm" variant="secondary" onClick={() => evaluate()}>
                <Sparkles className="mr-1 size-3.5" />
                生成 / 刷新综合评估
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-700">
              <div>
                <div className="mb-1 font-medium text-slate-900">画像</div>
                <p className="rounded-lg bg-slate-50 p-3 leading-relaxed">
                  {data.profileSummary || "暂无，可先使用「AI 抓取网站信息」或上传资料后综合评估。"}
                </p>
              </div>
              {data.websiteScrapedAt && (
                <p className="text-xs text-slate-500">
                  最近网站抓取：{fmtTime(data.websiteScrapedAt)}
                </p>
              )}
            </CardContent>
          </Card>

          {evalParsed && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-indigo-100 bg-indigo-50/40 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base text-indigo-950">
                    综合评分（AI）
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-3xl font-semibold text-indigo-800">
                  {String(evalParsed.overallScore ?? "—")} / 5
                </CardContent>
              </Card>
              <Card className="border-emerald-100 bg-emerald-50/30 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">优势</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {(evalParsed.strengths as string[] | undefined)?.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-rose-100 bg-rose-50/30 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">风险</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {(evalParsed.risks as string[] | undefined)?.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">推荐品类 & 匹配度</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    {(evalParsed.recommendedCategories as string[] | undefined)?.join(
                      "、"
                    )}
                  </div>
                  <p className="text-slate-600">
                    {String(evalParsed.demandMatchNote ?? "")}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">选品智能匹配（全库）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="min-h-[100px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                placeholder="描述目标品类、材质、认证或价格带…"
                value={matchHint}
                onChange={(e) => setMatchHint(e.target.value)}
              />
              <Button type="button" onClick={() => runMatch()}>
                从供应商库匹配推荐
              </Button>
              {Array.isArray(matchResult) && matchResult.length > 0 && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                  {matchResult.map(
                    (
                      m: {
                        supplierId: string;
                        score: number;
                        reason: string;
                        keyFacts: string;
                        supplier?: { name: string };
                      },
                      i: number
                    ) => (
                      <div
                        key={i}
                        className="rounded-md border border-white bg-white p-3 text-sm shadow-sm"
                      >
                        <div className="font-medium">
                          {m.supplier?.name ?? m.supplierId}{" "}
                          <Badge variant="outline" className="ml-2">
                            匹配 {m.score}
                          </Badge>
                        </div>
                        <p className="mt-1 text-slate-600">{m.reason}</p>
                        <p className="mt-1 text-xs text-slate-500">{m.keyFacts}</p>
                        {m.supplierId && (
                          <Link
                            href={`/dashboard/suppliers/${m.supplierId}`}
                            className="mt-2 inline-block text-xs text-indigo-600 hover:underline"
                          >
                            查看档案
                          </Link>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">文件分析结构化结果</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.files
                .filter((f) => f.analysis?.structuredJson)
                .map((f) => (
                  <div
                    key={f.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/80 p-3"
                  >
                    <div className="mb-2 text-sm font-medium">{f.originalName}</div>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                      {(() => {
                        try {
                          return JSON.stringify(
                            JSON.parse(f.analysis!.structuredJson!),
                            null,
                            2
                          );
                        } catch {
                          return f.analysis!.structuredJson;
                        }
                      })()}
                    </pre>
                  </div>
                ))}
              {data.files.every((f) => !f.analysis?.structuredJson) && (
                <p className="text-sm text-slate-500">尚无文件分析结果</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records" className="mt-6 space-y-6">
          <RecordsBlock supplierId={id} data={data} onRefresh={load} />
        </TabsContent>

        <TabsContent value="rating" className="mt-6 space-y-6">
          <RatingSection supplierId={id} ratings={data.ratings} onRefresh={load} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && preview.mime.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contentUrl(preview.fileId, "inline")}
              alt=""
              className="max-h-[75vh] w-full object-contain"
            />
          )}
          {preview && preview.mime === "application/pdf" && (
            <iframe
              title="pdf"
              src={contentUrl(preview.fileId, "inline")}
              className="h-[75vh] w-full rounded-md border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactsSection({
  supplierId,
  contacts,
  onChange,
}: {
  supplierId: string;
  contacts: FullSupplier["contacts"];
  onChange: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    wechat: "",
    whatsapp: "",
    lineId: "",
  });

  async function add() {
    if (!form.name.trim()) {
      toast.error("请填写姓名");
      return;
    }
    const res = await fetch(`/api/suppliers/${supplierId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        title: form.title || null,
        email: form.email || null,
        phone: form.phone || null,
        wechat: form.wechat || null,
        whatsapp: form.whatsapp || null,
        lineId: form.lineId || null,
      }),
    });
    if (res.ok) {
      toast.success("已添加联系人");
      setForm({
        name: "",
        title: "",
        email: "",
        phone: "",
        wechat: "",
        whatsapp: "",
        lineId: "",
      });
      onChange();
    } else {
      const j = await res.json();
      toast.error(j.message ?? "失败");
    }
  }

  async function remove(cid: string) {
    if (!confirm("删除该联系人？")) return;
    const res = await fetch(`/api/suppliers/${supplierId}/contacts/${cid}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("已删除");
      onChange();
    }
  }

  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">主要联系人</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {contacts.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm"
          >
            <div>
              <div className="font-medium">
                {c.name}
                {c.isPrimary && (
                  <Badge className="ml-2" variant="secondary">
                    主联系人
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-slate-600">
                {[c.title, c.email, c.phone, c.wechat, c.whatsapp, c.lineId]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
              删除
            </Button>
          </div>
        ))}
        <Separator />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="姓名 *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            placeholder="职位"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <Input
            placeholder="邮箱"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            placeholder="电话"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <Input
            placeholder="微信"
            value={form.wechat}
            onChange={(e) => setForm((f) => ({ ...f, wechat: e.target.value }))}
          />
          <Input
            placeholder="WhatsApp"
            value={form.whatsapp}
            onChange={(e) =>
              setForm((f) => ({ ...f, whatsapp: e.target.value }))
            }
          />
          <Input
            placeholder="Line"
            value={form.lineId}
            onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value }))}
          />
        </div>
        <Button type="button" onClick={() => add()}>
          添加联系人
        </Button>
      </CardContent>
    </Card>
  );
}

function RecordsBlock({
  supplierId,
  data,
  onRefresh,
}: {
  supplierId: string;
  data: FullSupplier;
  onRefresh: () => void;
}) {
  const [order, setOrder] = useState({
    productDesc: "",
    quantity: "",
    amount: "",
    status: "",
  });
  const [sample, setSample] = useState({ productDesc: "", status: "", notes: "" });
  const [quality, setQuality] = useState({ description: "", severity: "" });
  const [note, setNote] = useState({ title: "", content: "" });

  async function postOrder() {
    const res = await fetch(`/api/suppliers/${supplierId}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderDate: new Date().toISOString(),
        productDesc: order.productDesc,
        quantity: order.quantity ? Number(order.quantity) : null,
        amount: order.amount ? Number(order.amount) : null,
        status: order.status || null,
      }),
    });
    if (res.ok) {
      toast.success("已添加订单记录");
      setOrder({ productDesc: "", quantity: "", amount: "", status: "" });
      onRefresh();
    }
  }

  async function postSample() {
    const res = await fetch(`/api/suppliers/${supplierId}/samples`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sampleDate: new Date().toISOString(),
        productDesc: sample.productDesc,
        status: sample.status || null,
        notes: sample.notes || null,
      }),
    });
    if (res.ok) {
      toast.success("已添加打样记录");
      setSample({ productDesc: "", status: "", notes: "" });
      onRefresh();
    }
  }

  async function postQuality() {
    const res = await fetch(`/api/suppliers/${supplierId}/quality`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: quality.description,
        severity: quality.severity || null,
      }),
    });
    if (res.ok) {
      toast.success("已记录质量问题");
      setQuality({ description: "", severity: "" });
      onRefresh();
    }
  }

  async function postNote() {
    const res = await fetch(`/api/suppliers/${supplierId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: note.title || null,
        content: note.content,
      }),
    });
    if (res.ok) {
      toast.success("已添加备忘");
      setNote({ title: "", content: "" });
      onRefresh();
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">订单记录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.orders.map((o) => (
            <div key={o.id} className="rounded border border-slate-100 p-2 text-sm">
              <div className="font-medium">{fmtTime(o.orderDate)}</div>
              <div>{o.productDesc}</div>
              <div className="text-slate-500">
                数量 {o.quantity ?? "—"} · 金额 {o.amount ?? "—"} {o.currency ?? ""}{" "}
                · {o.status ?? ""}
              </div>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="产品描述"
              value={order.productDesc}
              onChange={(e) =>
                setOrder((x) => ({ ...x, productDesc: e.target.value }))
              }
            />
            <Input
              placeholder="数量"
              value={order.quantity}
              onChange={(e) =>
                setOrder((x) => ({ ...x, quantity: e.target.value }))
              }
            />
            <Input
              placeholder="金额"
              value={order.amount}
              onChange={(e) =>
                setOrder((x) => ({ ...x, amount: e.target.value }))
              }
            />
            <Input
              placeholder="状态"
              value={order.status}
              onChange={(e) => setOrder((x) => ({ ...x, status: e.target.value }))}
            />
          </div>
          <Button type="button" size="sm" onClick={() => postOrder()}>
            添加订单
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">打样记录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.samples.map((s) => (
            <div key={s.id} className="rounded border border-slate-100 p-2 text-sm">
              <div>{fmtTime(s.sampleDate)}</div>
              <div>{s.productDesc}</div>
              <div className="text-slate-500">{s.status} {s.notes}</div>
            </div>
          ))}
          <Input
            placeholder="产品"
            value={sample.productDesc}
            onChange={(e) =>
              setSample((x) => ({ ...x, productDesc: e.target.value }))
            }
          />
          <Input
            placeholder="状态"
            value={sample.status}
            onChange={(e) => setSample((x) => ({ ...x, status: e.target.value }))}
          />
          <Input
            placeholder="备注"
            value={sample.notes}
            onChange={(e) => setSample((x) => ({ ...x, notes: e.target.value }))}
          />
          <Button type="button" size="sm" onClick={() => postSample()}>
            添加打样
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">质量问题</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.qualityIssues.map((q) => (
            <div key={q.id} className="rounded border border-slate-100 p-2 text-sm">
              <div>{fmtTime(q.issueDate)}</div>
              <div>{q.description}</div>
              <div className="text-slate-500">{q.severity}</div>
            </div>
          ))}
          <textarea
            className="min-h-[72px] w-full rounded-lg border px-2 py-1 text-sm"
            placeholder="问题描述"
            value={quality.description}
            onChange={(e) =>
              setQuality((x) => ({ ...x, description: e.target.value }))
            }
          />
          <Input
            placeholder="严重程度"
            value={quality.severity}
            onChange={(e) =>
              setQuality((x) => ({ ...x, severity: e.target.value }))
            }
          />
          <Button type="button" size="sm" onClick={() => postQuality()}>
            添加记录
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">沟通备忘</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.supplierNotes.map((n) => (
            <div key={n.id} className="rounded border border-slate-100 p-2 text-sm">
              <div className="font-medium">{n.title || "备忘"}</div>
              <div className="text-slate-600">{n.content}</div>
              <div className="text-xs text-slate-400">{fmtTime(n.createdAt)}</div>
            </div>
          ))}
          <Input
            placeholder="标题（可选）"
            value={note.title}
            onChange={(e) => setNote((x) => ({ ...x, title: e.target.value }))}
          />
          <textarea
            className="min-h-[72px] w-full rounded-lg border px-2 py-1 text-sm"
            placeholder="内容"
            value={note.content}
            onChange={(e) => setNote((x) => ({ ...x, content: e.target.value }))}
          />
          <Button type="button" size="sm" onClick={() => postNote()}>
            添加备忘
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function RatingSection({
  supplierId,
  ratings,
  onRefresh,
}: {
  supplierId: string;
  ratings: FullSupplier["ratings"];
  onRefresh: () => void;
}) {
  const [f, setF] = useState({
    quality: 4,
    priceCompete: 4,
    delivery: 4,
    communication: 4,
    cooperation: 4,
    rdCapability: 4,
    comment: "",
  });

  async function submit() {
    const res = await fetch(`/api/suppliers/${supplierId}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, comment: f.comment || null }),
    });
    if (res.ok) {
      toast.success("评分已保存");
      onRefresh();
    } else {
      const j = await res.json();
      toast.error(j.message ?? "失败");
    }
  }

  const dims = [
    ["产品质量", "quality"],
    ["价格竞争力", "priceCompete"],
    ["交期准时率", "delivery"],
    ["沟通效率", "communication"],
    ["配合度", "cooperation"],
    ["研发能力", "rdCapability"],
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">手动评分（每项 1–5）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {dims.map(([label, key]) => (
          <div key={key} className="flex flex-wrap items-center gap-3">
            <span className="w-28 text-sm text-slate-600">{label}</span>
            <Input
              type="number"
              min={1}
              max={5}
              className="w-20"
              value={f[key]}
              onChange={(e) =>
                setF((x) => ({ ...x, [key]: Number(e.target.value) }))
              }
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label>备注</Label>
          <textarea
            className="min-h-[64px] w-full rounded-lg border px-2 py-1 text-sm"
            value={f.comment}
            onChange={(e) => setF((x) => ({ ...x, comment: e.target.value }))}
          />
        </div>
        <Button type="button" onClick={() => submit()}>
          提交评分
        </Button>

        <Separator className="my-4" />
        <div className="text-sm font-medium text-slate-900">历史记录</div>
        {ratings.map((r) => (
          <div key={r.id} className="rounded border border-slate-100 p-2 text-xs text-slate-600">
            <div>
              质量{r.quality} 价格{r.priceCompete} 交期{r.delivery} 沟通
              {r.communication} 配合{r.cooperation} 研发{r.rdCapability}
            </div>
            {r.comment && <div className="mt-1">{r.comment}</div>}
            <div className="mt-1 text-slate-400">{fmtTime(r.createdAt)}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
