import type { SupplierStatus } from "@prisma/client";

export type MailSupplierRow = {
  id: string;
  name: string;
  status: SupplierStatus;
  unreadCount: number;
  lastSnippet: string;
  lastAt: string;
};

export type MailListItem = {
  id: string;
  supplierId: string | null;
  direction: "RECEIVED" | "SENT";
  subject: string;
  summaryCn: string | null;
  receivedAt: string;
  isRead: boolean;
  isStarred?: boolean;
  hasAttachments: boolean;
  openTodoCount: number;
  aiBucket: string | null;
};

export type MailDetail = MailListItem & {
  supplierName?: string | null;
  fromAddress: string;
  toAddress: string;
  bodyText: string;
  bodyHtml: string | null;
  bodyZh: string | null;
  priority: "URGENT" | "NORMAL" | "LOW";
  tagsJson: string;
  actionItems: {
    id: string;
    content: string;
    isCompleted: boolean;
    dueDate: string | null;
  }[];
  attachments: {
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    storagePath: string;
  }[];
};

export type TodoRow = {
  id: string;
  content: string;
  priority: "URGENT" | "NORMAL" | "LOW";
  isCompleted: boolean;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  supplierId: string | null;
  supplierName: string | null;
  emailSubject: string | null;
  emailId: string | null;
};

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

export const MOCK_MAIL_SUPPLIERS: MailSupplierRow[] = [
  {
    id: "mock-sup-acme",
    name: "Acme Trading Co.",
    status: "COOPERATING",
    unreadCount: 2,
    lastSnippet: "Re: Updated FOB quote for SKU-2024 — valid until Friday",
    lastAt: iso(now - 3600_000),
  },
  {
    id: "mock-sup-luxe",
    name: "Luxe Farm Korea",
    status: "EVALUATING",
    unreadCount: 0,
    lastSnippet: "Sample shipment tracking: DHL 1234567890",
    lastAt: iso(now - 26 * 3600_000),
  },
  {
    id: "mock-sup-east",
    name: "EastLink Components",
    status: "CANDIDATE",
    unreadCount: 1,
    lastSnippet: "Invitation: Global Sources show booth B12",
    lastAt: iso(now - 3 * 3600_000),
  },
];

const MOCK_ACTIONS: Record<string, MailDetail["actionItems"]> = {
  em1: [
    { id: "ta1", content: "确认最新报价 MOQ", isCompleted: false, dueDate: null },
    { id: "ta2", content: "回复交期问题", isCompleted: true, dueDate: null },
  ],
  em2: [],
  em3: [{ id: "ta3", content: "核对账单金额", isCompleted: false, dueDate: null }],
  em4: [],
  em5: [],
};

function detail(
  id: string,
  partial: Omit<MailDetail, "actionItems" | "attachments"> & {
    attachments?: MailDetail["attachments"];
  }
): MailDetail {
  return {
    ...partial,
    actionItems: MOCK_ACTIONS[id] ?? [],
    attachments: partial.attachments ?? [],
  };
}

export const MOCK_MAIL_DETAILS: Record<string, MailDetail> = {
  em1: detail("em1", {
    id: "em1",
    supplierId: "mock-sup-acme",
    direction: "RECEIVED",
    subject: "Re: Updated FOB quote for SKU-2024",
    summaryCn:
      "供应商更新 FOB 报价，MOQ 500，交期 35 天，报价本周五前有效。请确认是否接受。",
    receivedAt: iso(now - 3600_000),
    isRead: false,
    hasAttachments: true,
    openTodoCount: 1,
    aiBucket: null,
    fromAddress: "sales@acme-trading.example.com",
    toAddress: "you@company.com",
    bodyText:
      "Dear Partner,\n\nPlease find our revised FOB pricing for SKU-2024. MOQ 500 pcs, lead time 35 days. Offer valid until this Friday.\n\nBest regards,\nTom",
    bodyHtml: null,
    bodyZh:
      "尊敬的合作伙伴，\n\n请查收 SKU-2024 修订后的 FOB 报价。起订量 500 件，交期 35 天，报价本周五前有效。\n\n此致\nTom",
    priority: "URGENT",
    tagsJson: JSON.stringify(["报价", "交期"]),
    attachments: [
      {
        id: "att1",
        filename: "Quote_SKU2024.pdf",
        contentType: "application/pdf",
        sizeBytes: 128000,
        storagePath: "uploads/mail-attachments/em1/quote.pdf",
      },
    ],
  }),
  em2: detail("em2", {
    id: "em2",
    supplierId: "mock-sup-acme",
    direction: "SENT",
    subject: "Re: Sample request — approved",
    summaryCn: "已同意寄样，请对方提供快递账号。",
    receivedAt: iso(now - 7200_000),
    isRead: true,
    hasAttachments: false,
    openTodoCount: 0,
    aiBucket: null,
    fromAddress: "you@company.com",
    toAddress: "sales@acme-trading.example.com",
    bodyText: "Hi Tom,\n\nApproved. Please share your courier account.\n\nThanks",
    bodyHtml: null,
    bodyZh: "你好 Tom，\n\n已批准寄样，请提供快递账号。\n\n谢谢",
    priority: "NORMAL",
    tagsJson: JSON.stringify(["样品"]),
  }),
  em3: detail("em3", {
    id: "em3",
    supplierId: null,
    direction: "RECEIVED",
    subject: "Invoice #INV-8891 — payment reminder",
    summaryCn: "账单催款，金额 $4,200，到期日为下周一至账户。",
    receivedAt: iso(now - 5000_000),
    isRead: false,
    hasAttachments: true,
    openTodoCount: 1,
    aiBucket: "invoice",
    fromAddress: "billing@logistics-partner.example.com",
    toAddress: "you@company.com",
    bodyText: "Please settle invoice INV-8891 for USD 4,200 by next Monday.",
    bodyHtml: null,
    bodyZh: "请在下周一前支付账单 INV-8891，金额 4200 美元。",
    priority: "NORMAL",
    tagsJson: JSON.stringify(["账单", "付款"]),
    attachments: [],
  }),
  em4: detail("em4", {
    id: "em4",
    supplierId: null,
    direction: "RECEIVED",
    subject: "DHL shipment notification — ETA tomorrow",
    summaryCn: "物流通知：快件预计明日送达，单号可查。",
    receivedAt: iso(now - 8000_000),
    isRead: true,
    hasAttachments: false,
    openTodoCount: 0,
    aiBucket: "logistics",
    fromAddress: "noreply@dhl.example.com",
    toAddress: "you@company.com",
    bodyText: "Your shipment is out for delivery. Track with 9988776655.",
    bodyHtml: null,
    bodyZh: "您的快件正在派送，单号 9988776655 可追踪。",
    priority: "LOW",
    tagsJson: JSON.stringify(["物流"]),
  }),
  em5: detail("em5", {
    id: "em5",
    supplierId: "mock-sup-east",
    direction: "RECEIVED",
    subject: "Trade show invitation — April",
    summaryCn: "展会邀请，展位 B12，可提供免费门票登记链接。",
    receivedAt: iso(now - 3 * 3600_000),
    isRead: false,
    hasAttachments: false,
    openTodoCount: 0,
    aiBucket: null,
    fromAddress: "marketing@eastlink.example.com",
    toAddress: "you@company.com",
    bodyText: "We would like to invite you to visit our booth B12 in April.",
    bodyHtml: null,
    bodyZh: "诚邀您四月莅临我司展位 B12。",
    priority: "LOW",
    tagsJson: JSON.stringify(["展会"]),
  }),
};

export const MOCK_MAIL_LIST: MailListItem[] = Object.values(MOCK_MAIL_DETAILS).map(
  (d) => ({
    id: d.id,
    supplierId: d.supplierId,
    direction: d.direction,
    subject: d.subject,
    summaryCn: d.summaryCn,
    receivedAt: d.receivedAt,
    isRead: d.isRead,
    isStarred: false,
    hasAttachments: d.hasAttachments,
    openTodoCount: d.openTodoCount,
    aiBucket: d.aiBucket,
  })
);

export const MOCK_TODOS: TodoRow[] = [
  {
    id: "todo-m1",
    content: "确认 Acme 最新报价 MOQ",
    priority: "URGENT",
    isCompleted: false,
    dueDate: null,
    createdAt: iso(now - 3600_000),
    completedAt: null,
    supplierId: "mock-sup-acme",
    supplierName: "Acme Trading Co.",
    emailSubject: "Re: Updated FOB quote for SKU-2024",
    emailId: "em1",
  },
  {
    id: "todo-m2",
    content: "核对物流伙伴账单 INV-8891",
    priority: "NORMAL",
    isCompleted: false,
    dueDate: iso(now + 86400_000 * 3),
    createdAt: iso(now - 5000_000),
    completedAt: null,
    supplierId: null,
    supplierName: null,
    emailSubject: "Invoice #INV-8891 — payment reminder",
    emailId: "em3",
  },
  {
    id: "todo-m3",
    content: "已归档：回复 EastLink 展会邮件",
    priority: "LOW",
    isCompleted: true,
    dueDate: null,
    createdAt: iso(now - 86400_000 * 5),
    completedAt: iso(now - 86400_000 * 2),
    supplierId: "mock-sup-east",
    supplierName: "EastLink Components",
    emailSubject: "Trade show invitation — April",
    emailId: "em5",
  },
];

export function mockStats() {
  const unread = MOCK_MAIL_LIST.filter(
    (e) => e.direction === "RECEIVED" && !e.isRead
  ).length;
  const openTodos = MOCK_TODOS.filter((t) => !t.isCompleted).length;
  return { unread, openTodos };
}
