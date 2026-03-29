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

  // Auto-sync via internal API call (avoids bundling Node.js-only IMAP modules)
  if (process.env.DISABLE_AUTO_SYNC === "1") return;

  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  let running = false;

  async function tick() {
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
  }

  setTimeout(() => {
    console.info(`[auto-sync] 启动定时同步, 间隔 ${SYNC_INTERVAL_MS / 1000}s`);
    void tick();
    setInterval(() => void tick(), SYNC_INTERVAL_MS);
  }, 30_000);

  // ── Beauty auto-scan: daily at 9 AM Beijing time (UTC+8 = 01:00 UTC) ──
  if (process.env.DISABLE_BEAUTY_SCAN !== "1") {
    let beautyScanRunning = false;

    const msUntilNextBeautyScan = () => {
      const now = new Date();
      // Target: 09:00 Beijing time = 01:00 UTC
      const target = new Date(now);
      target.setUTCHours(1, 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
      return target.getTime() - now.getTime();
    };

    const beautyScanTick = async () => {
      if (beautyScanRunning) return;
      beautyScanRunning = true;
      try {
        const r = await fetch(`${baseUrl}/api/beauty-ideas/top-pick`, {
          method: "POST",
          headers: {
            "x-auto-sync-secret":
              process.env.AUTO_SYNC_SECRET || "__internal__",
          },
        });
        if (r.ok) {
          const j = await r.json();
          if (!j.skipped) {
            console.info(
              `[beauty-auto-scan] 完成: ${j.report?.productName ?? "unknown"}`
            );
          }
        }
      } catch (e) {
        console.error(
          "[beauty-auto-scan] 请求失败:",
          e instanceof Error ? e.message : e
        );
      } finally {
        beautyScanRunning = false;
      }
    };

    // Schedule first run, then repeat every 24h
    const delay = msUntilNextBeautyScan();
    console.info(
      `[beauty-auto-scan] 下次扫描: ${new Date(Date.now() + delay).toISOString()} (${Math.round(delay / 3600_000)}h后)`
    );
    setTimeout(() => {
      void beautyScanTick();
      setInterval(() => void beautyScanTick(), 24 * 60 * 60 * 1000);
    }, delay);
  }
}
