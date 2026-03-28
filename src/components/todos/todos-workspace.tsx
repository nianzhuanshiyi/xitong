"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TodoRow = {
  id: string;
  content: string;
  priority: "URGENT" | "NORMAL" | "LOW";
  isCompleted: boolean;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  supplierId: string | null;
  supplierName: string | null;
  emailSubject: string | null;
  emailId: string | null;
};

export function TodosWorkspace() {
  const [rows, setRows] = useState<TodoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const u = () => setNarrow(mq.matches);
    u();
    mq.addEventListener("change", u);
    return () => mq.removeEventListener("change", u);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/todos?";
      if (q.trim()) url += `q=${encodeURIComponent(q.trim())}&`;
      if (supplierFilter.trim()) {
        url += `supplierId=${encodeURIComponent(supplierFilter.trim())}&`;
      }
      const r = await fetch(url);
      if (!r.ok) throw new Error("加载失败");
      setRows(await r.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [q, supplierFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const { urgent, normal, done } = useMemo(() => {
    const u: TodoRow[] = [];
    const n: TodoRow[] = [];
    const d: TodoRow[] = [];
    const weekAgo = Date.now() - 7 * 86400_000;
    for (const t of rows) {
      if (t.isCompleted) {
        const ct = t.completedAt ? new Date(t.completedAt).getTime() : 0;
        if (ct >= weekAgo) d.push(t);
      } else if (t.priority === "URGENT") u.push(t);
      else n.push(t);
    }
    return { urgent: u, normal: n, done: d };
  }, [rows]);

  async function patchTodo(
    id: string,
    body: {
      isCompleted?: boolean;
      priority?: "URGENT" | "NORMAL" | "LOW";
    }
  ) {
    const r = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      toast.error("更新失败");
      return;
    }
    void load();
  }

  function TodoCard({ t }: { t: TodoRow }) {
    return (
      <Card
        draggable
        onDragStart={(e) => e.dataTransfer.setData("todoId", t.id)}
        className="cursor-grab border-slate-200/90 p-3 text-sm active:cursor-grabbing"
      >
        <p className="font-medium text-slate-900">{t.content}</p>
        {t.dueDate ? (
          <p className="mt-1 text-[10px] text-slate-500">
            截止 {new Date(t.dueDate).toLocaleDateString("zh-CN")}
          </p>
        ) : null}
        <div className="mt-2 text-[10px] text-slate-500">
          {t.supplierName ? (
            <span>{t.supplierName}</span>
          ) : (
            <span>未归类</span>
          )}
          {t.emailId && t.emailSubject ? (
            <>
              {" · "}
              <Link
                href={
                  t.supplierId
                    ? `/dashboard/mail?supplierId=${t.supplierId}`
                    : "/dashboard/mail"
                }
                className="text-indigo-600 hover:underline"
              >
                {t.emailSubject}
              </Link>
            </>
          ) : null}
        </div>
        <div className="mt-2 flex gap-1">
          {!t.isCompleted ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="h-6 text-[10px]"
              onClick={() => void patchTodo(t.id, { isCompleted: true })}
            >
              完成
            </Button>
          ) : (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={() => void patchTodo(t.id, { isCompleted: false })}
            >
              恢复
            </Button>
          )}
        </div>
      </Card>
    );
  }

  function Column({
    title,
    color,
    list,
    onDropTodo,
  }: {
    title: string;
    color: string;
    list: TodoRow[];
    onDropTodo: (id: string) => void;
  }) {
    return (
      <div
        className={cn(
          "min-h-[200px] flex-1 rounded-xl border-2 border-dashed p-2",
          color
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("todoId");
          if (!id) return;
          onDropTodo(id);
        }}
      >
        <h3 className="mb-2 px-1 text-xs font-semibold">{title}</h3>
        <div className="space-y-2">
          {list.map((t) => (
            <TodoCard key={t.id} t={t} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-slate-900">
          待办中心
        </h1>
        <p className="text-xs text-slate-500">跨供应商邮件提取的待办，支持看板拖拽改优先级</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex-1">
          <label className="text-[10px] text-slate-500">搜索</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="内容" />
        </div>
        <div className="sm:w-48">
          <label className="text-[10px] text-slate-500">供应商 ID</label>
          <Input
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            placeholder="可选"
          />
        </div>
        <Button type="button" size="sm" onClick={() => void load()}>
          刷新
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-indigo-500" />
        </div>
      ) : narrow ? (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-red-700">🔴 紧急</h2>
            <div className="space-y-2">
              {urgent.map((t) => (
                <TodoCard key={t.id} t={t} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-amber-700">🟡 普通</h2>
            <div className="space-y-2">
              {normal.map((t) => (
                <TodoCard key={t.id} t={t} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-600">✅ 已完成（7 天内）</h2>
            <div className="space-y-2">
              {done.map((t) => (
                <TodoCard key={t.id} t={t} />
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <Column
            title="🔴 紧急待办"
            color="border-red-200 bg-red-50/30"
            list={urgent}
            onDropTodo={(id) =>
              void patchTodo(id, { isCompleted: false, priority: "URGENT" })
            }
          />
          <Column
            title="🟡 普通待办"
            color="border-amber-200 bg-amber-50/30"
            list={normal}
            onDropTodo={(id) =>
              void patchTodo(id, { isCompleted: false, priority: "NORMAL" })
            }
          />
          <Column
            title="✅ 已完成（近 7 天）"
            color="border-slate-200 bg-slate-50/50"
            list={done}
            onDropTodo={(id) => void patchTodo(id, { isCompleted: true })}
          />
        </div>
      )}
    </div>
  );
}
