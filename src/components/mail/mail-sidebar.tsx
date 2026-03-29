"use client";

import Link from "next/link";
import { Building2, Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useMailContext,
  BUCKETS,
  statusBarClass,
  formatMailTime,
} from "./mail-context";

export function MailSidebar() {
  const ctx = useMailContext();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white">
      <div className="border-b border-slate-100 p-2">
        <Tabs
          value={ctx.leftTab}
          onValueChange={(v) => {
            ctx.setLeftTab(v as "all" | "suppliers");
            ctx.setBucket(null);
            if (v === "all") ctx.setSupplierId(null);
            ctx.setEmailId(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="all" className="gap-1 text-xs">
              <Inbox className="size-3.5" />
              收件箱
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-1 text-xs">
              <Building2 className="size-3.5" />
              供应商
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Input
        placeholder="搜索…"
        className="mx-2 mt-2 h-8 text-xs"
        value={ctx.qLeft}
        onChange={(e) => ctx.setQLeft(e.target.value)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {ctx.leftTab === "all" ? (
          <div className="space-y-1">
            <p className="px-1 text-[10px] text-slate-400 leading-snug">
              显示未归类邮件，已归入供应商的邮件请在供应商标签页查看
            </p>
            <p className="px-1 pt-1 text-[10px] font-medium text-slate-500">
              AI 分类
            </p>
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  ctx.setBucket(b.id);
                  ctx.setEmailId(null);
                  if (ctx.narrow) ctx.setMobileStep(1);
                }}
                className={cn(
                  "w-full rounded-lg border px-2 py-2 text-left text-xs transition",
                  ctx.bucket === b.id
                    ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                    : "border-transparent hover:bg-slate-50"
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {ctx.filteredSuppliers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  ctx.setSupplierId(s.id);
                  ctx.setEmailId(null);
                  if (ctx.narrow) ctx.setMobileStep(1);
                }}
                className={cn(
                  "relative w-full rounded-lg border-l-4 border border-slate-100 bg-slate-50/80 px-2 py-2 text-left text-xs transition hover:bg-white",
                  statusBarClass(s.status),
                  ctx.supplierId === s.id && "ring-1 ring-indigo-300"
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="min-w-0 truncate font-medium text-slate-900">{s.name}</span>
                  {s.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {s.unreadCount > 9 ? "9+" : s.unreadCount}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1 overflow-hidden">
                  <p className="min-w-0 truncate text-[10px] text-slate-500">
                    {s.lastSnippet || "—"}
                  </p>
                  {s.lastAt && (
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {formatMailTime(s.lastAt)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 p-2">
        <Link
          href="/dashboard/suppliers"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full text-xs"
          )}
        >
          + 新增供应商
        </Link>
      </div>
    </div>
  );
}
