export type ConversationMemory = {
  userGoals: string[];
  establishedFacts: string[];
  constraints: string[];
  uploadedArtifacts: string[];
  resolvedItems: string[];
  pendingItems: string[];
  workingDecisions: string[];
};

export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  fileName?: string | null;
  createdAt?: Date;
};

const MEMORY_KEYS: Array<keyof ConversationMemory> = [
  "userGoals",
  "establishedFacts",
  "constraints",
  "uploadedArtifacts",
  "resolvedItems",
  "pendingItems",
  "workingDecisions",
];

function uniqueTrimmedStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

export function normalizeConversationMemory(
  input?: Partial<ConversationMemory> | null,
): ConversationMemory | null {
  const normalized: ConversationMemory = {
    userGoals: uniqueTrimmedStrings(input?.userGoals),
    establishedFacts: uniqueTrimmedStrings(input?.establishedFacts),
    constraints: uniqueTrimmedStrings(input?.constraints),
    uploadedArtifacts: uniqueTrimmedStrings(input?.uploadedArtifacts),
    resolvedItems: uniqueTrimmedStrings(input?.resolvedItems),
    pendingItems: uniqueTrimmedStrings(input?.pendingItems),
    workingDecisions: uniqueTrimmedStrings(input?.workingDecisions),
  };

  return MEMORY_KEYS.some((key) => normalized[key].length > 0)
    ? normalized
    : null;
}

export function parseConversationMemory(raw?: string | null): ConversationMemory | null {
  if (!raw?.trim()) return null;
  try {
    return normalizeConversationMemory(JSON.parse(raw) as Partial<ConversationMemory>);
  } catch {
    return null;
  }
}

export function serializeConversationMemory(
  memory?: ConversationMemory | null,
): string | null {
  const normalized = normalizeConversationMemory(memory);
  return normalized ? JSON.stringify(normalized) : null;
}

export function formatConversationMemory(memory?: ConversationMemory | null): string {
  const normalized = normalizeConversationMemory(memory);
  if (!normalized) return "";

  const sections: Array<[string, string[]]> = [
    ["用户目标", normalized.userGoals],
    ["已确认事实", normalized.establishedFacts],
    ["约束条件", normalized.constraints],
    ["上传材料", normalized.uploadedArtifacts],
    ["已解决事项", normalized.resolvedItems],
    ["待处理事项", normalized.pendingItems],
    ["工作决策", normalized.workingDecisions],
  ];

  return sections
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`)
    .join("\n\n");
}

export function estimateTextTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;

  const cjkChars = (normalized.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinChars = normalized.length - cjkChars;

  return cjkChars + Math.ceil(latinChars / 4) + 8;
}

export function estimateMessageTokens(message: StoredChatMessage): number {
  const fileLabel = message.fileName ? `[附件: ${message.fileName}]\n` : "";
  return 10 + estimateTextTokens(`${fileLabel}${message.content}`);
}

export function estimateAttachmentTokens(params: {
  fileType?: string;
  fileContent?: string;
  fileBase64?: string;
}): number {
  const { fileType, fileContent, fileBase64 } = params;

  if (fileContent?.trim()) {
    return estimateTextTokens(fileContent) + 80;
  }

  if (fileType?.startsWith("image/") && fileBase64) {
    return 1800 + Math.min(2200, Math.ceil(fileBase64.length / 4000));
  }

  if (fileType === "application/pdf" && fileBase64) {
    return 3200 + Math.min(5000, Math.ceil(fileBase64.length / 2500));
  }

  return 0;
}

export function getContextTokenBudget(model: string): number {
  if (model.includes("opus")) return 28000;
  return 22000;
}

export function buildDynamicWindow(params: {
  messages: StoredChatMessage[];
  budgetTokens: number;
  systemTokens?: number;
  latestAttachmentTokens?: number;
}): StoredChatMessage[] {
  const { messages, budgetTokens, systemTokens = 0, latestAttachmentTokens = 0 } = params;

  if (messages.length === 0) return [];

  const selected: StoredChatMessage[] = [];
  let usedTokens = systemTokens + latestAttachmentTokens;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const estimated = estimateMessageTokens(message);

    if (selected.length > 0 && usedTokens + estimated > budgetTokens) {
      break;
    }

    selected.unshift(message);
    usedTokens += estimated;
  }

  while (selected.length > 0 && selected[0]?.role !== "user") {
    selected.shift();
  }

  while (selected.length > 0 && selected[selected.length - 1]?.role !== "user") {
    selected.pop();
  }

  return selected;
}
