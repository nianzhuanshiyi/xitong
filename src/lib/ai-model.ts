import prisma from "@/lib/prisma";

const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-0-20250514",
};

const DEFAULT_MODEL_ID = "claude-sonnet-4-20250514";

/**
 * Get the globally configured AI model ID.
 * Priority: SystemSetting "ai_default_model" > env CLAUDE_ANALYSIS_MODEL > default sonnet
 */
export async function getGlobalAiModel(): Promise<string> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "ai_default_model" },
    });
    if (setting?.value) {
      // Value might be a full model ID or a short name like "haiku"/"sonnet"/"opus"
      if (MODEL_MAP[setting.value]) return MODEL_MAP[setting.value];
      return setting.value;
    }
  } catch {
    // DB not available, fall through
  }

  return process.env.CLAUDE_ANALYSIS_MODEL?.trim() || DEFAULT_MODEL_ID;
}

const DEFAULT_USER_MODEL = "claude-haiku-4-5-20251001";

/**
 * Get the AI model assigned to a specific user.
 * Falls back to the default model if user not found or no model set.
 */
export async function getUserAiModel(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { assignedModel: true },
    });
    if (user?.assignedModel) return user.assignedModel;
  } catch {
    // DB not available, fall through
  }
  return DEFAULT_USER_MODEL;
}

/**
 * Get model short name from SystemSetting (for frontend display).
 * Returns "haiku", "sonnet", or "opus".
 */
export async function getGlobalAiModelShortName(): Promise<string> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "ai_default_model" },
    });
    if (setting?.value) {
      // If stored as short name
      if (MODEL_MAP[setting.value]) return setting.value;
      // If stored as full model ID, reverse lookup
      for (const [short, full] of Object.entries(MODEL_MAP)) {
        if (full === setting.value) return short;
      }
    }
  } catch {
    // fall through
  }
  return "sonnet";
}
