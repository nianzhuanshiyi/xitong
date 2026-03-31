import { prisma } from "@/lib/prisma";

/** 环境变量优先于数据库（便于生产用托管密钥） */
export async function getClaudeApiKey(): Promise<string | null> {
  const env = process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API_KEY?.trim();
  if (env) {
    console.info("[getClaudeApiKey] 使用环境变量", process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : "CLAUDE_API_KEY");
    return env;
  }
  console.info("[getClaudeApiKey] 环境变量 ANTHROPIC_API_KEY/CLAUDE_API_KEY 均未设置，尝试数据库回退...");
  try {
    const row = await prisma.integrationSecret.findUnique({
      where: { id: "default" },
    });
    const dbKey = row?.claudeApiKey?.trim() || null;
    if (dbKey) {
      console.info("[getClaudeApiKey] 使用数据库中的 claudeApiKey");
    } else {
      console.warn("[getClaudeApiKey] ⚠ 数据库中也未找到 claudeApiKey");
    }
    return dbKey;
  } catch (e) {
    console.error("[getClaudeApiKey] ❌ 查询数据库失败:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function getSellerspriteSecret(): Promise<string | null> {
  const env = process.env.SELLERSPRITE_SECRET_KEY?.trim();
  if (env) return env;
  const row = await prisma.integrationSecret.findUnique({
    where: { id: "default" },
  });
  return row?.sellerspriteSecret?.trim() || null;
}

/** 默认与官方文档一致：https://open.sellersprite.com/mcp/16 */
export function getSellerspriteMcpUrl(): string {
  return (
    process.env.SELLERSPRITE_MCP_URL?.trim() ||
    "https://mcp.sellersprite.com/mcp"
  );
}

/** Google AI Studio / Gemini API（Imagen 图片生成），仅从环境变量读取 */
export function getGoogleAiApiKey(): string | null {
  const k =
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  return k || null;
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim();
  if (v.length <= 12) return "•".repeat(Math.min(v.length, 8)) + "…";
  return `${v.slice(0, 10)}…${v.slice(-4)}`;
}
