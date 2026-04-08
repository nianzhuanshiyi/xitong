"use client";

import Link from "next/link";
import { ArrowUpRight, LineChart, Mail, Sparkles, Warehouse, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

const modules = [
  {
    title: "选品分析",
    description: "卖家精灵 MCP 数据对接（待接入）",
    body: "在「选品分析」中查看 ASIN、关键词与市场数据，支撑上架决策。",
    icon: LineChart,
    bar: "from-indigo-500 via-violet-500 to-purple-500",
    href: "/dashboard/product-analysis",
  },
  {
    title: "智能选品",
    description: "Claude API 驱动（待接入）",
    body: "AI 辅助发现机会品类、竞品缺口与差异化切入点。",
    icon: Sparkles,
    bar: "from-violet-500 via-purple-500 to-fuchsia-500",
    href: "/dashboard/smart-selection",
  },
  {
    title: "供应商资源库",
    description: "美韩供应商维护",
    body: "集中管理 FormulAB、Luxe Farm 等合作方信息与联系方式。",
    icon: Warehouse,
    bar: "from-indigo-400 via-indigo-500 to-violet-600",
    href: "/dashboard/suppliers",
  },
] as const;

export function DashboardHome({
  unreadMail,
  openTodos,
}: {
  unreadMail: number;
  openTodos: number;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card sm:p-8">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-indigo-400/25 to-violet-500/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-violet-400/15 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-wider text-indigo-600/90">
            欢迎回来
          </p>
          <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            跨境电商选品分析工作台
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-[15px]">
            左侧可进入各功能模块。后续将接入卖家精灵 MCP 与 Claude API，把数据与 AI
            能力接到同一套清爽界面里，减少切换成本。
          </p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/mail"
          className={cn(
            "group relative flex items-center gap-4 overflow-hidden rounded-xl border border-slate-200/90 bg-white p-5 shadow-card transition-all",
            "hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-1 hover:ring-indigo-200/70"
          )}
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
            <Mail className="size-6" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">未读邮件</p>
            <p className="font-heading text-2xl font-semibold text-slate-900">
              {unreadMail}
            </p>
            <p className="text-xs text-indigo-600/90">进入邮件中心 →</p>
          </div>
          <ArrowUpRight className="size-5 shrink-0 text-slate-300 transition group-hover:text-indigo-500" />
        </Link>
        <Link
          href="/dashboard/todos"
          className={cn(
            "group relative flex items-center gap-4 overflow-hidden rounded-xl border border-slate-200/90 bg-white p-5 shadow-card transition-all",
            "hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-1 hover:ring-amber-200/80"
          )}
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <ClipboardList className="size-6" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">待办事项</p>
            <p className="font-heading text-2xl font-semibold text-slate-900">
              {openTodos}
            </p>
            <p className="text-xs text-amber-700/90">进入待办中心 →</p>
          </div>
          <ArrowUpRight className="size-5 shrink-0 text-slate-300 transition group-hover:text-amber-600" />
        </Link>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ title, description, body, icon: Icon, bar, href }) => (
          <Link
            key={title}
            href={href}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-card",
              "transition-all duration-300 ease-out",
              "hover:-translate-y-1 hover:scale-[1.02] hover:shadow-card-hover hover:ring-1 hover:ring-indigo-200/70"
            )}
          >
            <div
              className={cn("h-1.5 w-full bg-gradient-to-r", bar)}
              aria-hidden
            />
            <div className="flex flex-1 flex-col p-5 pt-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-primary-soft text-indigo-600 shadow-inner ring-1 ring-indigo-100/80 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-md">
                  <Icon className="size-5" strokeWidth={2} />
                </div>
                <ArrowUpRight
                  className="size-5 shrink-0 text-slate-300 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-indigo-500"
                  aria-hidden
                />
              </div>
              <h3 className="font-heading text-base font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-xs font-medium text-indigo-600/90">{description}</p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{body}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
