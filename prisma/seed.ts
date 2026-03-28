import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  EMPTY_FILTERS_PLACEHOLDER,
  US_BEAUTY_DEFAULT_FILTERS,
} from "../src/lib/smart-selection-filters";

const prisma = new PrismaClient();

const seedSuppliers = [
  {
    name: "FormulAB",
    nameEn: "FormulAB",
    country: "美国",
    countryCode: "US" as const,
    website: "https://formulab.com/",
    mainCategories: "美妆,美妆配方研发",
    status: "COOPERATING" as const,
  },
  {
    name: "AMR Labs",
    nameEn: "AMR Labs",
    country: "美国",
    countryCode: "US" as const,
    website: "https://amrlabs.com/",
    mainCategories: "美妆,生产",
    status: "COOPERATING" as const,
  },
  {
    name: "Spade Soleil",
    nameEn: "Spade Soleil",
    country: "美国",
    countryCode: "US" as const,
    website: "https://spadesoleil.com/",
    mainCategories: "美妆,品牌",
    status: "EVALUATING" as const,
  },
  {
    name: "CTK OTC",
    nameEn: "CTK OTC",
    country: "美国",
    countryCode: "US" as const,
    website: "https://www.ctkotc.com/",
    mainCategories: "OTC,美妆",
    status: "COOPERATING" as const,
  },
  {
    name: "Cohere Beauty",
    nameEn: "Cohere Beauty",
    country: "美国",
    countryCode: "US" as const,
    website: "https://coherebeauty.com/",
    mainCategories: "美妆",
    status: "CANDIDATE" as const,
  },
  {
    name: "Pravada",
    nameEn: "Pravada",
    country: "美国",
    countryCode: "US" as const,
    website: "http://pravada.com/",
    mainCategories: "美妆",
    status: "EVALUATING" as const,
  },
  {
    name: "Luxe Farm",
    nameEn: "Luxe Farm",
    country: "韩国",
    countryCode: "KR" as const,
    website: "http://luxe-farm.com/",
    mainCategories: "美妆,原料",
    status: "COOPERATING" as const,
  },
  {
    name: "Ecoment",
    nameEn: "Ecoment",
    country: "韩国",
    countryCode: "KR" as const,
    website: "https://ecoment.co.kr/en/",
    mainCategories: "美妆",
    status: "COOPERATING" as const,
  },
  {
    name: "NFC New Eng",
    nameEn: "NFC New Eng",
    country: "韩国",
    countryCode: "KR" as const,
    website: "http://nfcneweng.sendpage.co.kr/",
    mainCategories: "美妆,综合",
    status: "EVALUATING" as const,
  },
];

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

  const fav = (url: string) =>
    `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;

  for (const s of seedSuppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { name: s.name },
    });
    const logoUrl = fav(s.website);
    if (existing) {
      await prisma.supplier.update({
        where: { id: existing.id },
        data: {
          nameEn: s.nameEn,
          country: s.country,
          countryCode: s.countryCode,
          website: s.website,
          mainCategories: s.mainCategories,
          status: s.status,
          logoUrl,
          lastActivityAt: new Date(),
        },
      });
    } else {
      await prisma.supplier.create({
        data: {
          name: s.name,
          nameEn: s.nameEn,
          country: s.country,
          countryCode: s.countryCode,
          website: s.website,
          mainCategories: s.mainCategories,
          status: s.status,
          logoUrl,
          lastActivityAt: new Date(),
        },
      });
    }
  }

  await prisma.smartSelectionPlan.upsert({
    where: { slug: "us-beauty" },
    create: {
      name: "美国美妆智能选品",
      slug: "us-beauty",
      marketplace: "US",
      category: "Beauty & Personal Care",
      filtersJson: JSON.stringify(US_BEAUTY_DEFAULT_FILTERS),
      active: true,
    },
    update: {
      name: "美国美妆智能选品",
      marketplace: "US",
      category: "Beauty & Personal Care",
      active: true,
    },
  });

  await prisma.smartSelectionPlan.upsert({
    where: { slug: "au" },
    create: {
      name: "澳洲选品",
      slug: "au",
      marketplace: "AU",
      category: null,
      filtersJson: JSON.stringify(EMPTY_FILTERS_PLACEHOLDER),
      active: false,
    },
    update: { active: false },
  });

  await prisma.smartSelectionPlan.upsert({
    where: { slug: "eu" },
    create: {
      name: "欧洲选品",
      slug: "eu",
      marketplace: "EU",
      category: null,
      filtersJson: JSON.stringify(EMPTY_FILTERS_PLACEHOLDER),
      active: false,
    },
    update: { active: false },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
