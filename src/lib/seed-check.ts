import prisma from "@/lib/prisma";
import { runSeedData } from "@/lib/seed-data";

/**
 * 空库时写入默认管理员（admin@example.com / admin123）、员工与预置供应商等。
 * 幂等：已有用户时立即返回。
 */
export async function ensureSeedOnEmptyDb(): Promise<boolean> {
  const count = await prisma.user.count();
  if (count > 0) return false;
  await runSeedData(prisma);
  return true;
}
