"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";

interface Milestone {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
}

interface StorePlan {
  storeName: string;
  revenueRmb: number;
}

interface DashboardData {
  currentMonthlyRevenueRmb: number;
  currentMonthlyRevenueAud: number;
  progressPercent: number;
  activeStoreCount: number;
  totalStoreCount: number;
  storePlans: StorePlan[];
  milestones: Milestone[];
}

const PIE_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "待开始", variant: "secondary" },
  in_progress: { label: "进行中", variant: "default" },
  completed: { label: "已完成", variant: "outline" },
  overdue: { label: "已逾期", variant: "destructive" },
};

function formatCurrency(value: number): string {
  if (value >= 10000) {
    return `¥${(value / 10000).toFixed(0)}万`;
  }
  return `¥${value.toFixed(0)}`;
}

function generateMonthLabels(): string[] {
  const labels: string[] = [];
  for (let y = 1; y <= 3; y++) {
    for (let m = 1; m <= 12; m++) {
      labels.push(`Y${y}M${m}`);
    }
  }
  return labels;
}

export function TabDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    targetDate: "",
    status: "pending" as string,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/au-target/dashboard");
      if (!res.ok) throw new Error("获取数据失败");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddMilestone = async () => {
    if (!formData.title || !formData.targetDate) return;
    try {
      setSubmitting(true);
      const res = await fetch("/api/au-target/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("添加里程碑失败");
      setFormData({ title: "", description: "", targetDate: "", status: "pending" });
      setDialogOpen(false);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        <span className="ml-3 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-destructive">
        <p className="text-lg font-medium">加载失败</p>
        <p className="text-sm">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchData}>
          重试
        </Button>
      </div>
    );
  }

  if (!data) return null;

  // Bar chart data
  const monthLabels = generateMonthLabels();
  const monthlyTarget = 10000 / 36; // 278万 (in 万 units)
  const barChartData = monthLabels.map((label) => ({
    month: label,
    目标: Math.round(monthlyTarget),
    实际: 0,
  }));

  // Pie chart data
  const pieData = (data.storePlans ?? []).map((store: { storeName: string; actualMonthlyRevenue?: number }) => ({
    name: store.storeName,
    value: (store.actualMonthlyRevenue ?? 0) * (data.audToRmb ?? 4.6),
  }));

  return (
    <div className="space-y-4">
      {/* Top 4 metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">总目标</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">¥1亿</div>
            <p className="text-xs text-muted-foreground mt-1">36个月 = ¥278万/月</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">当前月销</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.currentMonthlyRevenueRmb)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              AUD ${(data.currentMonthlyRevenue ?? 0).toLocaleString("en-AU", { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">完成进度</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(data.progress ?? 0).toFixed(1)}%</div>
            <Progress
              value={(data.progress ?? 0)}
              className="mt-2 [&>div]:bg-amber-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">活跃店铺</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.activeStoreCount}
              <span className="text-base font-normal text-muted-foreground">
                {" "}/ {data.totalStoreCount}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle area: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart - 36 month timeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">36个月目标拆解</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10 }}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v}万`}
                  />
                  <Tooltip
                    formatter={(value) => `${value}万`}
                  />
                  <Legend />
                  <Bar dataKey="目标" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="实际" fill="#22c55e" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie chart - store revenue distribution */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">店铺销售占比</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) =>
                      `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value ?? 0)), "销售额"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom: Milestones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">关键里程碑</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button size="sm" onClick={() => setDialogOpen(true)}>添加里程碑</Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加里程碑</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="milestone-title">标题</Label>
                  <Input
                    id="milestone-title"
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="里程碑标题"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="milestone-desc">描述</Label>
                  <Textarea
                    id="milestone-desc"
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="详细描述"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="milestone-date">目标日期</Label>
                  <Input
                    id="milestone-date"
                    type="date"
                    value={formData.targetDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, targetDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>状态</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, status: val ?? "pending" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">待开始</SelectItem>
                      <SelectItem value="in_progress">进行中</SelectItem>
                      <SelectItem value="completed">已完成</SelectItem>
                      <SelectItem value="overdue">已逾期</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={handleAddMilestone}
                  disabled={submitting || !formData.title || !formData.targetDate}
                >
                  {submitting ? "提交中..." : "确认添加"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {data.milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">暂无里程碑</p>
          ) : (
            <div className="space-y-3">
              {data.milestones.map((milestone) => {
                const statusInfo = STATUS_MAP[milestone.status] || STATUS_MAP.pending;
                return (
                  <div
                    key={milestone.id}
                    className="flex items-start justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{milestone.title}</span>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </div>
                      {milestone.description && (
                        <p className="text-xs text-muted-foreground">{milestone.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                      {new Date(milestone.targetDate).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
