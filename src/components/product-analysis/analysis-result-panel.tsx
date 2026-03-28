"use client";

import { Download, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnalysisResult } from "@/lib/product-analysis/types";
import {
  MarketAnalysisTab,
  ProfitAnalysisTab,
  ReviewsAnalysisTab,
  ScoreAnalysisTab,
  TrafficAnalysisTab,
} from "./analysis-tab-views";

export function AnalysisResultPanel({
  result,
  reportId,
  fromCache,
  cacheBanner,
  onReanalyze,
  reanalyzeLoading,
  onDownloadMarkdown,
  onPrint,
}: {
  result: AnalysisResult;
  reportId: string | null;
  fromCache: boolean;
  cacheBanner?: React.ReactNode;
  onReanalyze: () => void;
  reanalyzeLoading: boolean;
  onDownloadMarkdown: () => void;
  onPrint: () => void;
}) {
  const { score } = result;

  return (
    <div
      id="analysis-report"
      className="min-w-0 max-w-full space-y-4 overflow-x-hidden print:shadow-none"
      style={{ overflowWrap: "break-word", wordBreak: "break-word" }}
    >
      {cacheBanner}

      <Card className="max-w-full overflow-hidden border-slate-200/90 shadow-sm print:border-0 print:shadow-none">
        <CardHeader className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/50 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 max-w-full">
            <CardTitle className="text-lg text-slate-900">分析结果</CardTitle>
            <CardDescription className="mt-1 max-w-full">
              {reportId ? (
                <>
                  报告 ID：<span className="font-mono text-xs">{reportId}</span>
                  <span className="text-muted-foreground"> · 已写入历史记录</span>
                </>
              ) : fromCache ? (
                <span className="text-amber-800">
                  当前为缓存结果（未新建历史报告条目）
                </span>
              ) : null}
            </CardDescription>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2 print:hidden">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              disabled={reanalyzeLoading}
              onClick={onReanalyze}
            >
              <RefreshCw
                className={`size-4 ${reanalyzeLoading ? "animate-spin" : ""}`}
              />
              重新分析
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onDownloadMarkdown}
            >
              <Download className="size-4" />
              下载 Markdown
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onPrint}
            >
              <Printer className="size-4" />
              打印 / PDF
            </Button>
          </div>
        </CardHeader>

        <CardContent className="min-w-0 max-w-full overflow-x-hidden p-0">
          <Tabs defaultValue="score" className="w-full max-w-full">
            <div className="border-b border-slate-200 bg-white px-3 pt-3">
              <TabsList className="flex h-auto w-full max-w-full flex-wrap justify-start gap-1 bg-transparent p-0 print:hidden">
                <TabsTrigger
                  value="score"
                  className="rounded-lg px-2 py-1.5 text-[11px] data-[selected]:bg-indigo-100 data-[selected]:text-indigo-900 sm:px-3 sm:py-2 sm:text-xs md:text-sm"
                >
                  综合评分
                </TabsTrigger>
                <TabsTrigger
                  value="market"
                  className="rounded-lg px-2 py-1.5 text-[11px] data-[selected]:bg-indigo-100 data-[selected]:text-indigo-900 sm:px-3 sm:py-2 sm:text-xs md:text-sm"
                >
                  市场分析
                </TabsTrigger>
                <TabsTrigger
                  value="traffic"
                  className="rounded-lg px-2 py-1.5 text-[11px] data-[selected]:bg-indigo-100 data-[selected]:text-indigo-900 sm:px-3 sm:py-2 sm:text-xs md:text-sm"
                >
                  流量分析
                </TabsTrigger>
                <TabsTrigger
                  value="reviews"
                  className="rounded-lg px-2 py-1.5 text-[11px] data-[selected]:bg-indigo-100 data-[selected]:text-indigo-900 sm:px-3 sm:py-2 sm:text-xs md:text-sm"
                >
                  评价分析
                </TabsTrigger>
                <TabsTrigger
                  value="profit"
                  className="rounded-lg px-2 py-1.5 text-[11px] data-[selected]:bg-indigo-100 data-[selected]:text-indigo-900 sm:px-3 sm:py-2 sm:text-xs md:text-sm"
                >
                  利润分析
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="score" className="m-0 max-w-full space-y-8 p-6">
              <ScoreAnalysisTab score={score} />
              {result.basics.lowPriceWarnings.length > 0 && (
                <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm text-red-900">
                  <p className="font-medium">价格门槛提示</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {result.basics.lowPriceWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>

            <TabsContent value="market" className="m-0 max-w-full p-5">
              <MarketAnalysisTab market={result.market} />
            </TabsContent>

            <TabsContent value="traffic" className="m-0 max-w-full p-5">
              <TrafficAnalysisTab result={result} />
            </TabsContent>

            <TabsContent value="reviews" className="m-0 max-w-full p-5">
              <ReviewsAnalysisTab result={result} />
            </TabsContent>

            <TabsContent value="profit" className="m-0 max-w-full p-5">
              <ProfitAnalysisTab profit={result.profit} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
