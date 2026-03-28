"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { dashboardNav } from "@/config/dashboard-nav";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const items =
    session?.user?.role === "ADMIN"
      ? dashboardNav
      : dashboardNav.filter((i) => i.href !== "/dashboard/users");

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-4">
        <Link href="/dashboard" className="font-heading text-sm font-semibold tracking-tight">
          选品分析 SaaS
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">跨境电商 · 亚马逊</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
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
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
