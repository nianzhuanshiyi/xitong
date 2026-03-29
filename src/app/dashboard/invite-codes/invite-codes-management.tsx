"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Copy,
  Check,
  Ticket,
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
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InviteCode {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getStatus(item: InviteCode): { label: string; variant: "success" | "secondary" | "destructive" } {
  if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
    return { label: "已过期", variant: "destructive" };
  }
  if (item.usedCount >= item.maxUses) {
    return { label: "已满", variant: "secondary" };
  }
  return { label: "可用", variant: "success" };
}

function defaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 16);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function InviteCodesManagement() {
  const [items, setItems] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: generateCode(),
    maxUses: 10,
    expiresAt: defaultExpiry(),
  });

  /* ---------- fetch ---------- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invite-codes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "加载失败");
      setItems(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- create ---------- */
  async function handleCreate() {
    if (!form.code.trim()) {
      toast.error("邀请码不能为空");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          maxUses: form.maxUses,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "创建失败");
      toast.success("邀请码已创建");
      setCreateOpen(false);
      setForm({ code: generateCode(), maxUses: 10, expiresAt: defaultExpiry() });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  /* ---------- delete ---------- */
  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/invite-codes/${id}`, { method: "DELETE" });
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

  /* ---------- copy ---------- */
  async function handleCopy(item: InviteCode) {
    try {
      await navigator.clipboard.writeText(item.code);
      setCopiedId(item.id);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  }

  /* ---------- render ---------- */
  if (loading && !items.length) {
    return (
      <div className="flex justify-center py-20 text-slate-500">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  const activeCount = items.filter((i) => getStatus(i).label === "可用").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      {/* ── Stats ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">总邀请码</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-slate-900">{items.length}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">当前可用</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-emerald-600">{activeCount}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">总注册次数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums text-slate-900">
              {items.reduce((s, i) => s + i.usedCount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-slate-900">邀请码列表</h2>
        <Button
          size="sm"
          onClick={() => {
            setForm({ code: generateCode(), maxUses: 10, expiresAt: defaultExpiry() });
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-1 size-4" />
          生成邀请码
        </Button>
      </div>

      {/* ── List ── */}
      {items.length === 0 ? (
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Ticket className="size-10 text-slate-300" />
            <p className="text-sm text-slate-500">暂无邀请码，点击上方按钮生成</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const status = getStatus(item);
            return (
              <Card key={item.id} className="border-slate-200/80 shadow-sm">
                <CardContent className="flex items-center gap-4 py-4">
                  {/* Code */}
                  <div className="flex items-center gap-2">
                    <code className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-base font-semibold tracking-widest text-slate-800">
                      {item.code}
                    </code>
                    <button
                      onClick={() => handleCopy(item)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      title="复制邀请码"
                    >
                      {copiedId === item.id ? (
                        <Check className="size-4 text-emerald-500" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </button>
                  </div>

                  {/* Usage */}
                  <div className="flex-1 text-sm text-slate-600">
                    <span className="tabular-nums font-medium">{item.usedCount}</span>
                    <span className="text-slate-400"> / {item.maxUses} 次</span>
                  </div>

                  {/* Expiry */}
                  <div className="hidden text-sm text-slate-500 sm:block">
                    {item.expiresAt
                      ? `${new Date(item.expiresAt).toLocaleDateString("zh-CN")} 过期`
                      : "永不过期"}
                  </div>

                  {/* Status */}
                  <Badge variant={status.variant}>{status.label}</Badge>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    title="删除"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成邀请码</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <label className="mb-1 block text-sm text-gray-500">邀请码</label>
              <div className="flex gap-2">
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="font-mono tracking-widest"
                  maxLength={20}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                >
                  随机
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">最大使用次数</label>
              <Input
                type="number"
                min={1}
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-500">过期时间</label>
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-400">留空则永不过期</p>
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
