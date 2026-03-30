import { requireModuleAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { generateListingFull } from "@/lib/listing/generate";
import type {
  ListingGenerateFlags,
  ListingInputPayload,
} from "@/lib/listing/types";
import { DEFAULT_GENERATE_FLAGS } from "@/lib/listing/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const flagsSchema = z.object({
  title: z.boolean().optional(),
  bullets: z.boolean().optional(),
  description: z.boolean().optional(),
  searchTerms: z.boolean().optional(),
  aplus: z.boolean().optional(),
});

const inputSchema = z.object({
  marketplace: z.enum(["US", "CA", "UK", "DE", "JP", "AU"]),
  category: z.string().min(1).max(200),
  productName: z.string().min(1).max(500),
  brandName: z.string().min(1).max(200),
  sellingPoints: z.string().max(20_000).optional().default(""),
  specs: z.string().max(20_000).optional().default(""),
  targetAudience: z.string().max(500).optional().default(""),
  useCases: z.string().max(500).optional().default(""),
  competitorAsins: z.string().max(500).optional().default(""),
  style: z
    .enum(["professional", "friendly", "luxury", "concise"])
    .optional()
    .default("professional"),
  coreKeywords: z.string().max(10_000).optional().default(""),
  bannedWords: z.string().max(5000).optional().default(""),
  extraNotes: z.string().max(10_000).optional().default(""),
  competitorContext: z.string().max(100_000).optional().nullable(),
});

const bodySchema = z.object({
  input: inputSchema,
  flags: flagsSchema.optional(),
  draftId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("listing");
  if (error) return error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response(JSON.stringify({ message: "无效的 JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        message: "参数错误",
        issues: parsed.error.flatten(),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const f = parsed.data.flags ?? {};
  const flags: ListingGenerateFlags = {
    title: f.title ?? DEFAULT_GENERATE_FLAGS.title,
    bullets: f.bullets ?? DEFAULT_GENERATE_FLAGS.bullets,
    description: f.description ?? DEFAULT_GENERATE_FLAGS.description,
    searchTerms: f.searchTerms ?? DEFAULT_GENERATE_FLAGS.searchTerms,
    aplus: f.aplus ?? DEFAULT_GENERATE_FLAGS.aplus,
  };

  const input: ListingInputPayload = {
    ...parsed.data.input,
    competitorContext: parsed.data.input.competitorContext ?? null,
  };

  const encoder = new TextEncoder();
  const userId = session!.user.id;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        const listing = await generateListingFull(
          input,
          flags,
          (delta) => send({ type: "delta", text: delta })
        );

        const inputJson = JSON.stringify({
          ...input,
          generateFlags: flags,
        });
        const resultJson = JSON.stringify(listing);

        let draftId = parsed.data.draftId ?? null;
        if (draftId) {
          const own = await prisma.listingDraft.findFirst({
            where: { id: draftId, userId },
          });
          if (own) {
            await prisma.listingDraft.update({
              where: { id: draftId },
              data: {
                marketplace: input.marketplace,
                category: input.category,
                productName: input.productName,
                brandName: input.brandName,
                inputJson,
                resultJson,
                status: "COMPLETED",
              },
            });
          } else {
            draftId = null;
          }
        }
        if (!draftId) {
          const row = await prisma.listingDraft.create({
            data: {
              userId,
              marketplace: input.marketplace,
              category: input.category,
              productName: input.productName,
              brandName: input.brandName,
              inputJson,
              resultJson,
              status: "COMPLETED",
            },
          });
          draftId = row.id;
        }

        send({ type: "complete", listing, draftId });
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
