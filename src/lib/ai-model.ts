import prisma from "@/lib/prisma";

const MODEL_MAP: Record<string, string> = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
};

const DEFAULT_MODEL_ID = "claude-sonnet-4-20250514";
const DEFAULT_ADMIN_MODEL = "claude-opus-4-20250514";
const DEFAULT_EMPLOYEE_MODEL = "claude-sonnet-4-20250514";

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
      // Value might be a full model ID or a short name like "sonnet"/"opus"
      if (MODEL_MAP[setting.value]) return MODEL_MAP[setting.value];
      return setting.value;
    }
  } catch {
    // DB not available, fall through
  }

  return process.env.CLAUDE_ANALYSIS_MODEL?.trim() || DEFAULT_MODEL_ID;
}

/**
 * Get the AI model assigned to a specific user.
 * Falls back to role-based defaults: ADMIN → Opus, EMPLOYEE → Sonnet.
 */
export async function getUserAiModel(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { assignedModel: true, role: true },
    });
    if (user?.assignedModel) return user.assignedModel;
    // Role-based default
    return user?.role === "ADMIN" ? DEFAULT_ADMIN_MODEL : DEFAULT_EMPLOYEE_MODEL;
  } catch {
    // DB not available, fall through
  }
  return DEFAULT_EMPLOYEE_MODEL;
}

/**
 * Get model short name from SystemSetting (for frontend display).
 * Returns "sonnet" or "opus".
 */
export async function getGlobalAiModelShortName(): Promise<string> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "ai_default_model" },
    });
    if (setting?.value) {
      if (MODEL_MAP[setting.value]) return setting.value;
      for (const [short, full] of Object.entries(MODEL_MAP)) {
        if (full === setting.value) return short;
      }
    }
  } catch {
    // fall through
  }
  return "sonnet";
}
