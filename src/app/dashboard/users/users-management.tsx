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

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: "ADMIN" | "EMPLOYEE";
  aiAuthorized: boolean;
  teamId: string | null;
  createdAt: string;
  team: { id: string; name: string } | null;
};

export function UsersManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "加载失败");
      }
      const data = (await res.json()) as UserRow[];
      setUsers(data);
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
          <Button
            size="sm"
            className="w-full shrink-0 gap-1.5 shadow-md sm:w-auto"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            添加用户
          </Button>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="-mx-1 overflow-x-auto rounded-xl border border-slate-200/90 bg-slate-50/40 shadow-inner sm:mx-0">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>AI 授权</TableHead>
                  <TableHead>团队</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
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
                      <TableCell>
                        <Badge variant={u.aiAuthorized ? "success" : "outline"}>
                          {u.aiAuthorized ? "已授权" : "未授权"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.team?.name ?? "—"}
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setPassword("");
      setRole(user.role);
      setAiAuthorized(user.aiAuthorized);
    } else if (mode === "create") {
      setName("");
      setEmail("");
      setPassword("");
      setRole("EMPLOYEE");
      setAiAuthorized(false);
    }
  }, [open, mode, user]);

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
      const body: Record<string, unknown> = {
        name,
        email,
        role,
        aiAuthorized,
      };
      if (password.length > 0) body.password = password;
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-auth"
                checked={aiAuthorized}
                onCheckedChange={(v) => setAiAuthorized(v === true)}
              />
              <Label htmlFor="ai-auth" className="font-normal">
                允许使用 AI 功能（Claude 等）
              </Label>
            </div>
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
