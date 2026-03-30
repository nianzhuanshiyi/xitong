"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Category {
  id: string;
  categoryName: string;
  nodeIdPath?: string;
  marketSize?: number;
  avgPrice?: number;
  competitorCount?: number;
  cnSellerShare?: number;
  avgReviews?: number;
  entryDifficulty?: "easy" | "medium" | "hard";
  profitMargin?: number;
  score?: number;
  notes?: string;
  status: "research" | "validated" | "launched" | "abandoned";
}

const statusOptions = [
  { value: "__all__", label: "全部" },
  { value: "research", label: "研究中" },
  { value: "validated", label: "已验证" },
  { value: "launched", label: "已上线" },
  { value: "abandoned", label: "放弃" },
];

const statusColors: Record<string, string> = {
  research: "bg-gray-100 text-gray-700",
  validated: "bg-blue-100 text-blue-700",
  launched: "bg-green-100 text-green-700",
  abandoned: "bg-red-100 text-red-700",
};

const difficultyColors: Record<string, string> = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  hard: "bg-red-100 text-red-700",
};

function formatAUD(value?: number): string {
  if (value == null) return "-";
  return `A$${value.toLocaleString()}`;
}

function formatPercent(value?: number): string {
  if (value == null) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span>-</span>;
  let colorClass = "text-red-600";
  if (score >= 70) colorClass = "text-green-600";
  else if (score >= 40) colorClass = "text-amber-600";
  return <span className={`font-semibold ${colorClass}`}>{score}/100</span>;
}

export function TabCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formDifficulty, setFormDifficulty] = useState("");

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "__all__") params.set("status", statusFilter);
      const res = await fetch(`/api/au-target/categories?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const body: Record<string, unknown> = {
      categoryName: fd.get("categoryName"),
      nodeIdPath: fd.get("nodeIdPath") || undefined,
      marketSize: fd.get("marketSize") ? Number(fd.get("marketSize")) : undefined,
      avgPrice: fd.get("avgPrice") ? Number(fd.get("avgPrice")) : undefined,
      competitorCount: fd.get("competitorCount") ? Number(fd.get("competitorCount")) : undefined,
      cnSellerShare: fd.get("cnSellerShare") ? Number(fd.get("cnSellerShare")) : undefined,
      avgReviews: fd.get("avgReviews") ? Number(fd.get("avgReviews")) : undefined,
      entryDifficulty: formDifficulty || undefined,
      profitMargin: fd.get("profitMargin") ? Number(fd.get("profitMargin")) : undefined,
      score: fd.get("score") ? Number(fd.get("score")) : undefined,
      notes: fd.get("notes") || undefined,
    };

    const res = await fetch("/api/au-target/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setAddOpen(false);
      setFormDifficulty("");
      fetchCategories();
    }
  }

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch(`/api/au-target/categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: status as Category["status"] } : c
        )
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>品类机会</CardTitle>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <Button onClick={() => setAddOpen(true)}>添加品类</Button>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>添加品类</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="categoryName">品类名称 *</Label>
                    <Input id="categoryName" name="categoryName" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nodeIdPath">Node ID Path</Label>
                    <Input id="nodeIdPath" name="nodeIdPath" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="marketSize">市场规模 (A$)</Label>
                      <Input id="marketSize" name="marketSize" type="number" min="0" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="avgPrice">均价 (A$)</Label>
                      <Input id="avgPrice" name="avgPrice" type="number" min="0" step="0.01" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="competitorCount">竞品数</Label>
                      <Input id="competitorCount" name="competitorCount" type="number" min="0" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cnSellerShare">中国卖家占比 (0-1)</Label>
                      <Input id="cnSellerShare" name="cnSellerShare" type="number" min="0" max="1" step="0.01" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="avgReviews">平均评论数</Label>
                      <Input id="avgReviews" name="avgReviews" type="number" min="0" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="entryDifficulty">进入难度</Label>
                      <Select value={formDifficulty} onValueChange={(v) => setFormDifficulty(v ?? "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择难度" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="profitMargin">利润率 (0-1)</Label>
                      <Input id="profitMargin" name="profitMargin" type="number" min="0" max="1" step="0.01" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="score">评分 (0-100)</Label>
                      <Input id="score" name="score" type="number" min="0" max="100" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">备注</Label>
                    <Textarea id="notes" name="notes" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                      取消
                    </Button>
                    <Button type="submit">保存</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            暂无品类数据，点击&quot;添加品类&quot;开始
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>品类名称</TableHead>
                  <TableHead>市场规模</TableHead>
                  <TableHead>均价</TableHead>
                  <TableHead>竞品数</TableHead>
                  <TableHead>中国卖家占比</TableHead>
                  <TableHead>进入难度</TableHead>
                  <TableHead>利润率</TableHead>
                  <TableHead>评分</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.categoryName}</TableCell>
                    <TableCell>{formatAUD(cat.marketSize)}</TableCell>
                    <TableCell>{formatAUD(cat.avgPrice)}</TableCell>
                    <TableCell>{cat.competitorCount ?? "-"}</TableCell>
                    <TableCell>{formatPercent(cat.cnSellerShare)}</TableCell>
                    <TableCell>
                      {cat.entryDifficulty ? (
                        <Badge
                          variant="secondary"
                          className={difficultyColors[cat.entryDifficulty]}
                        >
                          {cat.entryDifficulty}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{formatPercent(cat.profitMargin)}</TableCell>
                    <TableCell>
                      <ScoreBadge score={cat.score} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={cat.status}
                        onValueChange={(val) => val && handleStatusChange(cat.id, val)}
                      >
                        <SelectTrigger className="w-[110px] h-8">
                          <Badge
                            variant="secondary"
                            className={statusColors[cat.status]}
                          >
                            {statusOptions.find((o) => o.value === cat.status)?.label ?? cat.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions
                            .filter((o) => o.value !== "__all__")
                            .map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
