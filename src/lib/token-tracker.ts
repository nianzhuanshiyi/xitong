import prisma from "@/lib/prisma";

// Cost per 1M tokens in USD
const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-opus-4-0-20250514": { input: 15.0, output: 75.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
};

function getDefaultCost(model: string) {
  if (model.includes("haiku")) return { input: 1.0, output: 5.0 };
  if (model.includes("opus")) return { input: 15.0, output: 75.0 };
  return { input: 3.0, output: 15.0 }; // sonnet default
}

export function calcEstimatedCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = COST_PER_MILLION[model] ?? getDefaultCost(model);
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}

export async function recordTokenUsage(params: {
  userId: string;
  module: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const { userId, module, model, inputTokens, outputTokens } = params;
  const totalTokens = inputTokens + outputTokens;
  const estimatedCost = calcEstimatedCost(model, inputTokens, outputTokens);

  try {
    await prisma.aiTokenUsage.create({
      data: { userId, module, model, inputTokens, outputTokens, totalTokens, estimatedCost },
    });
  } catch (e) {
    // Non-fatal — log but don't break the main flow
    console.error("[recordTokenUsage] Failed to record:", e instanceof Error ? e.message : e);
  }
}

/** Returns the current month's total token usage and whether it's allowed */
export async function checkTokenLimit(userId: string): Promise<{
  allowed: boolean;
  usedTokens: number;
  limitTokens: number;
  usagePercent: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { monthlyTokenLimit: true, role: true },
  });

  const limitTokens = user?.monthlyTokenLimit ?? 500000;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const agg = await prisma.aiTokenUsage.aggregate({
    where: { userId, createdAt: { gte: monthStart } },
    _sum: { totalTokens: true },
  });

  const usedTokens = agg._sum.totalTokens ?? 0;
  const usagePercent = limitTokens > 0 ? Math.round((usedTokens / limitTokens) * 100) : 0;
  const allowed = limitTokens <= 0 || usedTokens < limitTokens;

  return { allowed, usedTokens, limitTokens, usagePercent };
}
