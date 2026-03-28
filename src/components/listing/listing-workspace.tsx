"use client";

import { useCallback, useMemo, useState } from "react";
import { FileDown, History, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportListingToDocx } from "@/lib/listing/export-docx";
import { normalizeListingResult } from "@/lib/listing/normalize";
import type {
  ListingGenerateFlags,
  ListingInputPayload,
  ListingResultPayload,
} from "@/lib/listing/types";
import {
  DEFAULT_GENERATE_FLAGS,
} from "@/lib/listing/types";
import {
  ListingInputPanel,
  type ListingFormState,
} from "./listing-input-panel";
import { ListingResultPanel } from "./listing-result-panel";

function emptyResult(): ListingResultPayload {
  return {
    titles: ["", "", ""],
    bullets: ["", "", "", "", ""],
    productDescriptionHtml: "",
    searchTerms: "",
    aplus: {
      brandStory: "",
      comparison: "",
      scenarios: "",
      faq: "",
    },
  };
}

const defaultForm = (): ListingFormState => ({
  marketplace: "US",
  category: "Beauty & Personal Care",
  productName: "",
  brandName: "",
  sellingPoints: "",
  specs: "",
  targetAudience: "",
  useCases: "",
  competitorAsins: "",
  style: "professional",
  coreKeywords: "",
  bannedWords: "",
  extraNotes: "",
});

function buildInputPayload(
  form: ListingFormState,
  competitorContext: string
): ListingInputPayload {
  return {
    marketplace: form.marketplace,
    category: form.category,
    productName: form.productName.trim(),
    brandName: form.brandName.trim(),
    sellingPoints: form.sellingPoints,
    specs: form.specs,
    targetAudience: form.targetAudience,
    useCases: form.useCases,
    competitorAsins: form.competitorAsins,
    style: form.style,
    coreKeywords: form.coreKeywords,
    bannedWords: form.bannedWords,
    extraNotes: form.extraNotes,
    competitorContext: competitorContext.trim() || null,
  };
}

function buildClipboardAll(
  result: ListingResultPayload,
  primaryTitleIndex: number
): string {
  const t = result.titles[primaryTitleIndex] ?? result.titles[0];
  const lines = [
    "=== TITLE ===",
    t,
    "",
    "=== BULLET POINTS ===",
    ...result.bullets.map((b, i) => `${i + 1}. ${b}`),
    "",
    "=== PRODUCT DESCRIPTION (HTML) ===",
    result.productDescriptionHtml,
    "",
    "=== SEARCH TERMS ===",
    result.searchTerms,
    "",
    "=== A+ BRAND STORY ===",
    result.aplus.brandStory,
    "",
    "=== A+ COMPARISON ===",
    result.aplus.comparison,
    "",
    "=== A+ SCENARIOS ===",
    result.aplus.scenarios,
    "",
    "=== A+ FAQ ===",
    result.aplus.faq,
  ];
  return lines.join("\n");
}

type DraftRow = {
  id: string;
  productName: string;
  brandName: string;
  marketplace: string;
  updatedAt: string;
  status: string;
};

export function ListingWorkspace() {
  const [form, setForm] = useState<ListingFormState>(defaultForm);
  const [flags, setFlags] = useState<ListingGenerateFlags>({
    ...DEFAULT_GENERATE_FLAGS,
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [competitorOpen, setCompetitorOpen] = useState(false);
  const [competitorContext, setCompetitorContext] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const [result, setResult] = useState<ListingResultPayload>(emptyResult);
  const [primaryTitleIndex, setPrimaryTitleIndex] = useState(0);
  const [streamingPreview, setStreamingPreview] = useState("");
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  const inputPayload = useMemo(
    () => buildInputPayload(form, competitorContext),
    [form, competitorContext]
  );

  const openDrafts = useCallback(async () => {
    setDraftsOpen(true);
    setLoadingDrafts(true);
    try {
      const res = await fetch("/api/listing/drafts");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "加载失败");
      setDraftRows(j as DraftRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  const loadDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/listing/drafts/${id}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "加载失败");
      const row = j as {
        inputJson: string;
        resultJson: string | null;
        marketplace: string;
        category: string;
        productName: string;
        brandName: string;
      };
      const input = JSON.parse(row.inputJson) as Record<string, unknown>;
      const gf = input.generateFlags as ListingGenerateFlags | undefined;
      setForm({
        marketplace: (input.marketplace as ListingFormState["marketplace"]) ??
          (row.marketplace as ListingFormState["marketplace"]),
        category: String(input.category ?? row.category),
        productName: String(input.productName ?? row.productName),
        brandName: String(input.brandName ?? row.brandName),
        sellingPoints: String(input.sellingPoints ?? ""),
        specs: String(input.specs ?? ""),
        targetAudience: String(input.targetAudience ?? ""),
        useCases: String(input.useCases ?? ""),
        competitorAsins: String(input.competitorAsins ?? ""),
        style: (input.style as ListingFormState["style"]) ?? "professional",
        coreKeywords: String(input.coreKeywords ?? ""),
        bannedWords: String(input.bannedWords ?? ""),
        extraNotes: String(input.extraNotes ?? ""),
      });
      if (gf && typeof gf === "object") {
        setFlags({ ...DEFAULT_GENERATE_FLAGS, ...gf });
      }
      if (row.resultJson) {
        try {
          const parsed = JSON.parse(row.resultJson) as Record<string, unknown>;
          setResult(normalizeListingResult(parsed));
        } catch {
          setResult(emptyResult());
        }
      } else {
        setResult(emptyResult());
      }
      setCompetitorContext(
        input.competitorContext != null ? String(input.competitorContext) : ""
      );
      setDraftId(id);
      setDraftsOpen(false);
      toast.success("草稿已加载");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    }
  };

  const serializeInputJson = useCallback(() => {
    return JSON.stringify({
      ...form,
      generateFlags: flags,
      competitorContext,
    });
  }, [form, flags, competitorContext]);

  const saveDraft = async (status: "DRAFT" | "COMPLETED" | "USED" = "DRAFT") => {
    setSaving(true);
    try {
      const inputJson = serializeInputJson();
      const resultJson = JSON.stringify(result);
      if (draftId) {
        const res = await fetch(`/api/listing/drafts/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketplace: form.marketplace,
            category: form.category,
            productName: form.productName,
            brandName: form.brandName,
            inputJson,
            resultJson,
            status,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message ?? "保存失败");
        toast.success("已保存草稿");
      } else {
        const res = await fetch("/api/listing/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketplace: form.marketplace,
            category: form.category,
            productName: form.productName || "未命名产品",
            brandName: form.brandName || "品牌",
            inputJson,
            resultJson,
            status,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message ?? "保存失败");
        setDraftId(j.id as string);
        toast.success("已新建草稿");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const analyzeCompetitors = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/listing/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplace: form.marketplace,
          asinText: form.competitorAsins,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "分析失败");
      setCompetitorContext(j.text as string);
      setCompetitorOpen(true);
      toast.success("竞品数据已拉取");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  };

  const runGenerate = async () => {
    if (!form.productName.trim() || !form.brandName.trim()) {
      toast.error("请填写产品名称与品牌名");
      return;
    }
    if (!Object.values(flags).some(Boolean)) {
      toast.error("请至少选择一项生成内容");
      return;
    }
    setGenerating(true);
    setStreamingPreview("");
    try {
      const res = await fetch("/api/listing/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: inputPayload,
          flags,
          draftId,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取流");
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as Record<string, unknown>;
          if (ev.type === "delta" && typeof ev.text === "string") {
            acc += ev.text;
            setStreamingPreview(acc);
          } else if (ev.type === "error") {
            throw new Error(String(ev.message ?? "生成失败"));
          } else if (ev.type === "complete") {
            const listing = ev.listing as ListingResultPayload;
            setResult(listing);
            if (typeof ev.draftId === "string") setDraftId(ev.draftId);
            setPrimaryTitleIndex(0);
            setStreamingPreview("");
            toast.success("生成完成，已保存记录");
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
      setStreamingPreview("");
    }
  };

  const apiInputBody = useCallback(() => {
    return {
      input: {
        marketplace: form.marketplace,
        category: form.category,
        productName: form.productName,
        brandName: form.brandName,
        sellingPoints: form.sellingPoints,
        specs: form.specs,
        targetAudience: form.targetAudience,
        useCases: form.useCases,
        style: form.style,
        coreKeywords: form.coreKeywords,
        bannedWords: form.bannedWords,
        extraNotes: form.extraNotes,
      },
      flags,
    };
  }, [form, flags]);

  const regenBullet = async (index: number) => {
    setRegenerating(`bullet-${index}`);
    try {
      const res = await fetch("/api/listing/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: "bullet",
          index,
          currentBullets: result.bullets,
          ...apiInputBody(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "失败");
      const bullet = String(j.bullet ?? "");
      setResult((r) => {
        const b = [...r.bullets];
        b[index] = bullet;
        return { ...r, bullets: b };
      });
      toast.success("该条已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setRegenerating(null);
    }
  };

  const regenDesc = async () => {
    setRegenerating("desc");
    try {
      const res = await fetch("/api/listing/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: "description",
          ...apiInputBody(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "失败");
      setResult((r) => ({
        ...r,
        productDescriptionHtml: String(j.productDescriptionHtml ?? ""),
      }));
      toast.success("描述已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setRegenerating(null);
    }
  };

  const regenSt = async () => {
    setRegenerating("st");
    try {
      const title =
        result.titles[primaryTitleIndex] || result.titles[0] || form.productName;
      const res = await fetch("/api/listing/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: "searchTerms",
          input: apiInputBody().input,
          title,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "失败");
      setResult((r) => ({
        ...r,
        searchTerms: String(j.searchTerms ?? ""),
      }));
      toast.success("搜索词已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setRegenerating(null);
    }
  };

  const regenTitles = async () => {
    setRegenerating("titles");
    try {
      const res = await fetch("/api/listing/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: "titles",
          ...apiInputBody(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "失败");
      const t = j.titles as string[];
      setResult((r) => ({
        ...r,
        titles: [
          String(t[0] ?? ""),
          String(t[1] ?? ""),
          String(t[2] ?? ""),
        ],
      }));
      toast.success("三版标题已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setRegenerating(null);
    }
  };

  const copyAll = () => {
    const text = buildClipboardAll(result, primaryTitleIndex);
    void navigator.clipboard.writeText(text).then(
      () => toast.success("已复制全部（纯文本）"),
      () => toast.error("复制失败")
    );
  };

  const exportDocx = async () => {
    try {
      await exportListingToDocx({
        productName: form.productName || "Product",
        brandName: form.brandName || "Brand",
        marketplace: form.marketplace,
        category: form.category,
        result,
      });
      toast.success("Word 已导出");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    }
  };

  const hasAnyOutput = useMemo(() => {
    return (
      result.titles.some((t) => t.trim()) ||
      result.bullets.some((b) => b.trim()) ||
      result.productDescriptionHtml.trim() ||
      result.searchTerms.trim() ||
      Object.values(result.aplus).some((x) => x.trim())
    );
  }, [result]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 pb-28">
      <div>
        <h1 className="font-heading text-xl font-semibold text-slate-900 sm:text-2xl">
          Listing 撰写
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          使用 Claude（claude-opus-4-6）生成标题、五点、描述、搜索词与 A+
          建议；支持流式输出、竞品参考与草稿保存。
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <ListingInputPanel
          form={form}
          setForm={setForm}
          advancedOpen={advancedOpen}
          setAdvancedOpen={setAdvancedOpen}
          flags={flags}
          setFlags={setFlags}
          analyzing={analyzing}
          onAnalyzeCompetitors={analyzeCompetitors}
          generating={generating}
          onGenerate={runGenerate}
          competitorContext={competitorContext}
          competitorOpen={competitorOpen}
          setCompetitorOpen={setCompetitorOpen}
        />

        <ListingResultPanel
          result={result}
          setResult={setResult}
          primaryTitleIndex={primaryTitleIndex}
          setPrimaryTitleIndex={setPrimaryTitleIndex}
          regenerating={regenerating}
          onRegenerateBullet={regenBullet}
          onRegenerateDescription={regenDesc}
          onRegenerateSearchTerms={regenSt}
          onRegenerateTitles={regenTitles}
          streamingPreview={streamingPreview}
        />
      </div>

      <div className="fixed bottom-14 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_24px_rgba(15,23,42,0.08)] backdrop-blur-md md:bottom-0 md:left-[4.5rem] lg:left-[15.5rem]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-2 sm:justify-between">
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => saveDraft("DRAFT")}
            >
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              保存到草稿
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasAnyOutput}
              onClick={exportDocx}
            >
              <FileDown className="mr-2 size-4" />
              导出 Word
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasAnyOutput}
              onClick={copyAll}
            >
              一键复制全部
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={openDrafts}>
            <History className="mr-2 size-4" />
            加载草稿
          </Button>
        </div>
      </div>

      <Dialog open={draftsOpen} onOpenChange={setDraftsOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>我的 Listing 草稿</DialogTitle>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {loadingDrafts ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : draftRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                暂无草稿
              </p>
            ) : (
              draftRows.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50"
                  onClick={() => loadDraft(d.id)}
                >
                  <div className="font-medium">
                    {d.brandName} · {d.productName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.marketplace} ·{" "}
                    {new Date(d.updatedAt).toLocaleString("zh-CN")} ·{" "}
                    {d.status}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
