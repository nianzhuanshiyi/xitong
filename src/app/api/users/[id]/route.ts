import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
  aiAuthorized: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const update: {
    name?: string;
    email?: string;
    password?: string;
    role?: "ADMIN" | "EMPLOYEE";
    aiAuthorized?: boolean;
  } = {};

  if (data.name !== undefined) update.name = data.name;
  if (data.email !== undefined) update.email = data.email;
  if (data.role !== undefined) update.role = data.role;
  if (data.aiAuthorized !== undefined) update.aiAuthorized = data.aiAuthorized;
  if (data.password && data.password.length > 0) {
    update.password = await bcrypt.hash(data.password, 10);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ message: "无更新字段" }, { status: 400 });
  }

  if (update.email) {
    const taken = await prisma.user.findFirst({
      where: { email: update.email, NOT: { id } },
    });
    if (taken) {
      return NextResponse.json({ message: "该邮箱已被使用" }, { status: 409 });
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: update,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        aiAuthorized: true,
        teamId: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
      },
    });

    const logPayload: Record<string, unknown> = { ...update };
    if ("password" in logPayload) logPayload.password = "[redacted]";
    await prisma.operationLog.create({
      data: {
        userId: session.user.id,
        action: "USER_UPDATE",
        resource: id,
        details: JSON.stringify(logPayload),
      },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ message: "用户不存在" }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = params;

  if (id === session.user.id) {
    return NextResponse.json({ message: "不能删除当前登录账号" }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id } });
    await prisma.operationLog.create({
      data: {
        userId: session.user.id,
        action: "USER_DELETE",
        resource: id,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "用户不存在" }, { status: 404 });
  }
}
