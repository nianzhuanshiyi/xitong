"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Download, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type IntegrationGet = {
  mcpUrl: string;
  claudeFromEnv: boolean;
  sellerspriteSecretFromEnv: boolean;
  claudeKeyPreview: string;
  sellerspriteSecretPreview: string;
  claudeConfigured: boolean;
  sellerspriteSecretConfigured: boolean;
};

type ConnState = "idle" | "loading" | "ok" | "fail";

function StatusBadge({ state, labelOk, labelFail }: { state: ConnState; labelOk: string; labelFail: string }) {
  if (state === "loading") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        检测中…
      </span>
    );
  }
  if (state === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <span aria-hidden>✓</span> {labelOk}
      </span>
    );
  }
  if (state === "fail") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
        <span aria-hidden>✗</span> {labelFail}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">未检测</span>
  );
}

export function ApiSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<IntegrationGet | null>(null);

  const [claudeInput, setClaudeInput] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [showClaude, setShowClaude] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [claudeTest, setClaudeTest] = useState<ConnState>("idle");
  const [spriteTest, setSpriteTest] = useState<ConnState>("idle");
  const [testMsg, setTestMsg] = useState<{ claude?: string; sprite?: string }>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/integrations");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "加载失败");
      setData(j as IntegrationGet);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function postIntegrations(payload: Record<string, string | null>) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "保存失败");
      setData(j as IntegrationGet);
      toast.success("已保存到数据库（生产环境仍优先使用 .env）");
      setClaudeTest("idle");
      setSpriteTest("idle");
      setTestMsg({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveClaudeKey() {
    if (!claudeInput.trim()) {
      toast.message("请先输入 Claude API Key");
      return;
    }
    await postIntegrations({ claudeApiKey: claudeInput.trim() });
    setClaudeInput("");
  }

  async function saveSpriteSecret() {
    if (!secretInput.trim()) {
      toast.message("请先输入卖家精灵 Secret Key");
      return;
    }
    await postIntegrations({ sellerspriteSecret: secretInput.trim() });
    setSecretInput("");
  }

  async function clearDb(field: "claude" | "sellersprite") {
    const payload =
      field === "claude"
        ? { claudeApiKey: null as null }
        : { sellerspriteSecret: null as null };
    setSaving(true);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "清除失败");
      setData(j as IntegrationGet);
      toast.success("已清除数据库中的备用密钥");
      setClaudeTest("idle");
      setSpriteTest("idle");
      setTestMsg({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "清除失败");
    } finally {
      setSaving(false);
    }
  }

  async function testClaude() {
    setClaudeTest("loading");
    setTestMsg((m) => ({ ...m, claude: undefined }));
    try {
      const res = await fetch("/api/settings/test-claude", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (j.ok) {
        setClaudeTest("ok");
        setTestMsg((m) => ({ ...m, claude: j.message }));
        toast.success(j.message ?? "Claude 连接正常");
      } else {
        setClaudeTest("fail");
        setTestMsg((m) => ({ ...m, claude: j.message }));
        toast.error(j.message ?? "连接失败");
      }
    } catch (e) {
      setClaudeTest("fail");
      setTestMsg((m) => ({
        ...m,
        claude: e instanceof Error ? e.message : "请求失败",
      }));
      toast.error("请求失败");
    }
  }

  async function testSprite() {
    setSpriteTest("loading");
    setTestMsg((m) => ({ ...m, sprite: undefined }));
    try {
      const res = await fetch("/api/settings/test-sellersprite", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (j.ok) {
        setSpriteTest("ok");
        setTestMsg((m) => ({ ...m, sprite: j.message }));
        toast.success(j.message ?? "卖家精灵端点有响应");
      } else {
        setSpriteTest("fail");
        setTestMsg((m) => ({ ...m, sprite: j.message }));
        toast.error(j.message ?? "连接失败");
      }
    } catch (e) {
      setSpriteTest("fail");
      setTestMsg((m) => ({
        ...m,
        sprite: e instanceof Error ? e.message : "请求失败",
      }));
      toast.error("请求失败");
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" />
        加载配置…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:space-y-8">
      <div>
        <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">
          API 与集成
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          密钥优先读取 <code className="rounded bg-slate-100 px-1 text-xs">.env</code>{" "}
          ；此处保存的密钥写入数据库作为备用。请勿将密钥提交到 Git。
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="font-heading text-lg">Claude API</CardTitle>
              <CardDescription>Anthropic Messages API，用于智能选品与 Listing 等能力</CardDescription>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <StatusBadge
                state={claudeTest}
                labelOk="已连接"
                labelFail="未连接"
              />
              {testMsg.claude && (
                <p className="max-w-xs text-right text-xs text-muted-foreground">{testMsg.claude}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {data.claudeConfigured ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 ring-1 ring-emerald-200/80">
                已配置
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900 ring-1 ring-amber-200/80">
                未配置
              </span>
            )}
            {data.claudeFromEnv && (
              <span className="text-muted-foreground">当前使用环境变量 CLAUDE_API_KEY</span>
            )}
            {!data.claudeFromEnv && data.claudeKeyPreview && (
              <span>脱敏预览：{data.claudeKeyPreview}</span>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="claude-key">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="claude-key"
                  type={showClaude ? "text" : "password"}
                  autoComplete="off"
                  placeholder="sk-ant-…（保存到数据库备用）"
                  value={claudeInput}
                  onChange={(e) => setClaudeInput(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  onClick={() => setShowClaude(!showClaude)}
                  aria-label={showClaude ? "隐藏密钥" : "显示密钥"}
                >
                  {showClaude ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" onClick={testClaude} disabled={claudeTest === "loading"}>
                {claudeTest === "loading" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "测试连接"
                )}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveClaudeKey} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "保存 Claude 密钥到数据库"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => clearDb("claude")}
            >
              清除数据库中的 Claude 密钥
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="font-heading text-lg">卖家精灵 MCP</CardTitle>
              <CardDescription>产品数据分析 MCP 端点</CardDescription>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <StatusBadge
                state={spriteTest}
                labelOk="已连接"
                labelFail="未连接"
              />
              {testMsg.sprite && (
                <p className="max-w-xs text-right text-xs text-muted-foreground">{testMsg.sprite}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>MCP URL</Label>
            <Input readOnly value={data.mcpUrl || "（未在 .env 配置 SELLERSPRITE_MCP_URL）"} className="bg-slate-50 font-mono text-xs" />
            <p className="text-xs text-muted-foreground">由环境变量提供，部署时在托管平台配置。</p>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {data.sellerspriteSecretConfigured ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 ring-1 ring-emerald-200/80">
                Secret 已配置
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900 ring-1 ring-amber-200/80">
                Secret 未配置
              </span>
            )}
            {data.sellerspriteSecretFromEnv && (
              <span className="text-muted-foreground">当前使用环境变量 SELLERSPRITE_SECRET_KEY</span>
            )}
            {!data.sellerspriteSecretFromEnv && data.sellerspriteSecretPreview && (
              <span>脱敏预览：{data.sellerspriteSecretPreview}</span>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sprite-secret">Secret Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="sprite-secret"
                  type={showSecret ? "text" : "password"}
                  autoComplete="off"
                  placeholder="保存到数据库备用"
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  onClick={() => setShowSecret(!showSecret)}
                  aria-label={showSecret ? "隐藏密钥" : "显示密钥"}
                >
                  {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" onClick={testSprite} disabled={spriteTest === "loading"}>
                {spriteTest === "loading" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "测试连接"
                )}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={saveSpriteSecret} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "保存 Secret 到数据库"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => clearDb("sellersprite")}
            >
              清除数据库中的 Secret
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={load} className="gap-1 text-muted-foreground">
              <RefreshCw className="size-3.5" />
              刷新状态
            </Button>
          </div>
        </CardContent>
      </Card>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            <Database className="mr-1.5 inline size-5 align-text-bottom" />
            数据库备份
          </CardTitle>
          <CardDescription>
            导出所有表的数据为 JSON 文件下载到本地，可用于灾难恢复或迁移。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BackupButton />
        </CardContent>
      </Card>
    </div>
  );
}

function BackupButton() {
  const [busy, setBusy] = useState(false);

  async function doBackup() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error((j as { message?: string }).message ?? "备份失败");
        return;
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] ?? "backup.json";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("备份已下载");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "备份失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" onClick={doBackup} disabled={busy} className="gap-1.5">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      导出数据库备份
    </Button>
  );
}
