"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabDashboard } from "./tab-dashboard";
import { TabCompetitors } from "./tab-competitors";
import { TabCategories } from "./tab-categories";
import { TabPlans } from "./tab-plans";

export function AuTargetDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">澳洲1亿目标</h1>
        <p className="text-muted-foreground">3年1亿人民币销售目标 — 全品类·中国供应链</p>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">目标看板</TabsTrigger>
          <TabsTrigger value="competitors">竞品研究</TabsTrigger>
          <TabsTrigger value="categories">品类机会</TabsTrigger>
          <TabsTrigger value="plans">执行计划</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <TabDashboard />
        </TabsContent>
        <TabsContent value="competitors">
          <TabCompetitors />
        </TabsContent>
        <TabsContent value="categories">
          <TabCategories />
        </TabsContent>
        <TabsContent value="plans">
          <TabPlans />
        </TabsContent>
      </Tabs>
    </div>
  );
}
