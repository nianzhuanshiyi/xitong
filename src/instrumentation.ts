const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let autoSyncRunning = false;

async function autoSyncAllAccounts() {
  if (autoSyncRunning) return;
  autoSyncRunning = true;
  try {
    const { runImapSync } = await import("@/lib/mail/imap-sync");
    const result = await runImapSync();
    if (result.imported > 0 || result.analyzed > 0) {
      console.info(
        `[auto-sync] 完成: 导入 ${result.imported} 封, AI分析 ${result.analyzed} 封`
      );
    }
    if (result.error) {
      console.warn(`[auto-sync] 部分失败: ${result.error}`);
    }
  } catch (e) {
    console.error("[auto-sync] 同步异常:", e);
  } finally {
    autoSyncRunning = false;
  }
}

export async function register() {
  // Seed check
  if (process.env.SKIP_BOOTSTRAP_SEED !== "1") {
    const { ensureSeedOnEmptyDb } = await import("@/lib/seed-check");
    try {
      const ran = await ensureSeedOnEmptyDb();
      if (ran) console.info("[seed-check] 已初始化默认账户与预置数据");
    } catch (e) {
      console.error("[seed-check] 初始化失败", e);
    }
  }

  // Auto-sync: disabled with DISABLE_AUTO_SYNC=1
  if (process.env.DISABLE_AUTO_SYNC === "1") return;

  // Delay first sync 30s after startup to let the server settle
  setTimeout(() => {
    console.info(`[auto-sync] 启动定时同步, 间隔 ${SYNC_INTERVAL_MS / 1000}s`);
    void autoSyncAllAccounts();
    setInterval(() => void autoSyncAllAccounts(), SYNC_INTERVAL_MS);
  }, 30_000);
}
