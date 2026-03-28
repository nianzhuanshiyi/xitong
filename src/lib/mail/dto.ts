import type { Email, EmailAttachment, ActionItem } from "@prisma/client";

/** 列表项所需字段（线程聚合等场景只需子集） */
export type EmailListItemSource = Pick<
  Email,
  | "id"
  | "supplierId"
  | "direction"
  | "subject"
  | "summaryCn"
  | "receivedAt"
  | "isRead"
  | "isStarred"
  | "hasAttachments"
  | "aiBucket"
> & {
  actionItems?: Pick<ActionItem, "isCompleted">[];
};

export function emailListItem(e: EmailListItemSource) {
  const openTodoCount =
    e.actionItems?.filter((a) => !a.isCompleted).length ?? 0;
  return {
    id: e.id,
    supplierId: e.supplierId,
    direction: e.direction,
    subject: e.subject,
    summaryCn: e.summaryCn,
    receivedAt: e.receivedAt.toISOString(),
    isRead: e.isRead,
    isStarred: e.isStarred,
    hasAttachments: e.hasAttachments,
    openTodoCount,
    aiBucket: e.aiBucket,
  };
}

export function emailDetail(
  e: Email & {
    actionItems?: ActionItem[];
    attachments?: EmailAttachment[];
    supplier?: { name: string } | null;
  }
) {
  return {
    ...emailListItem({ ...e, actionItems: e.actionItems }),
    supplierName: e.supplier?.name ?? null,
    fromAddress: e.fromAddress,
    toAddress: e.toAddress,
    bodyText: e.bodyText,
    bodyHtml: e.bodyHtml,
    bodyZh: e.bodyZh,
    priority: e.priority,
    tagsJson: e.tagsJson,
    actionItems: (e.actionItems ?? []).map((a) => ({
      id: a.id,
      content: a.content,
      isCompleted: a.isCompleted,
      dueDate: a.dueDate?.toISOString() ?? null,
    })),
    attachments: (e.attachments ?? []).map((f) => ({
      id: f.id,
      filename: f.filename,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      storagePath: f.storagePath,
    })),
  };
}
