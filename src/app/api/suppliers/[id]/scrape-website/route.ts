import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { aiExtractWebsiteFields, scrapeWebsitePlainText } from "@/lib/supplier-ai";
import { faviconUrlFromWebsite } from "@/lib/supplier-uploads";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { id } = await params;

  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s?.website?.trim()) {
    return NextResponse.json({ message: "请先填写官网地址" }, { status: 400 });
  }

  const plain = await scrapeWebsitePlainText(s.website);
  if (!plain?.length) {
    return NextResponse.json({ message: "无法抓取网页内容" }, { status: 502 });
  }

  const extracted = await aiExtractWebsiteFields(plain);
  if (!extracted) {
    return NextResponse.json(
      { message: "AI 未返回结果（请检查 Claude API）" },
      { status: 502 }
    );
  }

  const mainCategories =
    typeof extracted.suggestedCategories === "string" &&
    extracted.suggestedCategories.trim()
      ? extracted.suggestedCategories.trim()
      : s.mainCategories;

  const paymentTerms =
    (extracted.paymentTermsGuess as string | null) ?? s.paymentTerms;
  const moq = (extracted.moqGuess as string | null) ?? s.moq;

  const contactsSummary = (extracted.contactsSummary as string | null) ?? null;

  const data: Prisma.SupplierUpdateInput = {
    nameEn: (extracted.nameEn as string | null) ?? s.nameEn,
    mainCategories: mainCategories ?? undefined,
    paymentTerms: paymentTerms ?? undefined,
    moq: moq ?? undefined,
    profileSummary:
      (extracted.profileSummary as string | null) ?? s.profileSummary,
    websiteScrapedAt: new Date(),
    lastActivityAt: new Date(),
    logoUrl: faviconUrlFromWebsite(s.website) ?? s.logoUrl,
  };
  if (!s.contact?.trim() && contactsSummary) {
    data.contact = contactsSummary.slice(0, 500);
  }

  const updated = await prisma.supplier.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    supplier: updated,
    extracted,
  });
}
