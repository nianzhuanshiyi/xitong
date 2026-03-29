"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutGrid,
  List,
  Search,
  Star,
  Building2,
  Loader2,
  Plus,
  Upload,
  X,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

const EMPTY_FORM = {
  name: "",
  nameEn: "",
  country: "",
  countryCode: "" as string,
  mainCategories: "",
  status: "EVALUATING" as string,
  contact: "",
  email: "",
  phone: "",
  website: "",
  remarks: "",
};

type FormData = typeof EMPTY_FORM;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
];

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

  // Add supplier dialog
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setField = (key: keyof FormData, val: string) =>
    setForm((p) => ({ ...p, [key]: val }));

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const bad = arr.find((f) => !ALLOWED_TYPES.includes(f.type));
    if (bad) {
      setSaveErr(`不支持的文件类型: ${bad.name}`);
      return;
    }
    const big = arr.find((f) => f.size > MAX_FILE_SIZE);
    if (big) {
      setSaveErr(`文件过大 (>10MB): ${big.name}`);
      return;
    }
    setSaveErr("");
    setFiles((p) => [...p, ...arr]);
  };

  const removeFile = (idx: number) =>
    setFiles((p) => p.filter((_, i) => i !== idx));

  const resetDialog = () => {
    setForm({ ...EMPTY_FORM });
    setFiles([]);
    setSaveErr("");
    setSaving(false);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setSaveErr("请填写公司名称");
      return;
    }
    if (!form.country.trim()) {
      setSaveErr("请填写国家");
      return;
    }
    setSaving(true);
    setSaveErr("");
    try {
      // 1. Create supplier
      const contactParts = [
        form.contact && `联系人: ${form.contact}`,
        form.email && `邮箱: ${form.email}`,
        form.phone && `电话: ${form.phone}`,
      ]
        .filter(Boolean)
        .join("\n");

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        country: form.country.trim(),
        status: form.status || "EVALUATING",
      };
      if (form.nameEn.trim()) body.nameEn = form.nameEn.trim();
      if (form.countryCode) body.countryCode = form.countryCode;
      if (form.mainCategories.trim())
        body.mainCategories = form.mainCategories.trim();
      if (contactParts) body.contact = contactParts;
      if (form.website.trim()) body.website = form.website.trim();
      if (form.remarks.trim()) body.remarks = form.remarks.trim();

      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "创建失败");

      const supplierId = data.id as string;

      // 2. Upload files if any
      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        await fetch(`/api/suppliers/${supplierId}/files`, {
          method: "POST",
          body: fd,
        });
      }

      setAddOpen(false);
      resetDialog();
      load();
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

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
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            供应商资源库
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            集中管理美、韩、中供应商资料，支持 AI 分析与选品匹配。
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 gap-1.5"
          onClick={() => {
            resetDialog();
            setAddOpen(true);
          }}
        >
          <Plus className="size-4" />
          新增供应商
        </Button>
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
        <Card className="overflow-hidden border-slate-200/80 shadow-sm">
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
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
          </div>
        </Card>
      )}

      {!loading && items.length === 0 && (
        <p className="py-12 text-center text-sm text-slate-500">暂无供应商数据</p>
      )}

      {/* Add Supplier Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增供应商</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            {/* Row 1: Name + English Name */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  公司名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="如：三星电子"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  英文名称
                </label>
                <Input
                  placeholder="Samsung Electronics"
                  value={form.nameEn}
                  onChange={(e) => setField("nameEn", e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: Country + CountryCode */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  国家 <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="如：韩国"
                  value={form.country}
                  onChange={(e) => setField("country", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  国家代码
                </label>
                <select
                  className="flex h-8 w-full rounded-lg border border-input bg-white px-2 text-sm"
                  value={form.countryCode}
                  onChange={(e) => setField("countryCode", e.target.value)}
                >
                  <option value="">请选择</option>
                  <option value="US">美国</option>
                  <option value="KR">韩国</option>
                  <option value="CN">中国</option>
                  <option value="OTHER">其他</option>
                </select>
              </div>
            </div>

            {/* Categories (comma-separated) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                品类标签
              </label>
              <Input
                placeholder="多个品类用逗号分隔，如：美妆, 护肤, 面膜"
                value={form.mainCategories}
                onChange={(e) => setField("mainCategories", e.target.value)}
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                合作状态
              </label>
              <select
                className="flex h-8 w-full rounded-lg border border-input bg-white px-2 text-sm"
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
              >
                <option value="EVALUATING">评估中</option>
                <option value="CANDIDATE">备选</option>
                <option value="COOPERATING">已合作</option>
                <option value="REJECTED">已淘汰</option>
              </select>
            </div>

            {/* Contact info */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  联系人
                </label>
                <Input
                  placeholder="张三"
                  value={form.contact}
                  onChange={(e) => setField("contact", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  邮箱
                </label>
                <Input
                  type="email"
                  placeholder="contact@example.com"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  电话
                </label>
                <Input
                  placeholder="+86 138..."
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </div>
            </div>

            {/* Website */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                网站
              </label>
              <Input
                placeholder="https://www.example.com"
                value={form.website}
                onChange={(e) => setField("website", e.target.value)}
              />
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                备注
              </label>
              <Textarea
                placeholder="其他补充信息…"
                rows={3}
                value={form.remarks}
                onChange={(e) => setField("remarks", e.target.value)}
              />
            </div>

            {/* File upload */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                上传文件
              </label>
              <p className="text-[11px] text-slate-400">
                支持 PDF、Word、Excel、图片 (jpg/png)，单文件 ≤ 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                选择文件
              </Button>

              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs"
                    >
                      <FileText className="size-3.5 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-slate-400">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-slate-400 hover:text-red-500"
                        onClick={() => removeFile(i)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {saveErr && (
              <p className="text-xs text-red-600">{saveErr}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="gap-1.5"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              创建供应商
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
