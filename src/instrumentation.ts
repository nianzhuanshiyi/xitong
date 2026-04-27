export async function register() {
  // Only run on Node.js runtime, not edge
  if (process.env.NEXT_RUNTIME === "edge") return;

  // Seed check
  if (process.env.SKIP_BOOTSTRAP_SEED !== "1") {
    try {
      const { ensureSeedOnEmptyDb } = await import("@/lib/seed-check");
      const ran = await ensureSeedOnEmptyDb();
      if (ran) console.info("[seed-check] 已初始化默认账户与预置数据");
    } catch (e) {
      console.error("[seed-check] 初始化失败", e);
    }
  }

  // 邮件自动同步：通过环境变量 ENABLE_AUTO_SYNC=1 开启
  if (process.env.ENABLE_AUTO_SYNC === "1") {
    const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const r = await fetch(`${baseUrl}/api/mail/auto-sync`, {
          method: "POST",
          headers: {
            "x-auto-sync-secret": process.env.AUTO_SYNC_SECRET || "__internal__",
          },
        });
        if (r.ok) {
          const j = await r.json();
          if (j.imported > 0 || j.analyzed > 0) {
            console.info(
              `[auto-sync] 完成: 导入 ${j.imported} 封, AI分析 ${j.analyzed} 封`
            );
          }
        }
      } catch (e) {
        console.error("[auto-sync] 请求失败:", e instanceof Error ? e.message : e);
      } finally {
        running = false;
      }
    };

    setTimeout(() => {
      console.info(`[auto-sync] 启动定时同步, 间隔 ${SYNC_INTERVAL_MS / 1000}s`);
      void tick();
      setInterval(() => void tick(), SYNC_INTERVAL_MS);
    }, 30_000);
  }
}
