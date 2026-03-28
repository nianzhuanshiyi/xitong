import { claudeJson, claudeMessages } from "@/lib/claude-client";

export type MailSummaryJson = {
  summary: string;
  /** 邮件正文的完整中文翻译（可较长） */
  body_zh: string;
  action_items: string[];
  priority: "urgent" | "normal" | "low";
  tags: string[];
};

export async function claudeSummarizeEmail(englishBody: string): Promise<MailSummaryJson | null> {
  if (!englishBody.trim()) return null;
  const system = `你是跨境电商供应商管理助手。根据以下英文邮件，输出 JSON（不要其他任何内容，不要 markdown）：
{"summary":"中文精华摘要，100字以内，保留关键数字日期价格","body_zh":"将邮件正文完整翻译成流畅中文（保留段落换行），不要省略","action_items":["待办1","待办2"],"priority":"urgent或normal或low","tags":["报价","样品"]}
若无待办则 action_items 为空数组。tags 用简短中文标签。body_zh 必须覆盖正文主要信息。`;

  return claudeJson<MailSummaryJson>({
    system,
    user: englishBody.slice(0, 12_000),
  });
}

/** 用户中文大意 → 专业英文商务邮件（润色撰写，非直译） */
export async function claudePolishZhToBusinessEn(draftZh: string): Promise<string | null> {
  if (!draftZh.trim()) return null;
  const system = `你是专业的跨境电商商务邮件撰写专家。用户会用中文写一个邮件大意，请你：

理解用户想表达的核心意思
写成专业、礼貌的英文商务邮件
语气友好但专业，不要过于正式也不要太随意
保留所有具体数字、日期、金额
如果涉及谈判（价格、交期），措辞要得体圆滑
邮件结尾用合适的签名收尾
只输出英文邮件正文，不要解释`;

  return claudeMessages({
    system,
    user: draftZh.slice(0, 8000),
    maxTokens: 4096,
  });
}

export async function claudeTranslateZhToEnForMail(chinese: string): Promise<string | null> {
  const system = `你是专业商务邮件翻译专家。将以下中文翻译为英文商务邮件，语气专业礼貌，保留数字日期金额，使用跨境电商常用表达。只输出英文，不要其他内容。`;
  const raw = await claudeMessages({
    system,
    user: chinese.slice(0, 8000),
    maxTokens: 4096,
  });
  return raw?.trim() ?? null;
}

export async function claudeTranslateFree(text: string, hint?: string): Promise<string | null> {
  const system = `你是翻译助手。自动检测输入语言，翻译成另一种语言（中英互译为主）。只输出译文，不要解释。`;
  const user = hint ? `${hint}\n\n${text}` : text;
  const raw = await claudeMessages({
    system,
    user: user.slice(0, 8000),
    maxTokens: 4096,
  });
  return raw?.trim() ?? null;
}

export async function claudeProcurementAdvice(context: string): Promise<string | null> {
  const system = `你是资深亚马逊卖家顾问。基于供应商报价和市场数据分析输出结构化建议，使用中文：
1. 利润空间
2. 市场竞争可行性
3. 建议售价
4. 风险提示
5. 是否建议采购（明确结论）`;
  return claudeMessages({
    system,
    user: context.slice(0, 12_000),
    maxTokens: 4096,
  });
}
