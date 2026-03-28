import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import {
  extractDomainFromAddress,
  isPublicEmailDomain,
} from "@/lib/mail/public-domains";

const bodySchema = z.object({
  supplierId: z.string(),
  applyDomain: z.boolean().optional().default(false),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const email = await prisma.email.findFirst({
    where: { id, isDeleted: false },
  });
  if (!email) {
    return NextResponse.json({ message: "邮件不存在" }, { status: 404 });
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: parsed.data.supplierId },
  });
  if (!supplier) {
    return NextResponse.json({ message: "供应商不存在" }, { status: 404 });
  }

  const domain = extractDomainFromAddress(email.fromAddress);
  let domainUpdated = 0;

  await prisma.$transaction(async (tx) => {
    await tx.email.update({
      where: { id },
      data: {
        supplierId: supplier.id,
        isClassified: true,
        aiBucket: null,
      },
    });

    if (parsed.data.applyDomain && domain && !isPublicEmailDomain(domain)) {
      await tx.supplierDomain.upsert({
        where: { domain },
        create: { domain, supplierId: supplier.id },
        update: { supplierId: supplier.id },
      });
      const res = await tx.email.updateMany({
        where: {
          fromAddress: { contains: `@${domain}` },
          supplierId: null,
        },
        data: {
          supplierId: supplier.id,
          isClassified: true,
          aiBucket: null,
        },
      });
      domainUpdated = res.count;
    }
  });

  const msg =
    parsed.data.applyDomain && domain && !isPublicEmailDomain(domain)
      ? `已将 ${email.fromAddress} 及同域名下 ${domainUpdated} 封邮件归入「${supplier.name}」`
      : `已归入「${supplier.name}」`;

  return NextResponse.json({ ok: true, message: msg });
}
