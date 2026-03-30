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

interface Milestone {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
}

interface StorePlan {
  id: string;
  storeName: string;
  brandName?: string;
  category?: string;
  status: "planning" | "registered" | "active" | "scaling";
  targetMonthlyRevenue: number;
  actualMonthlyRevenue?: number;
  skuCount: number;
  launchDate?: string;
  notes?: string;
  milestones: Milestone[];
}

const PLAN_STATUS_MAP: Record<
  string,
  { label: string; className: string }
> = {
  planning: { label: "规划中", className: "bg-gray-100 text-gray-700 border-gray-300" },
  registered: { label: "已注册", className: "bg-blue-100 text-blue-700 border-blue-300" },
  active: { label: "运营中", className: "bg-green-100 text-green-700 border-green-300" },
  scaling: { label: "增长中", className: "bg-amber-100 text-amber-700 border-amber-300" },
};

const MILESTONE_STATUS_MAP: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: "待开始", className: "bg-gray-100 text-gray-700 border-gray-300" },
  in_progress: { label: "进行中", className: "bg-blue-100 text-blue-700 border-blue-300" },
  completed: { label: "已完成", className: "bg-green-100 text-green-700 border-green-300" },
  overdue: { label: "已逾期", className: "bg-red-100 text-red-700 border-red-300" },
};

const emptyPlanForm = {
  storeName: "",
  brandName: "",
  category: "",
  status: "planning" as string,
  targetMonthlyRevenue: "",
  notes: "",
  launchDate: "",
};

export function TabPlans() {
  const [plans, setPlans] = useState<StorePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<StorePlan | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [milestoneForm, setMilestoneForm] = useState({
    title: "",
    description: "",
    targetDate: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/au-target/plans");
      if (!res.ok) throw new Error("获取计划失败");
      const json = await res.json();
      setPlans(json);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleSubmitPlan = async () => {
    if (!planForm.storeName) return;
    try {
      setSubmitting(true);
      const body = {
        storeName: planForm.storeName,
        brandName: planForm.brandName || undefined,
        category: planForm.category || undefined,
        status: planForm.status,
        targetMonthlyRevenue: planForm.targetMonthlyRevenue
          ? Number(planForm.targetMonthlyRevenue)
          : 0,
        notes: planForm.notes || undefined,
        launchDate: planForm.launchDate || undefined,
      };

      if (editingPlan) {
        const res = await fetch(`/api/au-target/plans/${editingPlan.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("更新失败");
      } else {
        const res = await fetch("/api/au-target/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("添加失败");
      }

      setPlanForm(emptyPlanForm);
      setEditingPlan(null);
      setAddPlanOpen(false);
      await fetchPlans();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!window.confirm("确定删除该店铺计划？此操作不可撤销。")) return;
    try {
      const res = await fetch(`/api/au-target/plans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      await fetchPlans();
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleAddMilestone = async () => {
    if (!milestoneForm.title || !milestoneForm.targetDate || !selectedPlanId) return;
    try {
      setSubmitting(true);
      const res = await fetch("/api/au-target/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storePlanId: selectedPlanId,
          title: milestoneForm.title,
          description: milestoneForm.description || undefined,
          targetDate: milestoneForm.targetDate,
        }),
      });
      if (!res.ok) throw new Error("添加里程碑失败");
      setMilestoneForm({ title: "", description: "", targetDate: "" });
      setAddMilestoneOpen(false);
      await fetchPlans();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMilestoneStatusChange = async (milestoneId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/au-target/milestones/${milestoneId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("更新状态失败");
      await fetchPlans();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    }
  };

  const openEditDialog = (plan: StorePlan) => {
    setEditingPlan(plan);
    setPlanForm({
      storeName: plan.storeName,
      brandName: plan.brandName || "",
      category: plan.category || "",
      status: plan.status,
      targetMonthlyRevenue: plan.targetMonthlyRevenue ? String(plan.targetMonthlyRevenue) : "",
      notes: plan.notes || "",
      launchDate: plan.launchDate ? plan.launchDate.slice(0, 10) : "",
    });
    setAddPlanOpen(true);
  };

  const openAddDialog = () => {
    setEditingPlan(null);
    setPlanForm(emptyPlanForm);
    setAddPlanOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        <span className="ml-3 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top: Add plan button */}
      <div className="flex justify-end">
        <Button onClick={() => { openAddDialog(); setAddPlanOpen(true); }}>添加店铺计划</Button>
        <Dialog open={addPlanOpen} onOpenChange={(open) => {
          setAddPlanOpen(open);
          if (!open) {
            setEditingPlan(null);
            setPlanForm(emptyPlanForm);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPlan ? "编辑店铺计划" : "添加店铺计划"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="plan-store-name">店铺名称 *</Label>
                <Input
                  id="plan-store-name"
                  value={planForm.storeName}
                  onChange={(e) => setPlanForm((prev) => ({ ...prev, storeName: e.target.value }))}
                  placeholder="店铺名称"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-brand">品牌名称</Label>
                <Input
                  id="plan-brand"
                  value={planForm.brandName}
                  onChange={(e) => setPlanForm((prev) => ({ ...prev, brandName: e.target.value }))}
                  placeholder="品牌名称"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-category">品类</Label>
                <Input
                  id="plan-category"
                  value={planForm.category}
                  onChange={(e) => setPlanForm((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="品类"
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select
                  value={planForm.status}
                  onValueChange={(val) => setPlanForm((prev) => ({ ...prev, status: val ?? "planning" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">规划中</SelectItem>
                    <SelectItem value="registered">已注册</SelectItem>
                    <SelectItem value="active">运营中</SelectItem>
                    <SelectItem value="scaling">增长中</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-target-revenue">目标月销 (AUD)</Label>
                <Input
                  id="plan-target-revenue"
                  type="number"
                  value={planForm.targetMonthlyRevenue}
                  onChange={(e) => setPlanForm((prev) => ({ ...prev, targetMonthlyRevenue: e.target.value }))}
                  placeholder="目标月销售额"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-launch-date">上线日期</Label>
                <Input
                  id="plan-launch-date"
                  type="date"
                  value={planForm.launchDate}
                  onChange={(e) => setPlanForm((prev) => ({ ...prev, launchDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-notes">备注</Label>
                <Textarea
                  id="plan-notes"
                  value={planForm.notes}
                  onChange={(e) => setPlanForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="备注信息"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSubmitPlan}
                disabled={submitting || !planForm.storeName}
              >
                {submitting ? "提交中..." : editingPlan ? "保存修改" : "确认添加"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty state */}
      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-sm">暂无店铺计划，点击&quot;添加店铺计划&quot;开始规划</p>
        </div>
      ) : (
        /* Plan cards grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((plan) => {
            const statusInfo = PLAN_STATUS_MAP[plan.status] || PLAN_STATUS_MAP.planning;
            const progressValue =
              plan.targetMonthlyRevenue > 0
                ? Math.min(((plan.actualMonthlyRevenue || 0) / plan.targetMonthlyRevenue) * 100, 100)
                : 0;
            const isExpanded = expandedPlanId === plan.id;

            return (
              <div key={plan.id} className="space-y-0">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">{plan.storeName}</CardTitle>
                    <Badge className={statusInfo.className} variant="outline">
                      {statusInfo.label}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div className="text-muted-foreground">品牌</div>
                      <div>{plan.brandName || "—"}</div>
                      <div className="text-muted-foreground">品类</div>
                      <div>{plan.category || "—"}</div>
                      <div className="text-muted-foreground">目标月销</div>
                      <div>A${plan.targetMonthlyRevenue.toLocaleString("en-AU")}</div>
                      <div className="text-muted-foreground">实际月销</div>
                      <div>
                        {plan.actualMonthlyRevenue != null
                          ? `A$${plan.actualMonthlyRevenue.toLocaleString("en-AU")}`
                          : "—"}
                      </div>
                    </div>
                    <Progress
                      value={progressValue}
                      className="[&>div]:bg-amber-500"
                    />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div className="text-muted-foreground">SKU数</div>
                      <div>{plan.skuCount}</div>
                      <div className="text-muted-foreground">上线日期</div>
                      <div>
                        {plan.launchDate
                          ? new Date(plan.launchDate).toLocaleDateString("zh-CN")
                          : "未定"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(plan)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setExpandedPlanId(isExpanded ? null : plan.id)
                        }
                      >
                        {isExpanded ? "收起里程碑" : "展开里程碑"}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeletePlan(plan.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Expanded milestones */}
                {isExpanded && (
                  <div className="rounded-b-lg border border-t-0 bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">里程碑</h4>
                      <Dialog
                        open={addMilestoneOpen && selectedPlanId === plan.id}
                        onOpenChange={(open) => {
                          setAddMilestoneOpen(open);
                          if (open) {
                            setSelectedPlanId(plan.id);
                          } else {
                            setMilestoneForm({ title: "", description: "", targetDate: "" });
                          }
                        }}
                      >
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedPlanId(plan.id);
                              setAddMilestoneOpen(true);
                            }}
                          >
                            添加里程碑
                          </Button>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>添加里程碑</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                              <Label htmlFor="ms-title">标题</Label>
                              <Input
                                id="ms-title"
                                value={milestoneForm.title}
                                onChange={(e) =>
                                  setMilestoneForm((prev) => ({ ...prev, title: e.target.value }))
                                }
                                placeholder="里程碑标题"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ms-desc">描述</Label>
                              <Textarea
                                id="ms-desc"
                                value={milestoneForm.description}
                                onChange={(e) =>
                                  setMilestoneForm((prev) => ({
                                    ...prev,
                                    description: e.target.value,
                                  }))
                                }
                                placeholder="描述"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ms-date">目标日期</Label>
                              <Input
                                id="ms-date"
                                type="date"
                                value={milestoneForm.targetDate}
                                onChange={(e) =>
                                  setMilestoneForm((prev) => ({
                                    ...prev,
                                    targetDate: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <Button
                              className="w-full"
                              onClick={handleAddMilestone}
                              disabled={
                                submitting || !milestoneForm.title || !milestoneForm.targetDate
                              }
                            >
                              {submitting ? "提交中..." : "确认添加"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {plan.milestones.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        暂无里程碑
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {plan.milestones.map((ms) => {
                          const msStatus =
                            MILESTONE_STATUS_MAP[ms.status] || MILESTONE_STATUS_MAP.pending;
                          return (
                            <div
                              key={ms.id}
                              className="flex items-start justify-between rounded-lg border bg-background p-3"
                            >
                              <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{ms.title}</span>
                                  <Badge className={msStatus.className} variant="outline">
                                    {msStatus.label}
                                  </Badge>
                                </div>
                                {ms.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {ms.description}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  目标: {new Date(ms.targetDate).toLocaleDateString("zh-CN")}
                                </p>
                              </div>
                              <Select
                                value={ms.status}
                                onValueChange={(val) => val && handleMilestoneStatusChange(ms.id, val)}
                              >
                                <SelectTrigger className="w-[100px] h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">待开始</SelectItem>
                                  <SelectItem value="in_progress">进行中</SelectItem>
                                  <SelectItem value="completed">已完成</SelectItem>
                                  <SelectItem value="overdue">已逾期</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
