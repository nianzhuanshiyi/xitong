import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminSession } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { role, allowedModules } = body as {
    role?: string;
    allowedModules?: string[];
  };

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ message: "用户不存在" }, { status: 404 });
  }

  const data: { role?: "ADMIN" | "EMPLOYEE"; allowedModules?: string } = {};

  if (role !== undefined) {
    if (role !== "ADMIN" && role !== "EMPLOYEE") {
      return NextResponse.json({ message: "无效的角色" }, { status: 400 });
    }
    data.role = role;
  }

  if (allowedModules !== undefined) {
    if (!Array.isArray(allowedModules)) {
      return NextResponse.json({ message: "allowedModules 必须是数组" }, { status: 400 });
    }
    data.allowedModules = JSON.stringify(allowedModules);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      allowedModules: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    user: {
      ...updated,
      allowedModules: updated.allowedModules
        ? (JSON.parse(updated.allowedModules) as string[])
        : [],
    },
  });
}
