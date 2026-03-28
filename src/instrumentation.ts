export async function register() {
  if (process.env.SKIP_BOOTSTRAP_SEED === "1") return;
  const { ensureSeedOnEmptyDb } = await import("@/lib/seed-check");
  try {
    const ran = await ensureSeedOnEmptyDb();
    if (ran) console.info("[seed-check] 已初始化默认账户与预置数据");
  } catch (e) {
    console.error("[seed-check] 初始化失败", e);
  }
}
