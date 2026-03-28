import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  marketplace: z.string().min(1).max(16),
  category: z.string().min(1).max(200),
  productName: z.string().min(1).max(500),
  brandName: z.string().min(1).max(200),
  inputJson: z.string().min(2).max(500_000),
  resultJson: z.string().max(2_000_000).optional().nullable(),
  status: z.enum(["DRAFT", "COMPLETED", "USED"]).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const rows = await prisma.listingDraft.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: {
      id: true,
      marketplace: true,
      category: true,
      productName: true,
      brandName: true,
      status: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    JSON.parse(parsed.data.inputJson);
  } catch {
    return NextResponse.json({ message: "inputJson 无效" }, { status: 400 });
  }
  if (parsed.data.resultJson) {
    try {
      JSON.parse(parsed.data.resultJson);
    } catch {
      return NextResponse.json({ message: "resultJson 无效" }, { status: 400 });
    }
  }

  const row = await prisma.listingDraft.create({
    data: {
      userId: session.user.id,
      marketplace: parsed.data.marketplace,
      category: parsed.data.category,
      productName: parsed.data.productName,
      brandName: parsed.data.brandName,
      inputJson: parsed.data.inputJson,
      resultJson: parsed.data.resultJson ?? null,
      status: parsed.data.status ?? "DRAFT",
    },
  });
  return NextResponse.json(row, { status: 201 });
}
