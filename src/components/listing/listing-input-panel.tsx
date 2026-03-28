"use client";

import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_OPTIONS,
  DEFAULT_GENERATE_FLAGS,
  MARKETPLACE_OPTIONS,
  STYLE_OPTIONS,
  type ListingGenerateFlags,
  type MarketplaceCode,
  type WritingStyle,
} from "@/lib/listing/types";

const lbl = "mb-1 block text-xs font-medium text-gray-500";

export type ListingFormState = {
  marketplace: MarketplaceCode;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  specs: string;
  targetAudience: string;
  useCases: string;
  competitorAsins: string;
  style: WritingStyle;
  coreKeywords: string;
  bannedWords: string;
  extraNotes: string;
};

type Props = {
  form: ListingFormState;
  setForm: React.Dispatch<React.SetStateAction<ListingFormState>>;
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
  flags: ListingGenerateFlags;
  setFlags: React.Dispatch<React.SetStateAction<ListingGenerateFlags>>;
  analyzing: boolean;
  onAnalyzeCompetitors: () => void;
  generating: boolean;
  onGenerate: () => void;
  competitorContext: string;
  competitorOpen: boolean;
  setCompetitorOpen: (v: boolean) => void;
};

export function ListingInputPanel({
  form,
  setForm,
  advancedOpen,
  setAdvancedOpen,
  flags,
  setFlags,
  analyzing,
  onAnalyzeCompetitors,
  generating,
  onGenerate,
  competitorContext,
  competitorOpen,
  setCompetitorOpen,
}: Props) {
  const toggleFlag = (k: keyof ListingGenerateFlags) => {
    setFlags((f) => ({ ...f, [k]: !f[k] }));
  };

  return (
    <div className="flex w-full flex-col gap-4 lg:w-[40%] lg:shrink-0 lg:max-w-xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">基础信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className={lbl}>站点</label>
            <Select
              value={form.marketplace}
              onValueChange={(v) =>
                setForm((s) => ({
                  ...s,
                  marketplace: v as MarketplaceCode,
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKETPLACE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={lbl}>品类</label>
            <Select
              value={form.category}
              onValueChange={(v) =>
                setForm((s) => ({ ...s, category: v ? String(v) : s.category }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择品类" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={lbl}>产品名称</label>
            <Input
              value={form.productName}
              onChange={(e) =>
                setForm((s) => ({ ...s, productName: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={lbl}>品牌名</label>
            <Input
              value={form.brandName}
              onChange={(e) =>
                setForm((s) => ({ ...s, brandName: e.target.value }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">产品详情</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className={lbl}>产品核心卖点（每行一条）</label>
            <textarea
              className="min-h-[100px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
              value={form.sellingPoints}
              onChange={(e) =>
                setForm((s) => ({ ...s, sellingPoints: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={lbl}>产品规格</label>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
              value={form.specs}
              onChange={(e) =>
                setForm((s) => ({ ...s, specs: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={lbl}>目标人群</label>
            <Input
              value={form.targetAudience}
              onChange={(e) =>
                setForm((s) => ({ ...s, targetAudience: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={lbl}>使用场景</label>
            <Input
              value={form.useCases}
              onChange={(e) =>
                setForm((s) => ({ ...s, useCases: e.target.value }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">竞品参考（可选）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className={lbl}>竞品 ASIN（1–3 个，空格或逗号分隔）</label>
            <Input
              placeholder="B0XXXXXXXXX"
              value={form.competitorAsins}
              onChange={(e) =>
                setForm((s) => ({ ...s, competitorAsins: e.target.value }))
              }
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={analyzing}
            onClick={onAnalyzeCompetitors}
          >
            {analyzing ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            分析竞品 Listing
          </Button>
          {competitorContext ? (
            <div className="rounded-lg border border-slate-200">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
                onClick={() => setCompetitorOpen(!competitorOpen)}
              >
                分析结果（卖家精灵摘要）
                {competitorOpen ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
              {competitorOpen ? (
                <pre className="max-h-48 overflow-auto border-t border-slate-100 p-3 text-xs text-slate-600 whitespace-pre-wrap">
                  {competitorContext.slice(0, 12000)}
                  {competitorContext.length > 12000 ? "…" : ""}
                </pre>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">高级选项</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdvancedOpen(!advancedOpen)}
          >
            {advancedOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </Button>
        </CardHeader>
        {advancedOpen ? (
          <CardContent className="space-y-3">
            <div>
              <label className={lbl}>写作风格</label>
              <Select
                value={form.style}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, style: v as WritingStyle }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={lbl}>核心关键词（每行一个）</label>
              <textarea
                className="min-h-[72px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                value={form.coreKeywords}
                onChange={(e) =>
                  setForm((s) => ({ ...s, coreKeywords: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={lbl}>禁用词（每行一个）</label>
              <textarea
                className="min-h-[60px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                value={form.bannedWords}
                onChange={(e) =>
                  setForm((s) => ({ ...s, bannedWords: e.target.value }))
                }
              />
            </div>
            <div>
              <label className={lbl}>额外要求</label>
              <textarea
                className="min-h-[60px] w-full rounded-lg border border-input bg-white px-3 py-2 text-sm"
                value={form.extraNotes}
                onChange={(e) =>
                  setForm((s) => ({ ...s, extraNotes: e.target.value }))
                }
              />
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={generating}
            onClick={onGenerate}
          >
            {generating ? (
              <Loader2 className="mr-2 size-5 animate-spin" />
            ) : null}
            生成 Listing
          </Button>
          <div className="space-y-2">
            <p className={lbl}>生成内容（至少选一项）</p>
            {(
              [
                ["title", "标题 Title"],
                ["bullets", "五点描述"],
                ["description", "产品描述"],
                ["searchTerms", "后台搜索词"],
                ["aplus", "A+ 文案建议"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={flags[k]}
                  onCheckedChange={() => toggleFlag(k)}
                />
                {label}
              </label>
            ))}
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-xs"
              onClick={() => setFlags({ ...DEFAULT_GENERATE_FLAGS })}
            >
              恢复默认全选
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
