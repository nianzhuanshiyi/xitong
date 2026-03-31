import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

/** All module IDs used across the system */
export const ALL_MODULES = [
  "beauty-ideas",
  "3c-ideas",
  "europe-ideas",
  "email",
  "ai-assistant",
  "product-dev",
  "selection-analysis",
  "listing",
  "ai-images",
  "suppliers",
  "todos",
  "au-target",
  "au-dev",
] as const;

export type ModuleId = (typeof ALL_MODULES)[number];

/** Map dashboard paths to module IDs */
const PATH_TO_MODULE: Record<string, ModuleId> = {
  "/dashboard/beauty-ideas": "beauty-ideas",
  "/dashboard/3c-ideas": "3c-ideas",
  "/dashboard/europe-ideas": "europe-ideas",
  "/dashboard/mail": "email",
  "/dashboard/ai-assistant": "ai-assistant",
  "/dashboard/product-dev": "product-dev",
  "/dashboard/smart-selection": "selection-analysis",
  "/dashboard/product-analysis": "selection-analysis",
  "/dashboard/listing": "listing",
  "/dashboard/ai-images": "ai-images",
  "/dashboard/suppliers": "suppliers",
  "/dashboard/todos": "todos",
  "/dashboard/au-target": "au-target",
  "/dashboard/au-dev": "au-dev",
};

/** Map API paths to module IDs */
const API_TO_MODULE: Record<string, ModuleId> = {
  "/api/beauty-ideas": "beauty-ideas",
  "/api/3c-ideas": "3c-ideas",
  "/api/europe-ideas": "europe-ideas",
  "/api/mail": "email",
  "/api/ai-assistant": "ai-assistant",
  "/api/product-dev": "product-dev",
  "/api/smart-selection": "selection-analysis",
  "/api/product-analysis": "selection-analysis",
  "/api/listing": "listing",
  "/api/ai-images": "ai-images",
  "/api/suppliers": "suppliers",
  "/api/todos": "todos",
  "/api/au-target": "au-target",
  "/api/au-dev": "au-dev",
};

/** Check if user has access to a specific module — currently all logged-in users have access */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function hasModuleAccess(role: string, allowedModules: string[], moduleId: ModuleId): boolean {
  return true;
}

/** Get module ID from a dashboard path */
export function getModuleFromPath(pathname: string): ModuleId | null {
  for (const [prefix, mod] of Object.entries(PATH_TO_MODULE)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return mod;
  }
  return null;
}

/** Get module ID from an API path */
export function getModuleFromApiPath(pathname: string): ModuleId | null {
  for (const [prefix, mod] of Object.entries(API_TO_MODULE)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return mod;
  }
  return null;
}

/**
 * Server-side: require session + module access.
 * Returns session if OK, or a NextResponse error.
 */
export async function requireModuleAccess(moduleId: ModuleId) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { session: null, error: NextResponse.json({ message: "未登录" }, { status: 401 }) };
  }
  if (!hasModuleAccess(session.user.role, session.user.allowedModules || [], moduleId)) {
    return { session: null, error: NextResponse.json({ message: "无权限访问该模块" }, { status: 403 }) };
  }
  return { session, error: null };
}
