"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AnalysisResult } from "@/lib/product-analysis/types";
import { AnalysisMarkdown } from "./analysis-markdown";

export function AnalysisAiReportSection({
  result,
  onFactorySpecUpdate,
}: {
  result: AnalysisResult;
  onFactorySpecUpdate: (markdown: string) => void;
}) {
  const [factoryLoading, setFactoryLoading] = useState(false);
  const lowScore = result.score.total < 60;
  const hasFactory = Boolean(result.ai.factorySpecMarkdown?.trim());

  const runFactorySpec = async () => {
    setFactoryLoading(true);
    try {
      const res = await fetch("/api/product-analysis/factory-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsed: result.parsed,
          ai: {
            painPoints: result.ai.painPoints,
            reviewSummary: result.ai.reviewSummary,
            differentiators: result.ai.differentiators,
          },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        message?: string;
        factorySpecMarkdown?: string;
      };
      if (!res.ok) throw new Error(j.message ?? "生成失败");
      onFactorySpecUpdate(j.factorySpecMarkdown ?? "");
      toast.success("工厂指示单已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setFactoryLoading(false);
    }
  };

  return (
    <section
      className="w-full min-w-0 max-w-full"
      style={{ overflowWrap: "break-word", wordBreak: "break-word" }}
    >
      <Card className="max-w-full border-slate-200/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 sm:text-lg">AI 分析报告</CardTitle>
          <CardDescription className="max-w-full">
            以下为 Claude 生成的 Markdown 完整报告；工厂指示单可在底部按需生成或重新生成。
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 max-w-full space-y-10 overflow-x-hidden px-4 pb-8 sm:px-6">
          <div className="min-w-0 max-w-full">
            <h3 className="mb-4 text-base font-semibold text-slate-900">完整报告</h3>
            <AnalysisMarkdown content={result.ai.reportMarkdown} />
          </div>
          <div className="min-w-0 max-w-full border-t border-slate-200 pt-8">
            <h3 className="mb-4 flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
              工厂指示单
              <Badge variant="secondary" className="font-normal">
                Markdown
              </Badge>
            </h3>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="button"
                variant="secondary"
                disabled={factoryLoading}
                onClick={() => void runFactorySpec()}
              >
                {factoryLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    生成中…
                  </>
                ) : hasFactory ? (
                  "重新生成工厂指示单"
                ) : (
                  "生成工厂指示单"
                )}
              </Button>
              {lowScore && (
                <p className="text-sm text-amber-800">
                  当前评分较低，建议谨慎考虑
                </p>
              )}
            </div>
            {hasFactory ? (
              <AnalysisMarkdown content={result.ai.factorySpecMarkdown} />
            ) : (
              <p className="text-sm text-muted-foreground">
                尚未生成工厂指示单。综合评分低于 60
                分时不会自动写入；请点击上方按钮生成。
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
