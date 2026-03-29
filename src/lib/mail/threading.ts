import type { Email } from "@prisma/client";
import { emailListItem } from "@/lib/mail/dto";
import type { MailListItem } from "@/lib/mail/fixtures";

export type ThreadableEmail = Pick<
  Email,
  | "id"
  | "messageId"
  | "inReplyTo"
  | "referencesIds"
  | "subject"
  | "supplierId"
  | "receivedAt"
  | "direction"
  | "summaryCn"
  | "isRead"
  | "isStarred"
  | "hasAttachments"
  | "aiBucket"
> & {
  actionItems?: { isCompleted: boolean }[];
  supplier?: { name: string } | null;
};

function normMsgId(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[<>]/g, "").trim();
}

/** 去掉 Re:/Fwd: 等前缀，用于同主题弱合并 */
export function normalizeMailSubject(subject: string): string {
  let s = subject.trim();
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/^(re|fw|fwd|转发)\s*:\s*/i, "").trim();
    if (next === s) break;
    s = next;
  }
  return s.toLowerCase();
}

class DSU {
  parent = new Map<string, string>();

  find(a: string): string {
    if (!this.parent.has(a)) this.parent.set(a, a);
    const p = this.parent.get(a)!;
    if (p === a) return a;
    const r = this.find(p);
    this.parent.set(a, r);
    return r;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/** 按 In-Reply-To / References / 同主题（同供应商）合并线程 */
export function groupEmailsIntoThreads(emails: ThreadableEmail[]): Map<string, string[]> {
  const dsu = new DSU();
  for (const e of emails) dsu.find(e.id);

  const msgToEmailId = new Map<string, string>();
  for (const e of emails) {
    msgToEmailId.set(normMsgId(e.messageId), e.id);
  }

  for (const e of emails) {
    const irt = normMsgId(e.inReplyTo);
    if (irt) {
      const p = msgToEmailId.get(irt);
      if (p) dsu.union(e.id, p);
    }
    const refs = e.referencesIds?.trim();
    if (refs) {
      for (const part of refs.split(/\s+/)) {
        const r = normMsgId(part);
        if (!r) continue;
        const p = msgToEmailId.get(r);
        if (p) dsu.union(e.id, p);
      }
    }
  }

  const subjectKey = (e: ThreadableEmail) =>
    `${e.supplierId ?? "__none__"}\x00${normalizeMailSubject(e.subject)}`;

  const bySubject = new Map<string, string[]>();
  for (const e of emails) {
    const k = subjectKey(e);
    if (!bySubject.has(k)) bySubject.set(k, []);
    bySubject.get(k)!.push(e.id);
  }
  for (const ids of Array.from(bySubject.values())) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) dsu.union(ids[0]!, ids[i]!);
  }

  const groups = new Map<string, string[]>();
  for (const e of emails) {
    const root = dsu.find(e.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(e.id);
  }
  return groups;
}

/** 线程 ID = 该组内最早一封的 id */
export function threadRootId(
  emailIds: string[],
  byId: Map<string, ThreadableEmail>
): string {
  let best = emailIds[0]!;
  let bestT = byId.get(best)!.receivedAt.getTime();
  for (const id of emailIds) {
    const t = byId.get(id)!.receivedAt.getTime();
    if (t < bestT) {
      bestT = t;
      best = id;
    }
  }
  return best;
}

export type MailThreadSummary = {
  threadId: string;
  messageCount: number;
  latest: MailListItem;
};

export function buildThreadSummaries(emails: ThreadableEmail[]): MailThreadSummary[] {
  if (emails.length === 0) return [];
  const byId = new Map(emails.map((e) => [e.id, e]));
  const groups = groupEmailsIntoThreads(emails);
  const out: MailThreadSummary[] = [];

  for (const ids of Array.from(groups.values())) {
    const root = threadRootId(ids, byId);
    const members = ids.map((id: string) => byId.get(id)!);
    members.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    const latest = members[0]!;
    out.push({
      threadId: root,
      messageCount: ids.length,
      latest: emailListItem(latest),
    });
  }

  out.sort(
    (a, b) =>
      new Date(b.latest.receivedAt).getTime() -
      new Date(a.latest.receivedAt).getTime()
  );
  return out;
}

export function getThreadMemberIds(
  emails: ThreadableEmail[],
  anyMemberOrRootId: string
): string[] {
  const groups = groupEmailsIntoThreads(emails);
  for (const ids of Array.from(groups.values())) {
    if (ids.includes(anyMemberOrRootId)) return ids;
  }
  return [anyMemberOrRootId];
}
