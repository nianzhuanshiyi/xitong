"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { dashboardNav } from "@/config/dashboard-nav";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const items = dashboardNav.filter((i) => {
    if (session?.user?.role !== "ADMIN") {
      if (i.href === "/dashboard/users" || i.href === "/dashboard/settings")
        return false;
    }
    return true;
  });

  return (
    <aside className="flex h-screen w-[15.5rem] shrink-0 flex-col border-r border-white/10 bg-[#1e1b4b] text-slate-100 shadow-sidebar">
      <div className="border-b border-white/10 px-4 py-5">
        <Link
          href="/dashboard"
          className="group flex items-center gap-3 rounded-xl outline-none ring-offset-2 ring-offset-[#1e1b4b] transition-transform hover:opacity-95 focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-sm font-bold text-white shadow-lg shadow-indigo-950/50 transition-transform duration-200 group-hover:scale-[1.03]">
            选
          </div>
          <div className="min-w-0">
            <div className="font-heading truncate text-sm font-semibold tracking-tight text-white">
              选品分析 SaaS
            </div>
            <p className="truncate text-xs text-indigo-200/85">跨境电商 · 亚马逊</p>
          </div>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-3">
        {items.map(({ href, label, Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group/nav flex items-center gap-3 rounded-xl border-l-[3px] py-2.5 pl-2.5 pr-3 text-sm font-medium transition-all duration-200",
                active
                  ? "border-l-[#c4b5fd] bg-gradient-to-r from-white/[0.18] to-white/[0.06] text-white shadow-sm ring-1 ring-white/10"
                  : "border-l-transparent text-slate-300 hover:border-l-white/20 hover:bg-white/[0.08] hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] shrink-0 transition-transform duration-200 group-hover/nav:scale-110",
                  active ? "text-indigo-100" : "text-slate-400 group-hover/nav:text-white"
                )}
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <p className="text-center text-[11px] text-indigo-300/75">选品工作台 · 清爽高效</p>
      </div>
    </aside>
  );
}
