import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const patchSchema = z.object({
  marketplace: z.string().min(1).max(16).optional(),
  category: z.string().min(1).max(200).optional(),
  productName: z.string().min(1).max(500).optional(),
  brandName: z.string().min(1).max(200).optional(),
  inputJson: z.string().min(2).max(500_000).optional(),
  resultJson: z.string().max(2_000_000).optional().nullable(),
  status: z.enum(["DRAFT", "COMPLETED", "USED"]).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const row = await prisma.listingDraft.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!row) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const own = await prisma.listingDraft.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!own) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }

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

  if (parsed.data.inputJson) {
    try {
      JSON.parse(parsed.data.inputJson);
    } catch {
      return NextResponse.json({ message: "inputJson 无效" }, { status: 400 });
    }
  }
  if (parsed.data.resultJson) {
    try {
      JSON.parse(parsed.data.resultJson);
    } catch {
      return NextResponse.json({ message: "resultJson 无效" }, { status: 400 });
    }
  }

  const row = await prisma.listingDraft.update({
    where: { id },
    data: {
      ...parsed.data,
    },
  });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const own = await prisma.listingDraft.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!own) {
    return NextResponse.json({ message: "未找到" }, { status: 404 });
  }
  await prisma.listingDraft.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
