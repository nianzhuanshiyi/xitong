import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  regenerateAplus,
  regenerateDescription,
  regenerateSearchTerms,
  regenerateSingleBullet,
  regenerateTitles,
} from "@/lib/listing/generate";
import type {
  ListingGenerateFlags,
  ListingInputPayload,
} from "@/lib/listing/types";
import { DEFAULT_GENERATE_FLAGS } from "@/lib/listing/types";

export const dynamic = "force-dynamic";

export const maxDuration = 120;

const inputSchema = z.object({
  marketplace: z.enum(["US", "CA", "UK", "DE", "JP", "AU"]),
  category: z.string().min(1).max(200),
  productName: z.string().min(1).max(500),
  brandName: z.string().min(1).max(200),
  sellingPoints: z.string().max(20_000).optional().default(""),
  specs: z.string().max(20_000).optional().default(""),
  targetAudience: z.string().max(500).optional().default(""),
  useCases: z.string().max(500).optional().default(""),
  style: z
    .enum(["professional", "friendly", "luxury", "concise"])
    .optional()
    .default("professional"),
  coreKeywords: z.string().max(10_000).optional().default(""),
  bannedWords: z.string().max(5000).optional().default(""),
  extraNotes: z.string().max(10_000).optional().default(""),
});

const flagsPartial = z
  .object({
    title: z.boolean().optional(),
    bullets: z.boolean().optional(),
    description: z.boolean().optional(),
    searchTerms: z.boolean().optional(),
    aplus: z.boolean().optional(),
  })
  .optional();

const bodySchema = z.discriminatedUnion("part", [
  z.object({
    part: z.literal("bullet"),
    input: inputSchema,
    index: z.number().int().min(0).max(4),
    currentBullets: z.array(z.string()).min(5).max(5),
    flags: flagsPartial,
  }),
  z.object({
    part: z.literal("description"),
    input: inputSchema,
    flags: flagsPartial,
  }),
  z.object({
    part: z.literal("searchTerms"),
    input: inputSchema,
    title: z.string().min(1).max(500),
  }),
  z.object({
    part: z.literal("titles"),
    input: inputSchema,
    flags: flagsPartial,
  }),
  z.object({
    part: z.literal("aplus"),
    input: inputSchema,
  }),
]);

function mergeFlags(f?: z.infer<typeof flagsPartial>): ListingGenerateFlags {
  const x = f ?? {};
  return {
    title: x.title ?? DEFAULT_GENERATE_FLAGS.title,
    bullets: x.bullets ?? DEFAULT_GENERATE_FLAGS.bullets,
    description: x.description ?? DEFAULT_GENERATE_FLAGS.description,
    searchTerms: x.searchTerms ?? DEFAULT_GENERATE_FLAGS.searchTerms,
    aplus: x.aplus ?? DEFAULT_GENERATE_FLAGS.aplus,
  };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
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

  const d = parsed.data;

  try {
    if (d.part === "bullet") {
      const input = d.input as ListingInputPayload;
      const bullet = await regenerateSingleBullet({
        input,
        index: d.index,
        currentBullets: d.currentBullets,
        flags: mergeFlags(d.flags),
      });
      return NextResponse.json({ bullet });
    }
    if (d.part === "description") {
      const html = await regenerateDescription({
        input: d.input as ListingInputPayload,
        flags: mergeFlags(d.flags),
      });
      return NextResponse.json({ productDescriptionHtml: html });
    }
    if (d.part === "searchTerms") {
      const st = await regenerateSearchTerms({
        input: d.input as ListingInputPayload,
        title: d.title,
      });
      return NextResponse.json({ searchTerms: st });
    }
    if (d.part === "titles") {
      const titles = await regenerateTitles({
        input: d.input as ListingInputPayload,
        flags: mergeFlags(d.flags),
      });
      return NextResponse.json({ titles });
    }
    const aplus = await regenerateAplus({
      input: d.input as ListingInputPayload,
    });
    return NextResponse.json({ aplus });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "生成失败" },
      { status: 502 }
    );
  }
}
