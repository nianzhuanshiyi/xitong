import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const team = await prisma.team.upsert({
    where: { id: "seed-default-team" },
    update: {},
    create: {
      id: "seed-default-team",
      name: "默认团队",
      description: "洛杉矶总部 / 中国亚马逊运营",
      tokenLimit: 100000,
      tokenUsed: 0,
    },
  });

  const adminHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      password: adminHash,
      role: "ADMIN",
      aiAuthorized: true,
      teamId: team.id,
    },
    create: {
      email: "admin@example.com",
      name: "系统管理员",
      password: adminHash,
      role: "ADMIN",
      aiAuthorized: true,
      teamId: team.id,
    },
  });

  const staffHash = await bcrypt.hash("staff123", 10);
  await prisma.user.upsert({
    where: { email: "staff@example.com" },
    update: {
      password: staffHash,
      teamId: team.id,
    },
    create: {
      email: "staff@example.com",
      name: "运营员工",
      password: staffHash,
      role: "EMPLOYEE",
      aiAuthorized: false,
      teamId: team.id,
    },
  });

  const suppliers = [
    { name: "FormulAB", country: "美国", mainCategories: "美妆" },
    { name: "AMR Labs", country: "美国", mainCategories: "美妆" },
    { name: "Spade Soleil", country: "美国", mainCategories: "美妆" },
    { name: "CTK OTC", country: "美国", mainCategories: "OTC" },
    { name: "Cohere Beauty", country: "美国", mainCategories: "美妆" },
    { name: "Pravada", country: "美国", mainCategories: "美妆" },
    { name: "Luxe Farm", country: "韩国", mainCategories: "美妆" },
    { name: "Ecoment", country: "韩国", mainCategories: "综合" },
    { name: "NFC New Eng", country: "韩国", mainCategories: "综合" },
  ];

  for (const s of suppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { name: s.name },
    });
    if (!existing) {
      await prisma.supplier.create({
        data: {
          name: s.name,
          country: s.country,
          mainCategories: s.mainCategories,
        },
      });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
