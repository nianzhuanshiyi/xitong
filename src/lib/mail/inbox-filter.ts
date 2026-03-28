import type { Prisma } from "@prisma/client";

/** 默认收件箱：未删除且未归档 */
export function inboxEmailWhere(
  extra?: Prisma.EmailWhereInput
): Prisma.EmailWhereInput {
  return {
    isDeleted: false,
    isArchived: false,
    ...extra,
  };
}
