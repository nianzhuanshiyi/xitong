import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

async function migrate() {
  console.log("Starting AI image migration (Base64 -> Local File)...");
  
  const images = await prisma.generatedImage.findMany({
    where: {
      filePath: "",
      AND: [
        { imageData: { not: null } },
        { imageData: { not: "" } }
      ]
    }
  });

  console.log(`Found ${images.length} images to migrate.`);

  for (const img of images) {
    try {
      const projectId = img.projectId;
      const relativeDir = path.join("uploads", "ai-images", projectId, "gen");
      const fullDir = path.join(process.cwd(), "public", relativeDir);
      
      await fs.mkdir(fullDir, { recursive: true });
      
      const fileName = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;
      const fullPath = path.join(fullDir, fileName);
      
      // Remove data:image/png;base64, prefix if exists
      const base64Data = img.imageData!.replace(/^data:image\/\w+;base64,/, "");
      
      await fs.writeFile(fullPath, Buffer.from(base64Data, "base64"));
      
      const filePath = path.join(relativeDir, fileName).replace(/\\/g, "/");
      
      await prisma.generatedImage.update({
        where: { id: img.id },
        data: { filePath }
      });
      
      console.log(`Migrated image ${img.id} to ${filePath}`);
    } catch (err) {
      console.error(`Failed to migrate image ${img.id}:`, err);
    }
  }

  console.log("Migration finished.");
}

migrate()
  .catch(err => {
    console.error("Migration script failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
