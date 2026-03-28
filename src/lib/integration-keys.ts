import { prisma } from "@/lib/prisma";

/** 环境变量优先于数据库（便于生产用托管密钥） */
export async function getClaudeApiKey(): Promise<string | null> {
  const env = process.env.CLAUDE_API_KEY?.trim();
  if (env) return env;
  const row = await prisma.integrationSecret.findUnique({
    where: { id: "default" },
  });
  return row?.claudeApiKey?.trim() || null;
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

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  const v = value.trim();
  if (v.length <= 12) return "•".repeat(Math.min(v.length, 8)) + "…";
  return `${v.slice(0, 10)}…${v.slice(-4)}`;
}
