import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { mailUiMock } from "@/lib/mail/config";
import { MOCK_TODOS } from "@/lib/mail/fixtures";
import { MailPriority } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get("supplierId");
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const column = searchParams.get("column"); // urgent | normal | done

  if (mailUiMock()) {
    let list = [...MOCK_TODOS];
    if (supplierId) {
      list = list.filter((t) => t.supplierId === supplierId);
    }
    if (q) {
      list = list.filter((t) => t.content.toLowerCase().includes(q));
    }
    if (column === "urgent") {
      list = list.filter((t) => !t.isCompleted && t.priority === "URGENT");
    } else if (column === "normal") {
      list = list.filter((t) => !t.isCompleted && t.priority !== "URGENT");
    } else if (column === "done") {
      list = list.filter((t) => t.isCompleted);
    }
    return NextResponse.json(list);
  }

  const where: Prisma.ActionItemWhereInput = {};
  if (supplierId) where.supplierId = supplierId;
  if (q) {
    where.content = { contains: q };
  }
  if (column === "urgent") {
    where.isCompleted = false;
    where.priority = MailPriority.URGENT;
  } else if (column === "normal") {
    where.isCompleted = false;
    where.priority = { not: MailPriority.URGENT };
  } else if (column === "done") {
    where.isCompleted = true;
    where.completedAt = {
      gte: new Date(Date.now() - 7 * 86400_000),
    };
  }

  const rows = await prisma.actionItem.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      email: { select: { subject: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      content: r.content,
      priority: r.priority,
      isCompleted: r.isCompleted,
      dueDate: r.dueDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      supplierId: r.supplierId,
      supplierName: r.supplier?.name ?? null,
      emailSubject: r.email?.subject ?? null,
      emailId: r.emailId,
    }))
  );
}
