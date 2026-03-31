"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Pencil,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  } | null;
};

type CatalogProduct = {
  name: string;
  specs?: string;
  estimatedCost?: string;
  recommendedPrice?: string;
  margin?: string;
  marketDemand?: string;
  competition?: string;
  recommendation?: string;
  sellerspriteData?: Record<string, unknown>;
};

type CatalogAnalysisResult = {
  products: CatalogProduct[];
  summary?: string;
  progress?: number;
  error?: string;
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

const UPLOAD_CATEGORIES = [
  { value: "CATALOG", label: "产品目录" },
  { value: "PRICE_LIST", label: "报价单" },
  { value: "TEST_REPORT", label: "检测报告" },
  { value: "CERTIFICATION", label: "资质证书" },
  { value: "CONTRACT", label: "合同" },
  { value: "PACKAGING", label: "包装方案" },
  { value: "PRODUCT_IMAGE", label: "产品图片" },
  { value: "OTHER", label: "其他" },
] as const;

const COUNTRY_CODE_NONE = "__none__";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function fmtMoney(n: number | null, cur: string | null) {
  if (n == null) return "—";
  const c = cur ?? "USD";
  return `${n.toLocaleString("zh-CN")} ${c}`;
}

type EvalJson = {
  overallScore?: number;
  strengths?: string[];
  risks?: string[];
  recommendedCategories?: string[];
  demandMatchNote?: string;
};

function parseEvalJson(raw: string | null): EvalJson | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as EvalJson;
  } catch {
    return null;
  }
}

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="rounded-md p-1 transition-colors hover:bg-slate-100"
            aria-label={`${label} ${n} 星`}
          >
            <Star
              className={cn(
                "size-6",
                n <= value
                  ? "fill-amber-400 text-amber-400"
                  : "text-slate-300"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

const fieldLabel = "mb-1 block text-sm text-gray-500";
const inputArea =
  "min-h-[72px] w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function SupplierDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [tab, setTab] = useState("basic");
  const [data, setData] = useState<FullSupplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scrapeBusy, setScrapeBusy] = useState(false);
  const [evalBusy, setEvalBusy] = useState(false);
  const [analyzeId, setAnalyzeId] = useState<string | null>(null);
  const [expandedAnalysis, setExpandedAnalysis] = useState<Set<string>>(new Set());
  const [catalogBusy, setCatalogBusy] = useState<string | null>(null);
  const [catalogResults, setCatalogResults] = useState<Record<string, CatalogAnalysisResult>>({});
  const [drag, setDrag] = useState(false);
  const [uploadCat, setUploadCat] = useState<string>("OTHER");
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<{
    fileId: string;
    name: string;
    mime: string;
  } | null>(null);

  const [form, setForm] = useState<Partial<FullSupplier>>({});

  const [ratingDraft, setRatingDraft] = useState({
    quality: 3,
    priceCompete: 3,
    delivery: 3,
    communication: 3,
    cooperation: 3,
    rdCapability: 3,
    comment: "",
  });
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    wechat: "",
    whatsapp: "",
  });

  const [orderOpen, setOrderOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({
    orderDate: "",
    productDesc: "",
    quantity: "",
    amount: "",
    currency: "USD",
    status: "",
  });

  const [sampleOpen, setSampleOpen] = useState(false);
  const [sampleForm, setSampleForm] = useState({
    sampleDate: "",
    productDesc: "",
    status: "",
    notes: "",
  });

  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityForm, setQualityForm] = useState({
    issueDate: "",
    description: "",
    severity: "",
  });

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: "", content: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "加载失败");
      setData(j);
      setForm(j);
      if (j.ratings?.[0]) {
        const r = j.ratings[0];
        setRatingDraft({
          quality: r.quality,
          priceCompete: r.priceCompete,
          delivery: r.delivery,
          communication: r.communication,
          cooperation: r.cooperation,
          rdCapability: r.rdCapability,
          comment: r.comment ?? "",
        });
      }
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

  const contentUrl = (fileId: string, mode: "inline" | "download") =>
    `/api/suppliers/${id}/files/${fileId}/content?mode=${mode}`;

  async function saveBasic() {
    setSaving(true);
    try {
      const cc = form.countryCode;
      const res = await fetch(`/api/suppliers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          nameEn: form.nameEn,
          country: form.country,
          countryCode: cc === COUNTRY_CODE_NONE || cc == null ? null : cc,
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
      setData((d) => (d ? { ...d, ...j } : null));
      setForm((f) => ({ ...f, ...j }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function scrapeWebsite() {
    setScrapeBusy(true);
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
    } finally {
      setScrapeBusy(false);
    }
  }

  async function runEvaluate() {
    setEvalBusy(true);
    try {
      const res = await fetch(`/api/suppliers/${id}/evaluate`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "评估失败");
      toast.success("综合评估已生成");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "评估失败");
    } finally {
      setEvalBusy(false);
    }
  }

  async function deleteSupplier() {
    if (!confirm("确定删除该供应商？此操作不可恢复。")) return;
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "删除失败");
      toast.success("已删除");
      router.push("/dashboard/suppliers");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    fd.set("category", uploadCat);
    for (const f of Array.from(files)) fd.append("file", f);
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
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteFile(fileId: string) {
    if (!confirm("删除该文件？")) return;
    try {
      const res = await fetch(`/api/suppliers/${id}/files/${fileId}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "删除失败");
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  function toggleAnalysisExpand(fileId: string) {
    setExpandedAnalysis((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  async function analyzeFile(fileId: string) {
    setAnalyzeId(fileId);
    try {
      const res = await fetch(
        `/api/suppliers/${id}/files/${fileId}/analyze`,
        { method: "POST" }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "分析失败");
      toast.success("分析完成");
      await load();
      setExpandedAnalysis((prev) => new Set(prev).add(fileId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分析失败");
    } finally {
      setAnalyzeId(null);
    }
  }

  async function catalogAnalyze(fileId: string) {
    setCatalogBusy(fileId);
    try {
      const res = await fetch(
        `/api/suppliers/${id}/files/${fileId}/catalog-analysis`,
        { method: "POST" }
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "深度分析失败");
      setCatalogResults((prev) => ({ ...prev, [fileId]: j }));
      toast.success("深度选品分析完成");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "深度分析失败");
    } finally {
      setCatalogBusy(null);
    }
  }

  async function submitRating() {
    setRatingSubmitting(true);
    try {
      const res = await fetch(`/api/suppliers/${id}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quality: ratingDraft.quality,
          priceCompete: ratingDraft.priceCompete,
          delivery: ratingDraft.delivery,
          communication: ratingDraft.communication,
          cooperation: ratingDraft.cooperation,
          rdCapability: ratingDraft.rdCapability,
          comment: ratingDraft.comment.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "提交失败");
      toast.success("评分已保存");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setRatingSubmitting(false);
    }
  }

  async function addContact() {
    if (!contactForm.name.trim()) {
      toast.error("请填写姓名");
      return;
    }
    try {
      const res = await fetch(`/api/suppliers/${id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactForm.name.trim(),
          title: contactForm.title || null,
          email: contactForm.email || null,
          phone: contactForm.phone || null,
          wechat: contactForm.wechat || null,
          whatsapp: contactForm.whatsapp || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "添加失败");
      toast.success("已添加联系人");
      setContactOpen(false);
      setContactForm({
        name: "",
        title: "",
        email: "",
        phone: "",
        wechat: "",
        whatsapp: "",
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    }
  }

  async function removeContact(cid: string) {
    if (!confirm("删除该联系人？")) return;
    try {
      const res = await fetch(`/api/suppliers/${id}/contacts/${cid}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "删除失败");
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function addOrder() {
    if (!orderForm.productDesc.trim() || !orderForm.orderDate) {
      toast.error("请填写日期与产品");
      return;
    }
    try {
      const res = await fetch(`/api/suppliers/${id}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderDate: new Date(orderForm.orderDate).toISOString(),
          productDesc: orderForm.productDesc.trim(),
          quantity: orderForm.quantity ? Number(orderForm.quantity) : null,
          amount: orderForm.amount ? Number(orderForm.amount) : null,
          currency: orderForm.currency || null,
          status: orderForm.status || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "添加失败");
      toast.success("已添加订单记录");
      setOrderOpen(false);
      setOrderForm({
        orderDate: "",
        productDesc: "",
        quantity: "",
        amount: "",
        currency: "USD",
        status: "",
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    }
  }

  async function addSample() {
    if (!sampleForm.productDesc.trim() || !sampleForm.sampleDate) {
      toast.error("请填写日期与产品");
      return;
    }
    try {
      const res = await fetch(`/api/suppliers/${id}/samples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleDate: new Date(sampleForm.sampleDate).toISOString(),
          productDesc: sampleForm.productDesc.trim(),
          status: sampleForm.status || null,
          notes: sampleForm.notes || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "添加失败");
      toast.success("已添加打样记录");
      setSampleOpen(false);
      setSampleForm({
        sampleDate: "",
        productDesc: "",
        status: "",
        notes: "",
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    }
  }

  async function addQuality() {
    if (!qualityForm.description.trim()) {
      toast.error("请填写问题描述");
      return;
    }
    try {
      const res = await fetch(`/api/suppliers/${id}/quality`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueDate: qualityForm.issueDate
            ? new Date(qualityForm.issueDate).toISOString()
            : undefined,
          description: qualityForm.description.trim(),
          severity: qualityForm.severity || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "添加失败");
      toast.success("已添加质量记录");
      setQualityOpen(false);
      setQualityForm({ issueDate: "", description: "", severity: "" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    }
  }

  async function addNote() {
    if (!noteForm.content.trim()) {
      toast.error("请填写内容");
      return;
    }
    try {
      const res = await fetch(`/api/suppliers/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: noteForm.title || null,
          content: noteForm.content.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "添加失败");
      toast.success("已添加备忘");
      setNoteOpen(false);
      setNoteForm({ title: "", content: "" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    }
  }

  const radarData = useMemo(
    () => [
      { dimension: "产品质量", value: ratingDraft.quality },
      { dimension: "价格竞争力", value: ratingDraft.priceCompete },
      { dimension: "交期准时率", value: ratingDraft.delivery },
      { dimension: "沟通效率", value: ratingDraft.communication },
      { dimension: "配合度", value: ratingDraft.cooperation },
      { dimension: "研发能力", value: ratingDraft.rdCapability },
    ],
    [ratingDraft]
  );

  const ratingAvg =
    (ratingDraft.quality +
      ratingDraft.priceCompete +
      ratingDraft.delivery +
      ratingDraft.communication +
      ratingDraft.cooperation +
      ratingDraft.rdCapability) /
    6;

  const evalParsed = data ? parseEvalJson(data.aiEvaluationJson) : null;

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl justify-center py-24 text-slate-500">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl py-12 text-center text-slate-500">
        未找到供应商。{" "}
        <Link href="/dashboard/suppliers" className="text-indigo-600 underline">
          返回列表
        </Link>
      </div>
    );
  }

  const countrySelectValue = form.countryCode ?? COUNTRY_CODE_NONE;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-col pb-8">
      {/* 顶部 */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard/suppliers"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <ArrowLeft className="mr-1 size-4" />
            返回列表
          </Link>
          <h1 className="min-w-0 max-w-full truncate font-heading text-lg font-semibold text-slate-900 sm:text-xl md:text-2xl">
            {data.name}
          </h1>
          <Badge variant="secondary" className="shrink-0">
            {countryFlag(data.countryCode)} {data.country}
          </Badge>
          <Badge className="shrink-0 bg-indigo-50 text-indigo-800 hover:bg-indigo-50">
            {SUPPLIER_STATUS_LABEL[data.status] ?? data.status}
          </Badge>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTab("basic")}
          >
            <Pencil className="mr-1 size-3.5" />
            编辑
          </Button>
          {isAdmin ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => deleteSupplier()}
            >
              <Trash2 className="mr-1 size-3.5" />
              删除
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
      >
        <TabsList
          variant="line"
          className="mb-4 h-auto w-full min-w-0 flex-wrap justify-start gap-1 rounded-none border-b border-slate-200 bg-transparent p-0"
        >
          <TabsTrigger value="basic" className="rounded-md text-xs sm:text-sm">
            基本信息
          </TabsTrigger>
          <TabsTrigger value="files" className="rounded-md text-xs sm:text-sm">
            文件资料
          </TabsTrigger>
          <TabsTrigger value="ai" className="rounded-md text-xs sm:text-sm">
            AI 分析
          </TabsTrigger>
          <TabsTrigger value="records" className="rounded-md text-xs sm:text-sm">
            合作记录
          </TabsTrigger>
          <TabsTrigger value="rating" className="rounded-md text-xs sm:text-sm">
            评分
          </TabsTrigger>
        </TabsList>

        {/* Tab 1 基本信息 */}
        <TabsContent
          value="basic"
          className="mt-0 min-w-0 flex-1 space-y-6 outline-none"
        >
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">公司信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="min-w-0">
                  <label className={fieldLabel}>公司名称（中文）</label>
                  <Input
                    value={form.name ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="min-w-0">
                  <label className={fieldLabel}>英文名称</label>
                  <Input
                    value={form.nameEn ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nameEn: e.target.value }))
                    }
                  />
                </div>
                <div className="min-w-0">
                  <label className={fieldLabel}>国家/地区</label>
                  <Input
                    value={form.country ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, country: e.target.value }))
                    }
                  />
                </div>
                <div className="min-w-0">
                  <label className={fieldLabel}>国家代码</label>
                  <Select
                    value={countrySelectValue}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        countryCode: v === COUNTRY_CODE_NONE ? null : v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="选择国家代码" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={COUNTRY_CODE_NONE}>未设置</SelectItem>
                      <SelectItem value="US">美国 US</SelectItem>
                      <SelectItem value="KR">韩国 KR</SelectItem>
                      <SelectItem value="CN">中国 CN</SelectItem>
                      <SelectItem value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 space-y-2 md:col-span-2">
                  <label className={fieldLabel}>官网</label>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      className="min-w-0 flex-1"
                      value={form.website ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, website: e.target.value }))
                      }
                      placeholder="https://"
                    />
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {form.website ? (
                        <a
                          href={
                            form.website.startsWith("http")
                              ? form.website
                              : `https://${form.website}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "inline-flex items-center gap-1"
                          )}
                        >
                          打开 <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={scrapeBusy}
                        onClick={() => scrapeWebsite()}
                      >
                        {scrapeBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        <span className="ml-1">AI 抓取网站信息</span>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 md:col-span-2">
                  <label className={fieldLabel}>详细地址</label>
                  <textarea
                    className={cn(inputArea, "min-h-[88px]")}
                    value={form.address ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, address: e.target.value }))
                    }
                  />
                </div>

                <div className="min-w-0">
                  <label className={fieldLabel}>主营品类（逗号分隔）</label>
                  <Input
                    value={form.mainCategories ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        mainCategories: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="min-w-0">
                  <label className={fieldLabel}>合作状态</label>
                  <Select
                    value={form.status ?? "EVALUATING"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        status: v ?? f.status ?? "EVALUATING",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COOPERATING">已合作</SelectItem>
                      <SelectItem value="EVALUATING">评估中</SelectItem>
                      <SelectItem value="CANDIDATE">备选</SelectItem>
                      <SelectItem value="REJECTED">已淘汰</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 md:col-span-2">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="min-w-0">
                      <label className={fieldLabel}>付款方式</label>
                      <Input
                        value={form.paymentTerms ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            paymentTerms: e.target.value,
                          }))
                        }
                        placeholder="T/T…"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={fieldLabel}>最小起订 MOQ</label>
                      <Input
                        value={form.moq ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, moq: e.target.value }))
                        }
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={fieldLabel}>打样周期（天）</label>
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
                    <div className="min-w-0">
                      <label className={fieldLabel}>生产周期（天）</label>
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
                  </div>
                </div>

                <div className="min-w-0">
                  <label className={fieldLabel}>合作开始日期</label>
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
                <div className="min-w-0">
                  <label className={fieldLabel}>备注</label>
                  <textarea
                    className={cn(inputArea, "min-h-[100px]")}
                    value={form.remarks ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, remarks: e.target.value }))
                    }
                  />
                </div>
              </div>
              <Button type="button" onClick={() => saveBasic()} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                保存
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base">联系人管理</CardTitle>
              <Button
                type="button"
                size="sm"
                onClick={() => setContactOpen(true)}
              >
                添加联系人
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>职位</TableHead>
                    <TableHead>邮箱</TableHead>
                    <TableHead>电话</TableHead>
                    <TableHead className="min-w-[140px]">
                      微信 / WhatsApp
                    </TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.contacts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-muted-foreground"
                      >
                        暂无联系人
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {c.name}
                          {c.isPrimary ? (
                            <Badge variant="secondary" className="ml-2">
                              主联系人
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>{c.title ?? "—"}</TableCell>
                        <TableCell className="max-w-[160px] truncate">
                          {c.email ?? "—"}
                        </TableCell>
                        <TableCell>{c.phone ?? "—"}</TableCell>
                        <TableCell className="whitespace-normal text-xs">
                          {[c.wechat && `微信:${c.wechat}`, c.whatsapp && `WA:${c.whatsapp}`]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeContact(c.id)}
                          >
                            删除
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 文件 */}
        <TabsContent
          value="files"
          className="mt-0 min-w-0 flex-1 space-y-6 outline-none"
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
          <Card
            className={cn(
              "border-2 border-dashed transition-colors",
              drag ? "border-indigo-400 bg-indigo-50/50" : "border-slate-300"
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
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <Upload className="size-10 text-indigo-400" />
              <p className="text-sm font-medium text-slate-700">
                拖拽文件到此处上传，或点击选择（支持多选）
              </p>
              <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <label className={fieldLabel}>文件类型</label>
                  <Select
                    value={uploadCat}
                    onValueChange={(v) => {
                      if (v) setUploadCat(v);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UPLOAD_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                >
                  选择文件
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">已上传文件</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>文件名</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>上传时间</TableHead>
                    <TableHead>上传人</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.files.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-muted-foreground"
                      >
                        暂无文件
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.files.map((f) => {
                      const hasAnalysis = !!f.analysis?.summary;
                      const isExpanded = expandedAnalysis.has(f.id);
                      const isCatalog = f.category === "CATALOG";
                      const catResult = catalogResults[f.id];
                      return (
                        <React.Fragment key={f.id}>
                          <TableRow>
                            <TableCell className="max-w-[200px] truncate font-medium">
                              {f.originalName}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {FILE_CATEGORY_LABEL[f.category] ?? f.category}
                              </Badge>
                            </TableCell>
                            <TableCell>{fmtBytes(f.size)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtTime(f.uploadedAt)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">—</TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setPreview({
                                      fileId: f.id,
                                      name: f.originalName,
                                      mime: f.mimeType,
                                    })
                                  }
                                >
                                  <Eye className="size-3.5" />
                                </Button>
                                <a
                                  href={contentUrl(f.id, "download")}
                                  className={cn(
                                    buttonVariants({ variant: "ghost", size: "sm" })
                                  )}
                                >
                                  <Download className="size-3.5" />
                                </a>
                                {hasAnalysis ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-xs"
                                    onClick={() => toggleAnalysisExpand(f.id)}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="size-3" />
                                    ) : (
                                      <ChevronRight className="size-3" />
                                    )}
                                    AI 分析
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-xs"
                                    disabled={analyzeId === f.id}
                                    onClick={() => analyzeFile(f.id)}
                                  >
                                    {analyzeId === f.id ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <Sparkles className="size-3" />
                                    )}
                                    AI 分析
                                  </Button>
                                )}
                                {isCatalog && (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="gap-1 text-xs"
                                    disabled={catalogBusy === f.id}
                                    onClick={() => catalogAnalyze(f.id)}
                                    title="深度分析约需 1-2 分钟"
                                  >
                                    {catalogBusy === f.id ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <Sparkles className="size-3" />
                                    )}
                                    深度选品分析
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => deleteFile(f.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {/* Collapsible analysis summary row */}
                          {hasAnalysis && isExpanded && (
                            <TableRow className="bg-slate-50/60 hover:bg-slate-50/80">
                              <TableCell colSpan={6} className="px-4 py-3">
                                <div className="space-y-2">
                                  <CollapsibleSummary text={f.analysis!.summary || ""} />
                                  {f.analysis!.structuredJson && (() => {
                                    try {
                                      const sj = JSON.parse(f.analysis!.structuredJson!);
                                      if (sj.products?.length) {
                                        return (
                                          <div className="mt-2">
                                            <p className="mb-1 text-xs font-medium text-slate-500">
                                              产品列表 ({sj.products.length})
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                              {sj.products.slice(0, 10).map((p: { name: string }, i: number) => (
                                                <Badge key={i} variant="secondary" className="text-xs">
                                                  {p.name}
                                                </Badge>
                                              ))}
                                              {sj.products.length > 10 && (
                                                <Badge variant="secondary" className="text-xs">
                                                  +{sj.products.length - 10} 更多
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      }
                                      if (sj.items?.length) {
                                        return (
                                          <div className="mt-2">
                                            <p className="mb-1 text-xs font-medium text-slate-500">
                                              项目 ({sj.items.length})
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                              {sj.items.slice(0, 8).map((it: { skuOrName: string; price?: string }, i: number) => (
                                                <Badge key={i} variant="secondary" className="text-xs">
                                                  {it.skuOrName}{it.price ? ` - ${it.price}` : ""}
                                                </Badge>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    } catch {
                                      return null;
                                    }
                                  })()}
                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 gap-1 text-xs text-muted-foreground"
                                      disabled={analyzeId === f.id}
                                      onClick={() => analyzeFile(f.id)}
                                    >
                                      {analyzeId === f.id ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : (
                                        <Sparkles className="size-3" />
                                      )}
                                      重新分析
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                          {/* Catalog deep analysis results */}
                          {isCatalog && catResult && (
                            <TableRow className="bg-blue-50/40 hover:bg-blue-50/60">
                              <TableCell colSpan={6} className="px-4 py-3">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-blue-900">
                                      深度选品分析结果
                                    </p>
                                    {catResult.summary && (
                                      <Badge variant="secondary" className="text-xs">
                                        {catResult.products.length} 个产品
                                      </Badge>
                                    )}
                                  </div>
                                  {catResult.summary && (
                                    <p className="text-sm text-slate-600">
                                      {catResult.summary}
                                    </p>
                                  )}
                                  {catResult.error && (
                                    <p className="text-sm text-red-600">{catResult.error}</p>
                                  )}
                                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {catResult.products.map((p, i) => (
                                      <div
                                        key={i}
                                        className="rounded-lg border border-blue-100 bg-white p-3 shadow-sm"
                                      >
                                        <p className="mb-1 font-medium text-sm">
                                          {p.name}
                                        </p>
                                        {p.specs && (
                                          <p className="text-xs text-muted-foreground mb-1">
                                            {p.specs}
                                          </p>
                                        )}
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                          {p.estimatedCost && (
                                            <div>
                                              <span className="text-muted-foreground">成本: </span>
                                              <span className="font-medium">{p.estimatedCost}</span>
                                            </div>
                                          )}
                                          {p.recommendedPrice && (
                                            <div>
                                              <span className="text-muted-foreground">建议售价: </span>
                                              <span className="font-medium">{p.recommendedPrice}</span>
                                            </div>
                                          )}
                                          {p.margin && (
                                            <div>
                                              <span className="text-muted-foreground">利润率: </span>
                                              <span className="font-medium text-green-700">{p.margin}</span>
                                            </div>
                                          )}
                                          {p.marketDemand && (
                                            <div>
                                              <span className="text-muted-foreground">需求: </span>
                                              <span className="font-medium">{p.marketDemand}</span>
                                            </div>
                                          )}
                                          {p.competition && (
                                            <div className="col-span-2">
                                              <span className="text-muted-foreground">竞争: </span>
                                              <span>{p.competition}</span>
                                            </div>
                                          )}
                                        </div>
                                        {p.recommendation && (
                                          <p className="mt-2 text-xs text-blue-800 bg-blue-50 rounded p-1.5">
                                            {p.recommendation}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 AI */}
        <TabsContent
          value="ai"
          className="mt-0 min-w-0 flex-1 space-y-6 outline-none"
        >
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">网站信息抓取</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={scrapeBusy}
                onClick={() => scrapeWebsite()}
              >
                {scrapeBusy ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 size-3.5" />
                )}
                AI 抓取网站信息
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {data.websiteScrapedAt ? (
                <p className="text-xs text-muted-foreground">
                  最近抓取：{fmtTime(data.websiteScrapedAt)}
                </p>
              ) : null}
              {data.profileSummary ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 whitespace-pre-wrap">
                  {data.profileSummary}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  尚无抓取摘要，请先填写官网并点击抓取。
                </p>
              )}
              {data.contact ? (
                <div>
                  <p className="mb-1 font-medium text-slate-700">联系信息摘要</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {data.contact}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">文件分析摘要</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.files.filter((f) => f.analysis?.summary).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  尚未有文件分析结果，请在「文件资料」中对文件执行 AI 分析。
                </p>
              ) : (
                data.files
                  .filter((f) => f.analysis?.summary)
                  .map((f) => (
                    <div
                      key={f.id}
                      className="rounded-lg border border-slate-100 bg-white p-3"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-medium">{f.originalName}</span>
                        <Badge variant="secondary" className="text-xs">
                          {FILE_CATEGORY_LABEL[f.category] ?? f.category}
                        </Badge>
                      </div>
                      <CollapsibleSummary text={f.analysis!.summary || ""} />
                    </div>
                  ))
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">综合评估</CardTitle>
              <Button
                type="button"
                disabled={evalBusy}
                onClick={() => runEvaluate()}
              >
                {evalBusy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 size-4" />
                )}
                生成综合评估
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {evalParsed ? (
                <>
                  <p>
                    <span className="font-medium">综合得分（AI）：</span>
                    {evalParsed.overallScore ?? "—"} / 5
                  </p>
                  {evalParsed.strengths?.length ? (
                    <div>
                      <p className="mb-1 font-medium">优势</p>
                      <ul className="list-inside list-disc text-muted-foreground">
                        {evalParsed.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {evalParsed.risks?.length ? (
                    <div>
                      <p className="mb-1 font-medium">风险</p>
                      <ul className="list-inside list-disc text-muted-foreground">
                        {evalParsed.risks.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {evalParsed.recommendedCategories?.length ? (
                    <div>
                      <p className="mb-1 font-medium">推荐品类</p>
                      <p className="text-muted-foreground">
                        {evalParsed.recommendedCategories.join("、")}
                      </p>
                    </div>
                  ) : null}
                  {evalParsed.demandMatchNote ? (
                    <div>
                      <p className="mb-1 font-medium">匹配说明</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {evalParsed.demandMatchNote}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">
                  尚未生成综合评估，点击按钮将结合档案与文件分析生成报告。
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 合作记录 */}
        <TabsContent
          value="records"
          className="mt-0 min-w-0 flex-1 space-y-6 outline-none"
        >
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">订单记录</CardTitle>
              <Button type="button" size="sm" onClick={() => setOrderOpen(true)}>
                新增
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>产品</TableHead>
                    <TableHead>数量</TableHead>
                    <TableHead>金额</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-muted-foreground"
                      >
                        暂无记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>{fmtTime(o.orderDate)}</TableCell>
                        <TableCell className="max-w-[200px] whitespace-normal">
                          {o.productDesc}
                        </TableCell>
                        <TableCell>{o.quantity ?? "—"}</TableCell>
                        <TableCell>
                          {fmtMoney(o.amount, o.currency)}
                        </TableCell>
                        <TableCell>{o.status ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">打样记录</CardTitle>
              <Button type="button" size="sm" onClick={() => setSampleOpen(true)}>
                新增
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>产品</TableHead>
                    <TableHead>结果</TableHead>
                    <TableHead>备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.samples.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-muted-foreground"
                      >
                        暂无记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.samples.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{fmtTime(s.sampleDate)}</TableCell>
                        <TableCell className="max-w-[200px] whitespace-normal">
                          {s.productDesc}
                        </TableCell>
                        <TableCell>{s.status ?? "—"}</TableCell>
                        <TableCell className="max-w-[220px] whitespace-normal text-xs">
                          {s.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">质量问题记录</CardTitle>
              <Button type="button" size="sm" onClick={() => setQualityOpen(true)}>
                新增
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>问题描述</TableHead>
                    <TableHead>严重程度</TableHead>
                    <TableHead>处理结果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.qualityIssues.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-muted-foreground"
                      >
                        暂无记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.qualityIssues.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell>{fmtTime(q.issueDate)}</TableCell>
                        <TableCell className="max-w-[240px] whitespace-normal">
                          {q.description}
                        </TableCell>
                        <TableCell>{q.severity ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">沟通备忘</CardTitle>
              <Button type="button" size="sm" onClick={() => setNoteOpen(true)}>
                新增
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.supplierNotes.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  暂无备忘
                </p>
              ) : (
                data.supplierNotes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {n.title || "（无标题）"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                      {n.content}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5 评分 */}
        <TabsContent
          value="rating"
          className="mt-0 min-w-0 flex-1 space-y-6 outline-none"
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">维度评分（1–5 星）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <StarRow
                  label="产品质量"
                  value={ratingDraft.quality}
                  onChange={(n) =>
                    setRatingDraft((d) => ({ ...d, quality: n }))
                  }
                />
                <StarRow
                  label="价格竞争力"
                  value={ratingDraft.priceCompete}
                  onChange={(n) =>
                    setRatingDraft((d) => ({ ...d, priceCompete: n }))
                  }
                />
                <StarRow
                  label="交期准时率"
                  value={ratingDraft.delivery}
                  onChange={(n) =>
                    setRatingDraft((d) => ({ ...d, delivery: n }))
                  }
                />
                <StarRow
                  label="沟通效率"
                  value={ratingDraft.communication}
                  onChange={(n) =>
                    setRatingDraft((d) => ({ ...d, communication: n }))
                  }
                />
                <StarRow
                  label="配合度"
                  value={ratingDraft.cooperation}
                  onChange={(n) =>
                    setRatingDraft((d) => ({ ...d, cooperation: n }))
                  }
                />
                <StarRow
                  label="研发能力"
                  value={ratingDraft.rdCapability}
                  onChange={(n) =>
                    setRatingDraft((d) => ({ ...d, rdCapability: n }))
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">雷达图</CardTitle>
              </CardHeader>
              <CardContent className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={radarData}
                    cx="50%"
                    cy="50%"
                    outerRadius="78%"
                  >
                    <PolarGrid />
                    <PolarAngleAxis
                      dataKey="dimension"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 5]}
                      tickCount={6}
                      tick={{ fontSize: 10 }}
                    />
                    <Radar
                      name="得分"
                      dataKey="value"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.35}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">综合得分与评语</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-sm text-muted-foreground">
                  当前草稿平均分
                </span>
                <span className="text-2xl font-semibold text-slate-900">
                  {ratingAvg.toFixed(1)}
                </span>
                <span className="text-sm text-muted-foreground">/ 5</span>
                {data.overallScore != null ? (
                  <Badge variant="secondary" className="ml-2">
                    系统记录：{data.overallScore.toFixed(1)}
                  </Badge>
                ) : null}
              </div>
              <div>
                <label className={fieldLabel}>评语</label>
                <textarea
                  className={cn(inputArea, "min-h-[96px]")}
                  value={ratingDraft.comment}
                  onChange={(e) =>
                    setRatingDraft((d) => ({
                      ...d,
                      comment: e.target.value,
                    }))
                  }
                  placeholder="填写本次评分说明…"
                />
              </div>
              <Button
                type="button"
                onClick={() => submitRating()}
                disabled={ratingSubmitting}
              >
                {ratingSubmitting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                保存评分
              </Button>
              {data.ratings[0]?.comment ? (
                <div className="rounded-md border border-slate-100 bg-slate-50/80 p-3 text-sm">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    最近一条已保存评语（{fmtTime(data.ratings[0].createdAt)}）
                  </p>
                  <p className="whitespace-pre-wrap">{data.ratings[0].comment}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加联系人</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className={fieldLabel}>姓名 *</label>
              <Input
                value={contactForm.name}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>职位</label>
              <Input
                value={contactForm.title}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>邮箱</label>
              <Input
                value={contactForm.email}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>电话</label>
              <Input
                value={contactForm.phone}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>微信</label>
              <Input
                value={contactForm.wechat}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, wechat: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>WhatsApp</label>
              <Input
                value={contactForm.whatsapp}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, whatsapp: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setContactOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => addContact()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增订单记录</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className={fieldLabel}>日期 *</label>
              <Input
                type="datetime-local"
                value={orderForm.orderDate}
                onChange={(e) =>
                  setOrderForm((f) => ({ ...f, orderDate: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>产品 *</label>
              <Input
                value={orderForm.productDesc}
                onChange={(e) =>
                  setOrderForm((f) => ({ ...f, productDesc: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={fieldLabel}>数量</label>
                <Input
                  value={orderForm.quantity}
                  onChange={(e) =>
                    setOrderForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={fieldLabel}>金额</label>
                <Input
                  value={orderForm.amount}
                  onChange={(e) =>
                    setOrderForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={fieldLabel}>币种</label>
                <Input
                  value={orderForm.currency}
                  onChange={(e) =>
                    setOrderForm((f) => ({ ...f, currency: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={fieldLabel}>状态</label>
                <Input
                  value={orderForm.status}
                  onChange={(e) =>
                    setOrderForm((f) => ({ ...f, status: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOrderOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => addOrder()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sampleOpen} onOpenChange={setSampleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增打样记录</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className={fieldLabel}>日期 *</label>
              <Input
                type="datetime-local"
                value={sampleForm.sampleDate}
                onChange={(e) =>
                  setSampleForm((f) => ({ ...f, sampleDate: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>产品 *</label>
              <Input
                value={sampleForm.productDesc}
                onChange={(e) =>
                  setSampleForm((f) => ({ ...f, productDesc: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>结果</label>
              <Input
                value={sampleForm.status}
                onChange={(e) =>
                  setSampleForm((f) => ({ ...f, status: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>备注</label>
              <textarea
                className={inputArea}
                value={sampleForm.notes}
                onChange={(e) =>
                  setSampleForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSampleOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => addSample()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qualityOpen} onOpenChange={setQualityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增质量问题记录</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className={fieldLabel}>日期（可选）</label>
              <Input
                type="datetime-local"
                value={qualityForm.issueDate}
                onChange={(e) =>
                  setQualityForm((f) => ({ ...f, issueDate: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>问题描述 *</label>
              <textarea
                className={inputArea}
                value={qualityForm.description}
                onChange={(e) =>
                  setQualityForm((f) => ({
                    ...f,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>严重程度</label>
              <Input
                value={qualityForm.severity}
                onChange={(e) =>
                  setQualityForm((f) => ({ ...f, severity: e.target.value }))
                }
                placeholder="如：高 / 中 / 低"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQualityOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => addQuality()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增沟通备忘</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className={fieldLabel}>标题</label>
              <Input
                value={noteForm.title}
                onChange={(e) =>
                  setNoteForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={fieldLabel}>内容 *</label>
              <textarea
                className={inputArea}
                value={noteForm.content}
                onChange={(e) =>
                  setNoteForm((f) => ({ ...f, content: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNoteOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => addNote()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          {preview &&
            !preview.mime.startsWith("image/") &&
            preview.mime !== "application/pdf" && (
              <p className="text-sm text-muted-foreground">
                该类型请使用下载查看。
              </p>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CollapsibleSummary({ text, previewChars = 300 }: { text: string; previewChars?: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasMarkdown = /^##\s|^\|.*\||\*\*.*\*\*|^---$/m.test(text);
  const isLong = text.length > previewChars;

  const renderContent = (content: string) => {
    if (hasMarkdown) {
      return (
        <div className="prose prose-sm prose-slate max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      );
    }
    return <p className="text-sm text-slate-700 whitespace-pre-wrap">{content}</p>;
  };

  if (!isLong) {
    return renderContent(text);
  }

  return (
    <div>
      {renderContent(expanded ? text : text.slice(0, previewChars) + "...")}
      <button
        type="button"
        className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <>
            <ChevronUp className="size-3" />
            收起
          </>
        ) : (
          <>
            <ChevronDown className="size-3" />
            展开全文
          </>
        )}
      </button>
    </div>
  );
}
