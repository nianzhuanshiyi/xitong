import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function checkUser() {
  const user = await prisma.user.findUnique({
    where: { email: "admin@example.com" }
  });
    
  if (user) {
    console.log("User found:", user.email);
    console.log("Hashed password in DB:", user.password);
    
    const isMatch = await bcrypt.compare("admin123", user.password || "");
    console.log("aiAuthorized:", user.aiAuthorized);
    console.log("role:", user.role);
    console.log("teamId:", user.teamId);
    console.log("allowedModules:", user.allowedModules);
  } else {
    console.log("User NOT found");
  }
}

checkUser()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
