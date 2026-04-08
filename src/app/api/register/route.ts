import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  name: z.string().min(1, "请输入姓名").max(50),
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位"),
  inviteCode: z.string().min(1, "请输入邀请码"),
});

/** POST /api/register — 公开注册（需要有效邀请码） */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "参数错误";
    return NextResponse.json(
      { message: first, issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, email, password, inviteCode } = parsed.data;

  try {
    // 1. 验证邀请码
    const invite = await prisma.inviteCode.findUnique({
      where: { code: inviteCode.toUpperCase() },
    });

    if (!invite) {
      return NextResponse.json({ message: "邀请码无效" }, { status: 400 });
    }
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ message: "邀请码已过期" }, { status: 400 });
    }
    if (invite.usedCount >= invite.maxUses) {
      return NextResponse.json({ message: "邀请码已达到使用上限" }, { status: 400 });
    }

    // 2. 检查邮箱是否已注册
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ message: "该邮箱已被注册" }, { status: 409 });
    }

    // 3. 判断是否为特殊管理员邮箱或系统中第一个用户
    const userCount = await prisma.user.count();
    const isSpecialAdmin =
      email.toLowerCase() === "ceo@zavyrabeauty.com" || userCount === 0;

    const allModules = JSON.stringify([
      "3c-ideas","europe-ideas","email",
      "ai-assistant","product-dev","selection-analysis",
      "listing","ai-images","suppliers","todos",
    ]);

    // 4. 创建用户
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: isSpecialAdmin ? "ADMIN" : "EMPLOYEE",
        aiAuthorized: true,
        allowedModules: allModules,
        assignedModel: "claude-sonnet-4-20250514",
      },
    });

    // 5. 邀请码 usedCount + 1
    await prisma.inviteCode.update({
      where: { id: invite.id },
      data: { usedCount: { increment: 1 } },
    });

    return NextResponse.json(
      {
        message: "注册成功",
        userId: user.id,
        needApproval: false,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[register] POST error:", e);
    return NextResponse.json(
      { message: "注册失败，请稍后再试", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
