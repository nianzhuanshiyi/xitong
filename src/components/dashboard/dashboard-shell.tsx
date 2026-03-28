"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  History,
  LayoutDashboard,
  LineChart,
  Menu,
  Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dashboardNav } from "@/config/dashboard-nav";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const QUICK_NAV = [
  { href: "/dashboard", label: "首页", Icon: LayoutDashboard },
  { href: "/dashboard/product-analysis", label: "选品", Icon: LineChart },
  { href: "/dashboard/suppliers", label: "供应商", Icon: Warehouse },
  { href: "/dashboard/history", label: "历史", Icon: History },
] as const;

function useFilteredNav() {
  const { data: session } = useSession();
  return dashboardNav.filter((i) => {
    if (session?.user?.role !== "ADMIN") {
      if (i.href === "/dashboard/users" || i.href === "/dashboard/settings")
        return false;
    }
    return true;
  });
}

function NavLinks({
  variant,
  onNavigate,
}: {
  variant: "full" | "icons" | "mobile";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = useFilteredNav();

  return (
    <>
      {items.map(({ href, label, Icon }) => {
        const active =
          href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(href);

        if (variant === "icons") {
          return (
            <Link
              key={href}
              href={href}
              title={label}
              onClick={onNavigate}
              className={cn(
                "flex size-11 items-center justify-center rounded-xl transition-all duration-200",
                active
                  ? "bg-white/[0.18] text-white shadow-sm ring-1 ring-white/15"
                  : "text-slate-400 hover:bg-white/[0.1] hover:text-white"
              )}
            >
              <Icon className="size-[22px] shrink-0" />
            </Link>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group/nav flex items-center gap-3 rounded-xl border-l-[3px] py-2.5 pl-2.5 pr-3 text-sm font-medium transition-all duration-200",
              variant === "mobile" && "border-l-0 py-3 pl-4 pr-4 text-base",
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
    </>
  );
}

function SidebarBrand({ compact }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="group flex items-center gap-3 rounded-xl outline-none ring-offset-2 ring-offset-[#1e1b4b] transition-transform hover:opacity-95 focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-sm font-bold text-white shadow-lg shadow-indigo-950/50 transition-transform duration-200 group-hover:scale-[1.03]">
        选
      </div>
      {!compact && (
        <div className="min-w-0">
          <div className="font-heading truncate text-sm font-semibold tracking-tight text-white">
            选品分析 SaaS
          </div>
          <p className="truncate text-xs text-indigo-200/85">跨境电商 · 亚马逊</p>
        </div>
      )}
    </Link>
  );
}

/**
 * 响应式仪表盘框架：
 * - lg+：完整左侧栏
 * - md–lg：图标窄栏
 * - &lt;md：汉堡/抽屉 + 底部快捷导航
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const close = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", close);
    close();
    return () => mq.removeEventListener("change", close);
  }, []);

  return (
    <div className="flex min-h-screen min-h-dvh bg-[#f8fafc]">
      <aside className="hidden h-screen w-[15.5rem] shrink-0 flex-col border-r border-white/10 bg-[#1e1b4b] text-slate-100 shadow-sidebar lg:flex">
        <div className="border-b border-white/10 px-4 py-5">
          <SidebarBrand />
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-3">
          <NavLinks variant="full" />
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-center text-[11px] text-indigo-300/75">
            选品工作台 · 清爽高效
          </p>
        </div>
      </aside>

      <aside className="hidden h-screen w-[4.5rem] shrink-0 flex-col items-center border-r border-white/10 bg-[#1e1b4b] text-slate-100 shadow-sidebar md:flex lg:hidden">
        <div className="flex w-full flex-col items-center border-b border-white/10 py-4">
          <SidebarBrand compact />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden px-1 py-3">
          <NavLinks variant="icons" />
        </nav>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={(o) => setMobileOpen(o)}>
        <SheetContent
          side="left"
          showCloseButton
          className={cn(
            "flex h-[100dvh] max-h-[100dvh] w-full max-w-[min(100vw,20rem)] flex-col border-r border-white/10 bg-[#1e1b4b] p-0 text-slate-100",
            "rounded-none sm:max-w-sm"
          )}
        >
          <SheetHeader className="space-y-1 border-b border-white/10 p-4 text-left">
            <SheetTitle className="font-heading text-lg text-white">导航菜单</SheetTitle>
            <p className="text-xs font-normal text-indigo-200/80">选择功能模块</p>
          </SheetHeader>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            <NavLinks variant="mobile" onNavigate={() => setMobileOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DashboardHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:pb-8">
          {children}
        </main>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-stretch justify-around border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_24px_rgba(15,23,42,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-white/85 md:hidden"
        aria-label="快捷导航"
      >
        {QUICK_NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 pt-1 text-[10px] font-medium leading-tight text-slate-600 transition-colors active:bg-slate-100 active:text-indigo-700"
          >
            <Icon className="size-[22px] shrink-0 text-slate-500" strokeWidth={2} />
            <span className="truncate">{label}</span>
          </Link>
        ))}
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 pt-1 text-[10px] font-medium leading-tight text-slate-600 transition-colors active:bg-slate-100 active:text-indigo-700"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-[22px] shrink-0 text-slate-500" strokeWidth={2} />
          <span>菜单</span>
        </button>
      </nav>
    </div>
  );
}
