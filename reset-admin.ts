import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function resetPassword() {
  const adminHash = await bcrypt.hash("admin123", 10);
  const user = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      password: adminHash,
      role: "ADMIN",
      aiAuthorized: true,
    },
    create: {
      email: "admin@example.com",
      name: "系统管理员",
      password: adminHash,
      role: "ADMIN",
      aiAuthorized: true,
    },
  });
  console.log("Password reset for:", user.email);
}

resetPassword()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
