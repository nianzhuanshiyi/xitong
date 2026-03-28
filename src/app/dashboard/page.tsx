import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        欢迎使用跨境电商选品分析 SaaS。左侧可进入各功能模块；后续将接入卖家精灵 MCP 与 Claude API。
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">选品分析</CardTitle>
            <CardDescription>卖家精灵 MCP 数据对接（待接入）</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            在「选品分析」中查看 ASIN 与市场数据。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">智能选品</CardTitle>
            <CardDescription>Claude API 驱动（待接入）</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            AI 辅助机会发现与品类策略。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">供应商资源库</CardTitle>
            <CardDescription>美韩供应商维护</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            管理 FormulAB、Luxe Farm 等合作方信息。
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
