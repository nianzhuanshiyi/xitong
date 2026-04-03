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

  // Helper: schedule a daily API call at a fixed UTC hour+minute
  function scheduleDailyTopPick(opts: {
    name: string;
    url: string;
    utcHour: number;
    utcMinute: number;
    envDisableKey: string;
  }) {
    if (process.env[opts.envDisableKey] === "1") return;

    let scanRunning = false;

    const msUntilNext = () => {
      const now = new Date();
      const target = new Date(now);
      target.setUTCHours(opts.utcHour, opts.utcMinute, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
      return target.getTime() - now.getTime();
    };

    const tick = async () => {
      if (scanRunning) return;
      scanRunning = true;
      try {
        const r = await fetch(opts.url, {
          method: "POST",
          headers: {
            "x-auto-sync-secret": process.env.AUTO_SYNC_SECRET || "__internal__",
          },
        });
        if (r.ok) {
          const j = await r.json();
          if (!j.skipped) {
            console.info(`[${opts.name}] 完成: ${j.report?.productName ?? "unknown"}`);
          }
        }
      } catch (e) {
        console.error(`[${opts.name}] 请求失败:`, e instanceof Error ? e.message : e);
      } finally {
        scanRunning = false;
      }
    };

    const delay = msUntilNext();
    console.info(
      `[${opts.name}] 下次扫描: ${new Date(Date.now() + delay).toISOString()} (${Math.round(delay / 3600_000)}h后)`
    );
    setTimeout(() => {
      void tick();
      setInterval(() => void tick(), 24 * 60 * 60 * 1000);
    }, delay);
  }

  // ── Beauty: daily at 09:00 Beijing (01:00 UTC) ──
  scheduleDailyTopPick({
    name: "beauty-auto-scan",
    url: `${baseUrl}/api/beauty-ideas/top-pick`,
    utcHour: 1,
    utcMinute: 0,
    envDisableKey: "DISABLE_BEAUTY_SCAN",
  });

  // ── 3C新品: daily at 09:30 Beijing (01:30 UTC) ──
  scheduleDailyTopPick({
    name: "3c-auto-scan",
    url: `${baseUrl}/api/3c-ideas/top-pick`,
    utcHour: 1,
    utcMinute: 30,
    envDisableKey: "DISABLE_3C_SCAN",
  });

  // ── 欧洲蓝海: daily at 10:00 Beijing (02:00 UTC) ──
  scheduleDailyTopPick({
    name: "europe-auto-scan",
    url: `${baseUrl}/api/europe-ideas/top-pick`,
    utcHour: 2,
    utcMinute: 0,
    envDisableKey: "DISABLE_EUROPE_SCAN",
  });
}
