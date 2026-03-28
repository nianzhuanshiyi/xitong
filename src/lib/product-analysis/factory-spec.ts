import { claudeMessages } from "@/lib/claude-client";
import type { AnalysisResult } from "./types";
import { truncateJson } from "./utils";

export type FactorySpecContext = {
  parsed: AnalysisResult["parsed"];
  ai: Pick<
    AnalysisResult["ai"],
    "painPoints" | "reviewSummary" | "differentiators"
  >;
};

export async function generateFactorySpecMarkdown(
  ctx: FactorySpecContext
): Promise<string> {
  const painJson = {
    painPoints: ctx.ai.painPoints,
    differentiators: ctx.ai.differentiators,
    reviewSummary: ctx.ai.reviewSummary,
  };
  return (
    (await claudeMessages({
      system:
        "只输出「工厂指示单」正文（Markdown），中文，条列清晰，便于发工厂。",
      user: `痛点：${truncateJson(painJson, 4000)}\n竞品：${ctx.parsed.asins.join(", ")}\n`,
    })) ?? ""
  );
}
