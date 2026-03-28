import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getClaudeApiKey,
  getSellerspriteMcpUrl,
  getSellerspriteSecret,
  maskSecret,
} from "@/lib/integration-keys";
import { requireAdminSession } from "@/lib/require-admin";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const claude = await getClaudeApiKey();
  const ss = await getSellerspriteSecret();
  const mcpUrl = getSellerspriteMcpUrl();

  return NextResponse.json({
    mcpUrl: mcpUrl,
    claudeFromEnv: Boolean(process.env.CLAUDE_API_KEY?.trim()),
    sellerspriteSecretFromEnv: Boolean(process.env.SELLERSPRITE_SECRET_KEY?.trim()),
    claudeKeyPreview: maskSecret(claude),
    sellerspriteSecretPreview: maskSecret(ss),
    claudeConfigured: Boolean(claude),
    sellerspriteSecretConfigured: Boolean(ss),
  });
}

const postSchema = z.object({
  claudeApiKey: z.union([z.string(), z.null()]).optional(),
  sellerspriteSecret: z.union([z.string(), z.null()]).optional(),
});

function normalizeSecretInput(
  v: string | null | undefined
): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function POST(req: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "参数错误" }, { status: 400 });
  }

  const claudeNorm = normalizeSecretInput(parsed.data.claudeApiKey ?? undefined);
  const ssNorm = normalizeSecretInput(
    parsed.data.sellerspriteSecret ?? undefined
  );

  if (claudeNorm === undefined && ssNorm === undefined) {
    return NextResponse.json({ message: "请至少提交一个要更新的字段" }, { status: 400 });
  }

  const update: {
    claudeApiKey?: string | null;
    sellerspriteSecret?: string | null;
  } = {};
  if (claudeNorm !== undefined) update.claudeApiKey = claudeNorm;
  if (ssNorm !== undefined) update.sellerspriteSecret = ssNorm;

  await prisma.integrationSecret.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      claudeApiKey: claudeNorm === undefined ? null : claudeNorm,
      sellerspriteSecret: ssNorm === undefined ? null : ssNorm,
    },
    update,
  });

  const claude = await getClaudeApiKey();
  const ss = await getSellerspriteSecret();

  return NextResponse.json({
    ok: true,
    mcpUrl: getSellerspriteMcpUrl(),
    claudeKeyPreview: maskSecret(claude),
    sellerspriteSecretPreview: maskSecret(ss),
    claudeConfigured: Boolean(claude),
    sellerspriteSecretConfigured: Boolean(ss),
    claudeFromEnv: Boolean(process.env.CLAUDE_API_KEY?.trim()),
    sellerspriteSecretFromEnv: Boolean(process.env.SELLERSPRITE_SECRET_KEY?.trim()),
  });
}
