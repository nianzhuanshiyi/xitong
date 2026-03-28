import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDashboardSession } from "@/lib/supplier-auth";
import { generateFormZ } from "@/lib/ai-images/api-schemas";
import { generateImagePromptWithClaude } from "@/lib/ai-images/claude-image-prompt";
import { loadReferencesForClaude } from "@/lib/ai-images/refs";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  projectId: z.string(),
  form: generateFormZ,
});

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "无效的 JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "参数错误", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const project = await prisma.imageProject.findFirst({
    where: { id: parsed.data.projectId, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  }

  const refs = await loadReferencesForClaude(project.referencePathsJson);
  const form = parsed.data.form;
  const result = await generateImagePromptWithClaude({
    form,
    project: {
      name: project.name,
      category: project.category,
      description: project.description,
    },
    referenceImages: refs.length ? refs : undefined,
  });

  if (!result) {
    return NextResponse.json(
      {
        message: "Claude 未返回有效内容或未配置 API 密钥",
        degraded: true,
      },
      { status: 503 }
    );
  }

  return NextResponse.json(result);
}
