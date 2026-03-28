import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchCompetitorContext } from "@/lib/listing/competitor";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  marketplace: z.string().min(1).max(16),
  asinText: z.string().max(500),
});

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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const raw = parsed.data.asinText;
  const asins = raw
    .split(/[\s,，;；]+/)
    .map((a) => a.trim().toUpperCase())
    .filter((a) => /^B[0-9A-Z]{9}$/.test(a))
    .slice(0, 3);

  const r = await fetchCompetitorContext({
    marketplace: parsed.data.marketplace,
    asins,
  });

  if (!r.ok) {
    return NextResponse.json({ message: r.error }, { status: 400 });
  }
  return NextResponse.json({ text: r.text, asins });
}
