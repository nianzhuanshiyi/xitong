"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    inviteCode: "",
  });
  const [loading, setLoading] = useState(false);

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast.error("两次密码不一致");
      return;
    }
    if (form.password.length < 6) {
      toast.error("密码至少 6 位");
      return;
    }

    setLoading(true);
    try {
      // 1. 注册
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          inviteCode: form.inviteCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "注册失败");

      // Check if user needs admin approval
      if (data.needApproval) {
        toast.success("注册成功，请等待管理员开通权限");
        // Still auto-login so they can see the dashboard (with limited access)
        await signIn("credentials", {
          email: form.email,
          password: form.password,
          redirect: false,
        });
        router.push("/dashboard");
        router.refresh();
        return;
      }

      // 2. 自动登录
      const signInRes = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (signInRes?.error) {
        toast.success("注册成功，请手动登录");
        router.push("/login");
        return;
      }

      toast.success("注册成功");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8fafc] p-4">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,rgba(99,102,241,0.28),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 h-[420px] w-[140%] max-w-none -translate-x-1/2 bg-[radial-gradient(circle,rgba(139,92,246,0.18),transparent_62%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-0 top-1/4 h-64 w-64 rounded-full bg-indigo-400/10 blur-3xl"
        aria-hidden
      />

      <Card className="relative w-full max-w-md border-slate-200/90 shadow-xl shadow-indigo-500/10 ring-1 ring-slate-200/60">
        <div
          className="h-1 w-full bg-gradient-to-r from-[#6366f1] via-violet-500 to-[#8b5cf6]"
          aria-hidden
        />
        <CardHeader className="space-y-1 pb-2 pt-6">
          <CardTitle className="font-heading text-2xl font-semibold tracking-tight">
            注册
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
            使用邀请码创建账号
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-700">
                姓名
              </Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="你的姓名"
                className="h-10 border-slate-200 bg-white focus-visible:border-indigo-400 focus-visible:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700">
                邮箱
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="your@email.com"
                className="h-10 border-slate-200 bg-white focus-visible:border-indigo-400 focus-visible:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700">
                密码
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="至少 6 位"
                className="h-10 border-slate-200 bg-white focus-visible:border-indigo-400 focus-visible:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-700">
                确认密码
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={form.confirmPassword}
                onChange={(e) => update("confirmPassword", e.target.value)}
                placeholder="再次输入密码"
                className="h-10 border-slate-200 bg-white focus-visible:border-indigo-400 focus-visible:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inviteCode" className="text-slate-700">
                邀请码
              </Label>
              <Input
                id="inviteCode"
                required
                value={form.inviteCode}
                onChange={(e) => update("inviteCode", e.target.value.toUpperCase())}
                placeholder="6 位邀请码"
                className="h-10 border-slate-200 bg-white font-mono tracking-widest focus-visible:border-indigo-400 focus-visible:ring-indigo-500/20"
                maxLength={20}
              />
            </div>
            <Button type="submit" className="mt-2 h-10 w-full text-[15px] font-medium" disabled={loading}>
              {loading ? "注册中…" : "注册"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-slate-500">
            已有账号？{" "}
            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              登录
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
