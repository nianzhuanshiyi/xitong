"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const MODULE_LIST = [
  { id: "3c-ideas", label: "3C新品创意" },
  { id: "europe-ideas", label: "欧洲蓝海选品" },
  { id: "email", label: "邮件中心" },
  { id: "ai-assistant", label: "AI 助手" },
  { id: "product-dev", label: "产品开发" },
  { id: "selection-analysis", label: "选品分析" },
  { id: "listing", label: "Listing 撰写" },
  { id: "ai-images", label: "AI 图片" },
  { id: "suppliers", label: "供应商资源库" },
  { id: "todos", label: "待办中心" },
] as const;

const AI_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
] as const;

function modelLabel(modelId: string): string {
  return AI_MODELS.find((m) => m.value === modelId)?.label ?? modelId;
}

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: "ADMIN" | "EMPLOYEE";
  aiAuthorized: boolean;
  allowedModules: string[];
  assignedModel: string;
  monthlyTokenLimit: number;
  teamId: string | null;
  createdAt: string;
  team: { id: string; name: string } | null;
};

export function UsersManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [batchModelOpen, setBatchModelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "加载失败");
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="font-heading text-base text-slate-900 sm:text-lg">
              团队成员
            </CardTitle>
            <CardDescription className="text-xs text-slate-600 sm:text-sm">
              管理角色权限与 AI 功能授权（仅管理员）
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              onClick={() => setBatchModelOpen(true)}
            >
              批量设置模型
            </Button>
            <Button
              size="sm"
              className="w-full shrink-0 gap-1.5 shadow-md sm:w-auto"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
              添加用户
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="-mx-1 overflow-x-auto rounded-xl border border-slate-200/90 bg-slate-50/40 shadow-inner sm:mx-0">
            <Table className="min-w-[780px]">
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>AI 模型</TableHead>
                  <TableHead>模块权限</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      暂无用户
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={u.role === "ADMIN" ? "default" : "secondary"}
                          className={
                            u.role === "ADMIN"
                              ? "border-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-sm"
                              : ""
                          }
                        >
                          {u.role === "ADMIN" ? "管理员" : "员工"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.role === "ADMIN" ? "—" : modelLabel(u.assignedModel ?? "claude-sonnet-4-20250514")}
                      </TableCell>
                      <TableCell>
                        {u.role === "ADMIN" ? (
                          <span className="text-xs text-muted-foreground">全部权限</span>
                        ) : u.allowedModules.length === 0 ? (
                          <span className="text-xs text-red-500">无权限</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {u.allowedModules.length} 个模块
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="mr-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          onClick={() => setEditUser(u)}
                          aria-label="编辑"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <UserDeleteButton user={u} onDone={load} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <UserFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          setCreateOpen(false);
          load();
        }}
      />
      <UserFormDialog
        mode="edit"
        user={editUser}
        open={!!editUser}
        onOpenChange={(o) => !o && setEditUser(null)}
        onSuccess={() => {
          setEditUser(null);
          load();
        }}
      />
      <BatchModelDialog
        open={batchModelOpen}
        onOpenChange={setBatchModelOpen}
        users={users.filter((u) => u.role !== "ADMIN")}
        onSuccess={load}
      />
    </div>
  );
}

function UserDeleteButton({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (!confirm(`确定删除用户「${user.email}」？`)) return;
    setPending(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "删除失败");
      toast.success("已删除");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive hover:bg-red-50 hover:text-destructive"
      disabled={pending}
      onClick={onDelete}
      aria-label="删除"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function UserFormDialog({
  mode,
  open,
  onOpenChange,
  onSuccess,
  user,
}: {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  user?: UserRow | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "EMPLOYEE">("EMPLOYEE");
  const [aiAuthorized, setAiAuthorized] = useState(false);
  const [allowedModules, setAllowedModules] = useState<string[]>([]);
  const [assignedModel, setAssignedModel] = useState("claude-sonnet-4-20250514");
  const [monthlyTokenLimit, setMonthlyTokenLimit] = useState(500000);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setPassword("");
      setRole(user.role);
      setAiAuthorized(user.aiAuthorized);
      setAllowedModules(user.allowedModules ?? []);
      setAssignedModel(user.assignedModel ?? "claude-sonnet-4-20250514");
      setMonthlyTokenLimit(user.monthlyTokenLimit ?? 500000);
    } else if (mode === "create") {
      setName("");
      setEmail("");
      setPassword("");
      setRole("EMPLOYEE");
      setAiAuthorized(false);
      setAllowedModules([]);
      setAssignedModel("claude-sonnet-4-20250514");
      setMonthlyTokenLimit(500000);
    }
  }, [open, mode, user]);

  function toggleModule(moduleId: string) {
    setAllowedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((m) => m !== moduleId)
        : [...prev, moduleId]
    );
  }

  function selectAllModules() {
    setAllowedModules(MODULE_LIST.map((m) => m.id));
  }

  function clearAllModules() {
    setAllowedModules([]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "edit" && password.length > 0 && password.length < 6) {
      toast.error("新密码至少 6 位");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            password,
            role,
            aiAuthorized,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message ?? "创建失败");
        toast.success("用户已创建");
        onSuccess();
        return;
      }

      if (!user) return;
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, allowedModules, assignedModel, monthlyTokenLimit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "更新失败");
      toast.success("已保存");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "请求失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "添加用户" : "编辑用户"}</DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "新建团队成员并设置角色与 AI 授权。"
                : "修改用户信息；留空密码表示不修改。"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="u-name">姓名</Label>
              <Input
                id="u-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="u-email">邮箱</Label>
              <Input
                id="u-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="u-pass">
                密码 {mode === "edit" ? "（可选）" : ""}
              </Label>
              <Input
                id="u-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={mode === "create"}
                minLength={mode === "create" ? 6 : undefined}
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="u-role">角色</Label>
              <select
                id="u-role"
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "EMPLOYEE")}
              >
                <option value="EMPLOYEE">员工</option>
                <option value="ADMIN">管理员</option>
              </select>
            </div>
            {role !== "ADMIN" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="u-model">指定 AI 模型</Label>
                  <select
                    id="u-model"
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    value={assignedModel}
                    onChange={(e) => setAssignedModel(e.target.value)}
                  >
                    {AI_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="u-limit">月度 Token 上限</Label>
                  <Input
                    id="u-limit"
                    type="number"
                    min={0}
                    value={monthlyTokenLimit}
                    onChange={(e) => setMonthlyTokenLimit(Number(e.target.value))}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "50万", value: 500000 },
                      { label: "100万", value: 1000000 },
                      { label: "200万", value: 2000000 },
                      { label: "无限制", value: 0 },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                          monthlyTokenLimit === opt.value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => setMonthlyTokenLimit(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">0 表示无限制</p>
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>模块权限</Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={selectAllModules}
                      >
                        全选
                      </button>
                      <button
                        type="button"
                        className="text-xs text-gray-500 hover:underline"
                        onClick={clearAllModules}
                      >
                        清空
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                    {MODULE_LIST.map((m) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`mod-${m.id}`}
                          checked={allowedModules.includes(m.id)}
                          onCheckedChange={() => toggleModule(m.id)}
                        />
                        <Label
                          htmlFor={`mod-${m.id}`}
                          className="text-xs font-normal"
                        >
                          {m.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "提交中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BatchModelDialog({
  open,
  onOpenChange,
  users,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserRow[];
  onSuccess: () => void;
}) {
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-20250514");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedModel("claude-sonnet-4-20250514");
    setSelectedUsers([]);
  }, [open]);

  function toggleUser(id: string) {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedUsers.length === 0) {
      toast.error("请选择至少一个用户");
      return;
    }
    setSubmitting(true);
    try {
      await Promise.all(
        selectedUsers.map((userId) =>
          fetch(`/api/admin/users/${userId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assignedModel: selectedModel }),
          })
        )
      );
      toast.success(`已为 ${selectedUsers.length} 名用户设置模型`);
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error("批量设置失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>批量设置 AI 模型</DialogTitle>
            <DialogDescription>选择目标用户和模型，统一更新</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>目标模型</Label>
              <select
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {AI_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>选择用户</Label>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setSelectedUsers(users.map((u) => u.id))}
                >
                  全选
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1">
                {users.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">无员工用户</p>
                ) : (
                  users.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 px-1 py-0.5">
                      <Checkbox
                        id={`batch-${u.id}`}
                        checked={selectedUsers.includes(u.id)}
                        onCheckedChange={() => toggleUser(u.id)}
                      />
                      <Label htmlFor={`batch-${u.id}`} className="text-xs font-normal flex-1">
                        {u.name ?? u.email}
                        <span className="ml-1 text-muted-foreground">
                          ({modelLabel(u.assignedModel ?? "claude-sonnet-4-20250514")})
                        </span>
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "设置中…" : `确认设置 (${selectedUsers.length})`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
