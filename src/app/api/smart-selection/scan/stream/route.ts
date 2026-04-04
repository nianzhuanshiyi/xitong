import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/permissions";
import { createSellerspriteMcpClient } from "@/lib/sellersprite-mcp";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  planId: z.string().min(1),
});

type ScanFilters = {
  marketplace: string;
  subcategories: Array<{ nodeIdPath: string; label: string }>;
  newProductMonths: number;
  minPrice: number;
  maxPrice: number;
  minMonthlyRevenue: number;
  maxReviews: number;
  minRating: number;
};

function parseScanFilters(raw: string, planMarketplace: string): ScanFilters {
  const defaults: ScanFilters = {
    marketplace: planMarketplace || "US",
    subcategories: [],
    newProductMonths: 6,
    minPrice: 20,
    maxPrice: 200,
    minMonthlyRevenue: 10000,
    maxReviews: 500,
    minRating: 3.0,
  };
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    // Support both top-level and nested _scanConfig
    const sc = (j._scanConfig && typeof j._scanConfig === "object" ? j._scanConfig : j) as Record<string, unknown>;
    return {
      marketplace: typeof sc.marketplace === "string" ? sc.marketplace : (typeof j.marketplace === "string" ? j.marketplace : defaults.marketplace),
      subcategories: Array.isArray(sc.subcategories) ? sc.subcategories as ScanFilters["subcategories"] : defaults.subcategories,
      newProductMonths: typeof sc.newProductMonths === "number" ? sc.newProductMonths : defaults.newProductMonths,
      minPrice: typeof sc.minPrice === "number" ? sc.minPrice : defaults.minPrice,
      maxPrice: typeof sc.maxPrice === "number" ? sc.maxPrice : defaults.maxPrice,
      minMonthlyRevenue: typeof sc.minMonthlyRevenue === "number" ? sc.minMonthlyRevenue : defaults.minMonthlyRevenue,
      maxReviews: typeof sc.maxReviews === "number" ? sc.maxReviews : defaults.maxReviews,
      minRating: typeof sc.minRating === "number" ? sc.minRating : defaults.minRating,
    };
  } catch {
    return defaults;
  }
}

type ProductRecord = Record<string, unknown>;

function extractProducts(data: unknown): ProductRecord[] {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) return data as ProductRecord[];
  const obj = data as Record<string, unknown>;
  // Try common nested structures
  if (Array.isArray(obj.items)) return obj.items as ProductRecord[];
  if (Array.isArray(obj.data)) return obj.data as ProductRecord[];
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const inner = obj.data as Record<string, unknown>;
    if (Array.isArray(inner.items)) return inner.items as ProductRecord[];
    if (Array.isArray(inner.data)) return inner.data as ProductRecord[];
  }
  return [];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

/**
 * 智能选品扫描 — SSE 进度流。
 * 零 Claude token 消耗：纯卖家精灵 MCP 拉数据 + 代码过滤。
 */
export async function POST(req: Request) {
  const { session, error } = await requireModuleAccess("selection-analysis");
  if (error) return error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response("无效的 JSON", { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response("参数错误", { status: 400 });
  }

  const plan = await prisma.smartSelectionPlan.findUnique({
    where: { id: parsed.data.planId },
  });
  if (!plan) return new Response("方案不存在", { status: 404 });
  if (plan.createdById !== session!.user.id) return new Response("无权限", { status: 403 });
  // active check removed — all plans can scan

  console.log("[scan] filtersJson:", plan.filtersJson?.slice(0, 500));
  const filters = parseScanFilters(plan.filtersJson, plan.marketplace);
  console.log("[scan] parsed subcategories count:", filters.subcategories.length);

  if (filters.subcategories.length === 0) {
    return new Response("请先在方案中配置至少一个扫描类目", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      try {
        // 1. Create batch
        const batch = await prisma.smartSelectionScanBatch.create({
          data: { planId: plan.id },
        });

        // 2. Load exclude list & existing results for dedup
        const [excludeList, existingResults] = await Promise.all([
          prisma.smartSelectionExcludeList.findMany({
            where: { planId: plan.id },
            select: { asin: true },
          }),
          prisma.smartSelectionResult.findMany({
            where: { planId: plan.id },
            select: { asin: true },
          }),
        ]);
        const excludedAsins = new Set(excludeList.map((e) => e.asin.toUpperCase()));
        const existingAsins = new Set(existingResults.map((r) => r.asin.toUpperCase()));

        send({ type: "step", step: 1, label: "准备扫描，加载排除列表…", progress: 5 });

        // 3. Scan each subcategory via MCP
        const mcp = createSellerspriteMcpClient();
        const allProducts: Array<ProductRecord & { _categoryLabel: string }> = [];
        const totalCats = filters.subcategories.length;

        for (let i = 0; i < totalCats; i++) {
          const sub = filters.subcategories[i];
          const pct = Math.round(10 + (i / totalCats) * 60);
          send({
            type: "step",
            step: 2,
            label: `扫描类目 ${i + 1}/${totalCats}：${sub.label}…`,
            progress: pct,
          });

          const result = await mcp.callToolSafe("market_product_concentration", {
            request: {
              marketplace: filters.marketplace,
              nodeIdPath: sub.nodeIdPath,
              newProduct: filters.newProductMonths || 6,
              topN: 100,
            },
          });

          if (result.ok) {
            const products = extractProducts(result.data);
            for (const p of products) {
              allProducts.push({ ...p, _categoryLabel: sub.label });
            }
          } else {
            console.warn(`[smart-scan] Failed to scan ${sub.label}:`, result.error);
          }
        }

        send({
          type: "step",
          step: 3,
          label: `拉取完成，共 ${allProducts.length} 个产品，开始筛选…`,
          progress: 75,
        });

        // 4. Filter products
        const filtered: Array<ProductRecord & { _categoryLabel: string }> = [];

        for (const p of allProducts) {
          const asin = str(p.asin);
          if (!asin) continue;
          const asinUp = asin.toUpperCase();

          // Dedup: skip excluded & already in results
          if (excludedAsins.has(asinUp)) continue;
          if (existingAsins.has(asinUp)) continue;

          // New product flag
          const newFlag = num(p.newFlag) ?? num(p.isNewProduct) ?? num(p.newProduct);
          if (newFlag !== 1) continue;

          // Price filter
          const price = num(p.price) ?? num(p.sellingPrice);
          if (price == null || price < filters.minPrice || price > filters.maxPrice) continue;

          // Revenue filter
          const revenue = num(p.totalRevenue) ?? num(p.totalAmount) ?? num(p.monthlyRevenue);
          if (revenue != null && revenue < filters.minMonthlyRevenue) continue;

          // Review count filter (卖家精灵 ratings = 评论数)
          const reviewCount = num(p.ratings) ?? num(p.reviewCount) ?? num(p.reviews);
          if (reviewCount != null && reviewCount > filters.maxReviews) continue;

          // Rating filter
          const rating = num(p.rating) ?? num(p.averageRating);
          if (rating != null && rating < filters.minRating) continue;

          filtered.push(p);
        }

        send({
          type: "step",
          step: 4,
          label: `筛选完成：${filtered.length} 个符合条件的新品，正在写入…`,
          progress: 85,
        });

        // 5. Write results to DB
        let written = 0;
        for (const p of filtered) {
          const asin = str(p.asin)!.toUpperCase();
          const data = {
            batchId: batch.id,
            marketplace: filters.marketplace,
            title: str(p.title) ?? str(p.productTitle),
            imageUrl: str(p.imageUrl) ?? str(p.image),
            price: num(p.price) ?? num(p.sellingPrice),
            bsr: num(p.bsr) ?? num(p.bsrRank),
            rating: num(p.rating) ?? num(p.averageRating),
            reviewCount: num(p.ratings) ?? num(p.reviewCount) ?? num(p.reviews),
            monthlySales: num(p.totalUnits) ?? num(p.monthlySales),
            productJson: JSON.stringify(p),
            status: "RECOMMENDED" as const,
          };
          try {
            const existing = await prisma.smartSelectionResult.findFirst({
              where: { planId: plan.id, asin },
              select: { id: true },
            });
            if (existing) {
              await prisma.smartSelectionResult.update({
                where: { id: existing.id },
                data,
              });
            } else {
              await prisma.smartSelectionResult.create({
                data: { planId: plan.id, asin, ...data },
              });
            }
            written++;
          } catch (e) {
            console.warn(`[smart-scan] Failed to write ${asin}:`, e instanceof Error ? e.message : e);
          }
        }

        // 6. Update batch stats
        const statsJson = JSON.stringify({
          scannedCategories: totalCats,
          totalProducts: allProducts.length,
          newProducts: allProducts.filter((p) => (num(p.newFlag) ?? num(p.isNewProduct) ?? num(p.newProduct)) === 1).length,
          afterFilter: filtered.length,
        });

        await prisma.smartSelectionScanBatch.update({
          where: { id: batch.id },
          data: { statsJson },
        });

        send({
          type: "done",
          ok: true,
          progress: 100,
          message: `扫描完成，发现 ${written} 个候选新品`,
          count: written,
        });
      } catch (e) {
        console.error("[smart-scan] Error:", e);
        send({
          type: "error",
          message: e instanceof Error ? e.message : "扫描异常",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
