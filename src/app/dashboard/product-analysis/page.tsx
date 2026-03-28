import { Suspense } from "react";
import { ProductAnalysisWorkspace } from "@/components/product-analysis/product-analysis-workspace";

export default function ProductAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20 text-sm text-muted-foreground">加载选品分析…</div>
      }
    >
      <ProductAnalysisWorkspace />
    </Suspense>
  );
}
