import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Warehouse,
  Mail,
  ClipboardList,
  LineChart,
  Sparkles,
  FlaskConical,
  Cpu,
  Globe,
  FileText,
  ImageIcon,
  Package,
  Truck,
  History,
  Settings,
  Ticket,
} from "lucide-react";

export type DashboardNavItem = {
  href: string;
  label: string;
  title: string;
  Icon: LucideIcon;
  /** 显示未读邮件数角标 */
  mailBadge?: boolean;
};

export const dashboardNav: DashboardNavItem[] = [
  { href: "/dashboard", label: "仪表盘", title: "仪表盘", Icon: LayoutDashboard },
  { href: "/dashboard/users", label: "用户管理", title: "用户管理", Icon: Users },
  {
    href: "/dashboard/suppliers",
    label: "供应商资源库",
    title: "供应商资源库",
    Icon: Warehouse,
  },
  {
    href: "/dashboard/mail",
    label: "📧 邮件中心",
    title: "邮件中心",
    Icon: Mail,
    mailBadge: true,
  },
  {
    href: "/dashboard/todos",
    label: "📋 待办中心",
    title: "待办中心",
    Icon: ClipboardList,
  },
  {
    href: "/dashboard/product-analysis",
    label: "选品分析",
    title: "选品分析",
    Icon: LineChart,
  },
  {
    href: "/dashboard/smart-selection",
    label: "智能选品",
    title: "智能选品",
    Icon: Sparkles,
  },
  {
    href: "/dashboard/beauty-ideas",
    label: "美妆新品创意",
    title: "美妆新品创意",
    Icon: FlaskConical,
  },
  {
    href: "/dashboard/3c-ideas",
    label: "3C新品创意",
    title: "3C新品创意",
    Icon: Cpu,
  },
  {
    href: "/dashboard/europe-ideas",
    label: "欧洲蓝海选品",
    title: "欧洲蓝海选品",
    Icon: Globe,
  },
  {
    href: "/dashboard/listing",
    label: "Listing 撰写",
    title: "Listing 撰写",
    Icon: FileText,
  },
  { href: "/dashboard/ai-images", label: "AI 图片", title: "AI 图片", Icon: ImageIcon },
  {
    href: "/dashboard/product-dev",
    label: "产品开发",
    title: "产品开发",
    Icon: Package,
  },
  {
    href: "/dashboard/supply-chain",
    label: "供应链分析",
    title: "供应链分析",
    Icon: Truck,
  },
  { href: "/dashboard/history", label: "历史记录", title: "历史记录", Icon: History },
  { href: "/dashboard/settings", label: "设置", title: "设置", Icon: Settings },
  {
    href: "/dashboard/invite-codes",
    label: "邀请码管理",
    title: "邀请码管理",
    Icon: Ticket,
  },
];

export function getDashboardTitle(pathname: string): string {
  if (pathname === "/dashboard") {
    return dashboardNav[0]?.title ?? "仪表盘";
  }
  const sorted = [...dashboardNav].sort((a, b) => b.href.length - a.href.length);
  const hit = sorted.find((item) => item.href !== "/dashboard" && pathname.startsWith(item.href));
  return hit?.title ?? "控制台";
}
