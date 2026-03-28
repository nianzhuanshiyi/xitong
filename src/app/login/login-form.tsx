"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("邮箱或密码错误");
        return;
      }
      router.push("/dashboard");
      router.refresh();
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
            登录
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
            使用团队账号进入选品分析系统
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700">
                邮箱
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 border-slate-200 bg-white focus-visible:border-indigo-400 focus-visible:ring-indigo-500/20"
              />
            </div>
            <Button type="submit" className="mt-2 h-10 w-full text-[15px] font-medium" disabled={loading}>
              {loading ? "登录中…" : "登录"}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
            开发环境默认：
            <span className="font-mono text-slate-700"> admin@example.com </span>/
            <span className="font-mono text-slate-700"> admin123</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
