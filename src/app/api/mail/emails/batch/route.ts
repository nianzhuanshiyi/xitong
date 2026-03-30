import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["markRead", "markUnread", "archive", "delete"]),
});

export async function POST(req: Request) {
  const { error } = await requireModuleAccess("email");
  if (error) return error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效 JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { ids, action } = parsed.data;

  const dataMap: Record<string, Record<string, boolean>> = {
    markRead: { isRead: true },
    markUnread: { isRead: false },
    archive: { isArchived: true },
    delete: { isDeleted: true },
  };

  const updated = await prisma.email.updateMany({
    where: { id: { in: ids }, isDeleted: action === "delete" ? false : undefined },
    data: dataMap[action],
  });

  return NextResponse.json({ ok: true, count: updated.count });
}
