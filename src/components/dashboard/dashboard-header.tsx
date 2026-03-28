"use client";

import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Bell, LogOut, Search, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDashboardTitle } from "@/config/dashboard-nav";

export function DashboardHeader() {
  const pathname = usePathname();
  const title = getDashboardTitle(pathname ?? "");
  const { data: session } = useSession();
  const user = session?.user;
  const initial = user?.name?.charAt(0) ?? user?.email?.charAt(0) ?? "?";

  return (
    <header className="sticky top-0 z-30 flex h-[3.75rem] shrink-0 items-center gap-4 border-b border-slate-200/90 bg-white/80 px-5 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 sm:px-6">
      <h1 className="min-w-0 shrink-0 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
        {title}
      </h1>

      <div className="relative mx-auto hidden max-w-md flex-1 md:block">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="搜索模块、ASIN 或文档…"
          className="h-10 w-full rounded-full border-slate-200/90 bg-slate-100/80 pl-10 pr-4 text-sm text-slate-800 shadow-inner placeholder:text-slate-400 focus-visible:border-indigo-300 focus-visible:bg-white focus-visible:ring-indigo-500/20"
          aria-label="全局搜索"
        />
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {user?.role && (
          <Badge
            variant="outline"
            className="hidden border-indigo-200/90 bg-indigo-50/90 font-medium text-indigo-900 shadow-sm sm:inline-flex"
          >
            {user.role === "ADMIN" ? "管理员" : "员工"}
          </Badge>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="relative rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          aria-label="通知"
        >
          <Bell className="size-[18px]" />
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 ring-2 ring-white" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none ring-offset-2 ring-offset-white transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-indigo-400">
            <Avatar className="size-9 cursor-pointer ring-2 ring-slate-200/80 transition-shadow hover:ring-indigo-200">
              <AvatarFallback className="bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-xs font-semibold text-white">
                {initial}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{user?.name ?? "用户"}</span>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="gap-2">
              <UserRound className="size-4" />
              个人资料
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="gap-2"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="size-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
