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
  FileText,
  ImageIcon,
  Package,
  History,
  Settings,
  Ticket,
  Bot,
  BarChart3,
  Rocket,
  Activity,
  MessageSquarePlus,
  Cpu,
} from "lucide-react";

export type DashboardNavItem = {
  href: string;
  label: string;
  title: string;
  Icon: LucideIcon;
  /** 显示未读邮件数角标 */
  mailBadge?: boolean;
  /** 关联的模块 ID，用于权限控制。为空表示所有人可见 */
  moduleId?: string;
  /** 仅管理员可见 */
  adminOnly?: boolean;
  /** 分类 */
  category?: "常用工具" | "选品" | "管理";
};

export const dashboardNav: DashboardNavItem[] = [
  { href: "/dashboard", label: "仪表盘", title: "仪表盘", Icon: LayoutDashboard, category: "常用工具" },
  {
    href: "/dashboard/mail",
    label: "📧 邮件中心",
    title: "邮件中心",
    Icon: Mail,
    mailBadge: true,
    moduleId: "email",
    category: "常用工具",
  },
  {
    href: "/dashboard/todos",
    label: "📋 待办中心",
    title: "待办中心",
    Icon: ClipboardList,
    moduleId: "todos",
    category: "常用工具",
  },
  {
    href: "/dashboard/listing",
    label: "Listing 撰写",
    title: "Listing 撰写",
    Icon: FileText,
    moduleId: "listing",
    category: "常用工具",
  },
  { href: "/dashboard/ai-images", label: "AI 图片", title: "AI 图片", Icon: ImageIcon, moduleId: "ai-images", category: "常用工具" },
  {
    href: "/dashboard/ai-assistant",
    label: "AI 助手",
    title: "AI 助手",
    Icon: Bot,
    moduleId: "ai-assistant",
    category: "常用工具",
  },
  
  {
    href: "/dashboard/feedback",
    label: "需求反馈",
    title: "需求反馈",
    Icon: MessageSquarePlus,
    category: "常用工具",
  },

  {
    href: "/dashboard/product-analysis",
    label: "竞品分析",
    title: "竞品分析",
    Icon: LineChart,
    moduleId: "selection-analysis",
    category: "选品",
  },
  { href: "/dashboard/history", label: "历史记录", title: "历史记录", Icon: History, category: "选品" },
  {
    href: "/dashboard/smart-selection",
    label: "智能选品",
    title: "智能选品",
    Icon: Sparkles,
    moduleId: "selection-analysis",
    category: "选品",
  },
  {
    href: "/dashboard/beauty-ideas",
    label: "美妆新品创意",
    title: "美妆新品创意",
    Icon: FlaskConical,
    moduleId: "beauty-ideas",
    category: "选品",
  },
  {
    href: "/dashboard/three-c-ideas",
    label: "3C新品创意",
    title: "3C新品创意",
    Icon: Cpu,
    moduleId: "three-c-ideas",
    category: "选品",
  },
  {
    href: "/dashboard/au-dev",
    label: "澳洲开发",
    title: "澳洲产品开发",
    Icon: Rocket,
    category: "选品",
  },
  {
    href: "/dashboard/product-dev",
    label: "产品开发",
    title: "产品开发",
    Icon: Package,
    moduleId: "product-dev",
    category: "选品",
  },
  {
    href: "/dashboard/suppliers",
    label: "供应商资源库",
    title: "供应商资源库",
    Icon: Warehouse,
    moduleId: "suppliers",
    category: "选品",
  },

  { href: "/dashboard/users", label: "用户管理", title: "用户管理", Icon: Users, adminOnly: true, category: "管理" },
  { href: "/dashboard/settings", label: "设置", title: "设置", Icon: Settings, adminOnly: true, category: "管理" },
  {
    href: "/dashboard/invite-codes",
    label: "邀请码管理",
    title: "邀请码管理",
    Icon: Ticket,
    adminOnly: true,
    category: "管理",
  },
  {
    href: "/dashboard/token-ranking",
    label: "Token 用量",
    title: "Token 用量排行",
    Icon: BarChart3,
    adminOnly: true,
    category: "管理",
  },
  {
    href: "/dashboard/activity-logs",
    label: "操作记录",
    title: "操作记录",
    Icon: Activity,
    adminOnly: true,
    category: "管理",
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
