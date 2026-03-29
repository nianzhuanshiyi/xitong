"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Loader2,
  Mail,
  Plus,
  Trash2,
  Pencil,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

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
/*  Types & presets                                                     */
/* ------------------------------------------------------------------ */

interface EmailAccount {
  id: string;
  email: string;
  displayName?: string | null;
  imapHost: string;
  imapPort: number;
  smtpHost?: string | null;
  smtpPort?: number | null;
  signature?: string | null;
  isActive: boolean;
  lastSyncAt?: string | null;
  createdAt: string;
}

interface TestResult {
  imap: { ok: boolean; message: string };
  smtp: { ok: boolean; message: string };
}

const PRESETS: Record<string, { label: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }> = {
  netease_ent: { label: "网易企业邮", imapHost: "imap.qiye.163.com", imapPort: 993, smtpHost: "smtp.qiye.163.com", smtpPort: 465 },
  gmail: { label: "Gmail", imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465 },
  outlook: { label: "Outlook / Hotmail", imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
  netease_free: { label: "网易 163 邮箱", imapHost: "imap.163.com", imapPort: 993, smtpHost: "smtp.163.com", smtpPort: 465 },
  qq: { label: "QQ 邮箱", imapHost: "imap.qq.com", imapPort: 993, smtpHost: "smtp.qq.com", smtpPort: 465 },
};

const EMPTY_FORM = {
  email: "",
  displayName: "",
  imapHost: "",
  imapPort: 993,
  imapPassword: "",
  smtpHost: "",
  smtpPort: 465,
  smtpPassword: "",
  signature: "",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EmailAccountsManagement() {
  const router = useRouter();
  const [items, setItems] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  /* ---------- fetch ---------- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mail/accounts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "加载失败");
      setItems(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ---------- preset ---------- */
  function applyPreset(key: string) {
    const p = PRESETS[key];
    if (!p) return;
    setForm((f) => ({
      ...f,
      imapHost: p.imapHost,
      imapPort: p.imapPort,
      smtpHost: p.smtpHost,
      smtpPort: p.smtpPort,
    }));
  }

  /* ---------- save ---------- */
  async function handleSave() {
    if (!form.email.trim() || !form.imapHost.trim() || !form.imapPassword.trim()) {
      toast.error("请填写邮箱、IMAP 服务器和密码");
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/mail/accounts/${editingId}` : "/api/mail/accounts";
      const method = editingId ? "PATCH" : "POST";
      const payload: Record<string, unknown> = {
        email: form.email.trim(),
        displayName: form.displayName.trim() || null,
        imapHost: form.imapHost.trim(),
        imapPort: form.imapPort,
        imapPassword: form.imapPassword,
        smtpHost: form.smtpHost.trim() || null,
        smtpPort: form.smtpPort,
        smtpPassword: form.smtpPassword.trim() || null,
        signature: form.signature.trim() || null,
      };
      // 编辑时如果密码字段为 placeholder 不传
      if (editingId && form.imapPassword === "••••••••") {
        delete payload.imapPassword;
      }
      if (editingId && form.smtpPassword === "••••••••") {
        delete payload.smtpPassword;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "保存失败");
      toast.success(editingId ? "已更新" : "邮箱已添加");
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- delete ---------- */
  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/mail/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "删除失败");
      }
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  /* ---------- test ---------- */
  async function handleTest(id: string) {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/mail/accounts/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "测试失败");
      setTestResult(data);
      if (data.imap.ok && data.smtp.ok) {
        toast.success("IMAP 和 SMTP 连接均成功");
      } else if (data.imap.ok) {
        toast.success("IMAP 连接成功" + (data.smtp.ok ? "" : "，SMTP 连接失败"));
      } else {
        toast.error("IMAP 连接失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(null);
    }
  }

  /* ---------- edit ---------- */
  function openEdit(item: EmailAccount) {
    setEditingId(item.id);
    setForm({
      email: item.email,
      displayName: item.displayName ?? "",
      imapHost: item.imapHost,
      imapPort: item.imapPort,
      imapPassword: "••••••••",
      smtpHost: item.smtpHost ?? "",
      smtpPort: item.smtpPort ?? 465,
      smtpPassword: "••••••••",
      signature: item.signature ?? "",
    });
    setTestResult(null);
    setDialogOpen(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setTestResult(null);
    setDialogOpen(true);
  }

  /* ---------- render ---------- */
  if (loading && !items.length) {
    return (
      <div className="flex justify-center py-20 text-slate-500">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/mail")}>
          <ArrowLeft className="mr-1 size-4" />
          返回邮件中心
        </Button>
        <h1 className="flex-1 font-heading text-xl font-semibold text-slate-900">邮箱账号管理</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 size-4" />
          添加邮箱
        </Button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Mail className="size-10 text-slate-300" />
            <p className="text-sm text-slate-500">暂无邮箱账号，点击上方按钮添加</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="border-slate-200/80 shadow-sm">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                  <Mail className="size-5 text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{item.email}</span>
                    {item.displayName && (
                      <span className="text-sm text-slate-400">({item.displayName})</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>IMAP: {item.imapHost}:{item.imapPort}</span>
                    {item.smtpHost && <span>· SMTP: {item.smtpHost}:{item.smtpPort}</span>}
                    {item.lastSyncAt && (
                      <span>· 最后同步: {new Date(item.lastSyncAt).toLocaleString("zh-CN")}</span>
                    )}
                  </div>
                </div>
                <Badge variant={item.isActive ? "success" : "secondary"}>
                  {item.isActive ? "启用" : "停用"}
                </Badge>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleTest(item.id)}
                    disabled={testing === item.id}
                    title="测试连接"
                  >
                    {testing === item.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Wifi className="size-4" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)} title="编辑">
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-slate-400 hover:text-red-500"
                    onClick={() => handleDelete(item.id)}
                    title="删除"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
              {/* Test result inline */}
              {testResult && testing === null && testResult === testResult && (
                <div className="border-t border-slate-100 px-4 py-2">
                  {/* This shows for the last tested item; could be improved with per-item state */}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Test Result Toast is shown via toast, but also show inline if needed */}
      {testResult && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">连接测试结果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {testResult.imap.ok ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <WifiOff className="size-4 text-red-500" />
              )}
              <span className={testResult.imap.ok ? "text-emerald-700" : "text-red-700"}>
                {testResult.imap.message}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {testResult.smtp.ok ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <WifiOff className="size-4 text-red-500" />
              )}
              <span className={testResult.smtp.ok ? "text-emerald-700" : "text-red-700"}>
                {testResult.smtp.message}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑邮箱" : "添加邮箱"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Preset */}
            {!editingId && (
              <div>
                <label className="mb-1 block text-sm text-gray-500">常见邮箱预设</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PRESETS).map(([key, p]) => (
                    <Button key={key} variant="outline" size="sm" onClick={() => applyPreset(key)}>
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-500">邮箱地址 *</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@company.com"
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">显示名称</label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="例：工作邮箱"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-500">IMAP 服务器 *</label>
                <Input
                  value={form.imapHost}
                  onChange={(e) => setForm((f) => ({ ...f, imapHost: e.target.value }))}
                  placeholder="imap.example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">IMAP 端口</label>
                <Input
                  type="number"
                  value={form.imapPort}
                  onChange={(e) => setForm((f) => ({ ...f, imapPort: parseInt(e.target.value) || 993 }))}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-500">密码 / 授权码 *</label>
              <Input
                type="password"
                value={form.imapPassword}
                onChange={(e) => setForm((f) => ({ ...f, imapPassword: e.target.value }))}
                placeholder="输入密码或授权码"
                onFocus={(e) => {
                  if (e.target.value === "••••••••") setForm((f) => ({ ...f, imapPassword: "" }));
                }}
              />
              <p className="mt-1 text-xs text-slate-400">
                部分邮箱需要使用授权码（如网易企业邮、QQ 邮箱）而非登录密码
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-500">SMTP 服务器</label>
                <Input
                  value={form.smtpHost}
                  onChange={(e) => setForm((f) => ({ ...f, smtpHost: e.target.value }))}
                  placeholder="smtp.example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">SMTP 端口</label>
                <Input
                  type="number"
                  value={form.smtpPort}
                  onChange={(e) => setForm((f) => ({ ...f, smtpPort: parseInt(e.target.value) || 465 }))}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-500">SMTP 密码（留空则使用 IMAP 密码）</label>
              <Input
                type="password"
                value={form.smtpPassword}
                onChange={(e) => setForm((f) => ({ ...f, smtpPassword: e.target.value }))}
                placeholder="留空则复用 IMAP 密码"
                onFocus={(e) => {
                  if (e.target.value === "••••••••") setForm((f) => ({ ...f, smtpPassword: "" }));
                }}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-500">邮件签名</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
                rows={5}
                value={form.signature}
                onChange={(e) => setForm((f) => ({ ...f, signature: e.target.value }))}
                placeholder={"Best regards,\nParis Zhang\nCEO, Zavyra Beauty\nEmail: paris@zavyrabeauty.com"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingId ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
