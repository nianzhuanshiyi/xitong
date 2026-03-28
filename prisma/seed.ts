import { PrismaClient } from "@prisma/client";
import { runSeedData } from "../src/lib/seed-data";

const prisma = new PrismaClient();

runSeedData(prisma)
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
