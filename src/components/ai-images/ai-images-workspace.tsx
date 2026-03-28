"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Heart,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DEFAULT_FORM,
  type AiImageTypeId,
  type BundleSlot,
  type GenerateFormState,
} from "@/lib/ai-images/types";

type ProjectListItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  _count: { generatedImages: number };
};

type GeneratedRow = {
  id: string;
  imageType: AiImageTypeId;
  promptEn: string;
  promptZh: string;
  filePath: string;
  isFavorite: boolean;
  sortPosition: number | null;
  createdAt: string;
};

const TYPE_CARDS: {
  id: AiImageTypeId;
  emoji: string;
  title: string;
  desc: string;
}[] = [
  {
    id: "MAIN_WHITE",
    emoji: "🏷️",
    title: "白底主图",
    desc: "纯白背景，符合亚马逊主图",
  },
  {
    id: "LIFESTYLE",
    emoji: "🌅",
    title: "场景生活图",
    desc: "真实使用场景",
  },
  {
    id: "INFOGRAPHIC",
    emoji: "📊",
    title: "卖点信息图",
    desc: "突出特点的图文设计",
  },
  {
    id: "SIZE_COMPARE",
    emoji: "📐",
    title: "尺寸对比图",
    desc: "与常见参照物对比",
  },
  {
    id: "MODEL_USE",
    emoji: "👤",
    title: "模特使用图",
    desc: "模特展示使用效果",
  },
  {
    id: "BEFORE_AFTER",
    emoji: "🔄",
    title: "前后对比图",
    desc: "使用前后效果",
  },
  {
    id: "PACKAGING",
    emoji: "📦",
    title: "包装展示图",
    desc: "包装与配件全家福",
  },
  {
    id: "APLUS_STORY",
    emoji: "✨",
    title: "A+品牌故事图",
    desc: "品牌形象与故事",
  },
];

const TYPE_LABEL: Record<AiImageTypeId, string> = {
  MAIN_WHITE: "白底主图",
  LIFESTYLE: "场景",
  INFOGRAPHIC: "卖点信息",
  SIZE_COMPARE: "尺寸对比",
  MODEL_USE: "模特",
  BEFORE_AFTER: "前后对比",
  PACKAGING: "包装",
  APLUS_STORY: "A+品牌",
};

function cn(...a: (string | false | undefined)[]) {
  return a.filter(Boolean).join(" ");
}

export function AiImagesWorkspace() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [bundlePlan, setBundlePlan] = useState<BundleSlot[]>([]);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [images, setImages] = useState<GeneratedRow[]>([]);
  const [form, setForm] = useState<GenerateFormState>(DEFAULT_FORM);
  const [promptEn, setPromptEn] = useState("");
  const [promptZh, setPromptZh] = useState("");
  const [parentRegenId, setParentRegenId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [bundleOrder, setBundleOrder] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingProject, setLoadingProject] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [processOpen, setProcessOpen] = useState<GeneratedRow | null>(null);
  const [overlayText, setOverlayText] = useState("");
  const [adjustBright, setAdjustBright] = useState(1.05);

  const refreshProjects = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetch("/api/ai-images/projects");
      if (!r.ok) throw new Error("加载项目失败");
      const data = (await r.json()) as ProjectListItem[];
      setProjects(data);
      setProjectId((cur) => (cur === null && data[0] ? data[0].id : cur));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    setLoadingProject(true);
    try {
      const r = await fetch(`/api/ai-images/projects/${id}`);
      if (!r.ok) throw new Error("加载项目详情失败");
      const data = (await r.json()) as {
        bundlePlan: BundleSlot[];
        referenceUrls: string[];
        generatedImages: GeneratedRow[];
      };
      setBundlePlan(data.bundlePlan ?? []);
      setReferenceUrls(data.referenceUrls ?? []);
      setImages(data.generatedImages ?? []);
      const ordered = [...(data.generatedImages ?? [])]
        .filter((x) => x.sortPosition !== null)
        .sort((a, b) => (a.sortPosition ?? 0) - (b.sortPosition ?? 0))
        .map((x) => x.id);
      setBundleOrder(ordered);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoadingProject(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (projectId) void loadProject(projectId);
  }, [projectId, loadProject]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

  async function createProject() {
    if (!newName.trim()) {
      toast.error("请填写产品名称");
      return;
    }
    const r = await fetch("/api/ai-images/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        category: newCategory.trim(),
        description: newDesc.trim(),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error((j as { message?: string }).message ?? "创建失败");
      return;
    }
    toast.success("项目已创建");
    setNewOpen(false);
    setNewName("");
    setNewCategory("");
    setNewDesc("");
    await refreshProjects();
    if ((j as { id?: string }).id) setProjectId((j as { id: string }).id);
  }

  async function deleteProject() {
    if (!projectId) return;
    if (!window.confirm("确定删除该项目及所有图片？")) return;
    const r = await fetch(`/api/ai-images/projects/${projectId}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      toast.error("删除失败");
      return;
    }
    toast.success("已删除");
    setProjectId(null);
    await refreshProjects();
  }

  async function uploadRefs(files: FileList | null) {
    if (!projectId || !files?.length) return;
    const fd = new FormData();
    for (let i = 0; i < files.length; i++) fd.append("file", files[i]!);
    const r = await fetch(`/api/ai-images/projects/${projectId}/references`, {
      method: "POST",
      body: fd,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error((j as { message?: string }).message ?? "上传失败");
      return;
    }
    setReferenceUrls((j as { urls?: string[] }).urls ?? []);
    toast.success("参考图已更新");
  }

  async function removeRef(index: number) {
    if (!projectId) return;
    const r = await fetch(
      `/api/ai-images/projects/${projectId}/references?index=${index}`,
      { method: "DELETE" }
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error((j as { message?: string }).message ?? "删除失败");
      return;
    }
    setReferenceUrls((j as { urls?: string[] }).urls ?? []);
  }

  async function runPrompt() {
    if (!projectId) return;
    setPromptLoading(true);
    try {
      const r = await fetch("/api/ai-images/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, form }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error((j as { message?: string }).message ?? "生成 Prompt 失败");
        return;
      }
      setPromptEn((j as { promptEn?: string }).promptEn ?? "");
      setPromptZh((j as { promptZh?: string }).promptZh ?? "");
      toast.success("Prompt 已生成");
    } finally {
      setPromptLoading(false);
    }
  }

  async function runGenerate() {
    if (!projectId || !promptEn.trim()) {
      toast.error("请先生成或填写英文 Prompt");
      return;
    }
    setGenLoading(true);
    try {
      const r = await fetch("/api/ai-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          promptEn,
          promptZh,
          imageType: form.imageType,
          form,
          parentImageId: parentRegenId,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if ((j as { promptOnly?: boolean }).promptOnly || !(j as { ok?: boolean }).ok) {
        toast.message(
          (j as { message?: string }).message ?? "图片接口不可用，已保留 Prompt",
          { duration: 6000 }
        );
        if ((j as { promptEn?: string }).promptEn)
          setPromptEn((j as { promptEn: string }).promptEn);
        return;
      }
      toast.success(`已生成 ${(j as { images?: unknown[] }).images?.length ?? 0} 张`);
      setParentRegenId(null);
      await loadProject(projectId);
      await refreshProjects();
    } finally {
      setGenLoading(false);
    }
  }

  async function toggleFavorite(img: GeneratedRow) {
    const r = await fetch(`/api/ai-images/images/${img.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !img.isFavorite }),
    });
    if (!r.ok) return;
    setImages((prev) =>
      prev.map((x) =>
        x.id === img.id ? { ...x, isFavorite: !x.isFavorite } : x
      )
    );
  }

  async function removeImage(img: GeneratedRow) {
    if (!window.confirm("删除此图片？")) return;
    const r = await fetch(`/api/ai-images/images/${img.id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      toast.error("删除失败");
      return;
    }
    setImages((prev) => prev.filter((x) => x.id !== img.id));
    setBundleOrder((prev) => prev.filter((id) => id !== img.id));
  }

  async function saveBundleOrder() {
    if (!projectId) return;
    const r = await fetch("/api/ai-images/bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, orderedImageIds: bundleOrder }),
    });
    if (!r.ok) {
      toast.error("保存套装顺序失败");
      return;
    }
    toast.success("套装顺序已保存");
    await loadProject(projectId);
  }

  async function exportZip() {
    if (bundleOrder.length === 0) {
      toast.error("请先在套装中排好至少一张图");
      return;
    }
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < bundleOrder.length; i++) {
        const id = bundleOrder[i]!;
        const img = images.find((x) => x.id === id);
        if (!img) continue;
        const url = `/${img.filePath.replace(/^\/+/, "")}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const blob = await res.blob();
        zip.file(`amazon-slot-${i + 1}.png`, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `${selectedProject?.name ?? "amazon-set"}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("已开始下载 ZIP");
    } catch {
      toast.error("打包失败");
    }
  }

  async function postProcess(
    img: GeneratedRow,
    body: Record<string, unknown>
  ) {
    const r = await fetch(`/api/ai-images/images/${img.id}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error((j as { message?: string }).message ?? "处理失败");
      return;
    }
    toast.success("已生成新图");
    setProcessOpen(null);
    if (projectId) await loadProject(projectId);
  }

  const grouped = useMemo(() => {
    const m = new Map<AiImageTypeId, GeneratedRow[]>();
    for (const t of TYPE_CARDS) m.set(t.id, []);
    for (const im of images) {
      const arr = m.get(im.imageType) ?? [];
      arr.push(im);
      m.set(im.imageType, arr);
    }
    return m;
  }, [images]);

  function moveSlot(from: number, to: number) {
    setBundleOrder((prev) => {
      const next = [...prev];
      const [x] = next.splice(from, 1);
      if (!x) return prev;
      next.splice(to, 0, x);
      return next;
    });
  }

  function addToBundle(id: string) {
    setBundleOrder((prev) => {
      if (prev.includes(id)) return prev;
      if (prev.length >= 7) {
        toast.message("套装最多 7 张，请先移除再添加");
        return prev;
      }
      return [...prev, id];
    });
  }

  const taClass =
    "min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
            AI 图片
          </h1>
          <p className="text-sm text-muted-foreground">
            亚马逊主图 / 场景图 Prompt 与 Imagen 出图；接口不可用时仅保留 Prompt。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 size-4" />
            新建项目
          </Button>
          {projectId && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void deleteProject()}
            >
              删除项目
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">图片项目</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {loadingList ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无项目，请先新建。</p>
          ) : (
            projects.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant={p.id === projectId ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setProjectId(p.id)}
              >
                {p.name}
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {p._count.generatedImages}
                </Badge>
              </Button>
            ))
          )}
        </CardContent>
      </Card>

      {!projectId ? (
        <p className="text-center text-sm text-muted-foreground">请选择或创建项目</p>
      ) : loadingProject ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">亚马逊 7 张图推荐策略</CardTitle>
              <p className="text-xs text-muted-foreground">
                点击位置可快速切换到对应图片类型并开始生成。
              </p>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {bundlePlan.map((slot) => (
                <button
                  key={slot.slot}
                  type="button"
                  className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-left text-sm transition hover:border-indigo-300 hover:bg-white"
                  onClick={() =>
                    setForm((f) => ({ ...f, imageType: slot.imageType }))
                  }
                >
                  <div className="font-medium text-slate-900">{slot.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {TYPE_LABEL[slot.imageType]} · {slot.hintZh}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="w-full shrink-0 space-y-4 lg:w-[35%]">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">图片类型</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TYPE_CARDS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, imageType: t.id }))
                      }
                      className={cn(
                        "rounded-xl border p-3 text-left text-sm transition",
                        form.imageType === t.id
                          ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200"
                          : "border-slate-200 hover:border-slate-300"
                      )}
                    >
                      <div className="text-lg">{t.emoji}</div>
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground">{t.desc}</div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">产品信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">产品描述</Label>
                    <textarea
                      className={cn(taClass, "mt-1 min-h-[120px]")}
                      value={form.productDescription}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          productDescription: e.target.value,
                        }))
                      }
                      placeholder="外观、材质、颜色、结构细节等"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">参考图（最多 5 张，自动压缩）</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      className="mt-1 cursor-pointer"
                      onChange={(e) => void uploadRefs(e.target.files)}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {referenceUrls.map((u, i) => (
                        <div
                          key={u}
                          className="relative h-14 w-14 overflow-hidden rounded-md border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={u}
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                          />
                          <button
                            type="button"
                            className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-[10px] text-white"
                            onClick={() => void removeRef(i)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">产品颜色</Label>
                      <Input
                        type="color"
                        className="mt-1 h-9 cursor-pointer"
                        value={form.productColor}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, productColor: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">尺寸说明</Label>
                      <Input
                        className="mt-1"
                        value={form.productSize}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, productSize: e.target.value }))
                        }
                        placeholder="如 25×18×8 cm"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {form.imageType === "MAIN_WHITE" && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">主图设置</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Label className="text-xs">拍摄角度</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                      value={form.mainAngle}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, mainAngle: e.target.value }))
                      }
                    >
                      <option value="front">正面</option>
                      <option value="45">45 度</option>
                      <option value="side">侧面</option>
                      <option value="top">俯拍</option>
                      <option value="multi">多角度组合（单图构图）</option>
                    </select>
                    <Label className="text-xs">光线</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                      value={form.mainLighting}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, mainLighting: e.target.value }))
                      }
                    >
                      <option value="soft">柔和</option>
                      <option value="bright">明亮</option>
                      <option value="dramatic">戏剧性</option>
                    </select>
                  </CardContent>
                </Card>
              )}

              {form.imageType === "LIFESTYLE" && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">场景设置</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    <select
                      className="rounded-md border border-input bg-background px-2 py-2"
                      value={form.lifestyleScene}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, lifestyleScene: e.target.value }))
                      }
                    >
                      <option value="bedroom">卧室</option>
                      <option value="bathroom">浴室</option>
                      <option value="living_room">客厅</option>
                      <option value="outdoor">户外</option>
                      <option value="office">办公室</option>
                      <option value="gym">健身房</option>
                      <option value="custom">自定义（写在产品描述中）</option>
                    </select>
                    <select
                      className="rounded-md border border-input bg-background px-2 py-2"
                      value={form.lifestyleMood}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, lifestyleMood: e.target.value }))
                      }
                    >
                      <option value="cozy">温馨</option>
                      <option value="pro">专业</option>
                      <option value="energetic">活力</option>
                      <option value="premium">高端</option>
                      <option value="natural">自然</option>
                    </select>
                    <select
                      className="rounded-md border border-input bg-background px-2 py-2"
                      value={form.lifestyleTime}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, lifestyleTime: e.target.value }))
                      }
                    >
                      <option value="day">白天</option>
                      <option value="dusk">傍晚</option>
                      <option value="night">夜晚</option>
                    </select>
                    <select
                      className="rounded-md border border-input bg-background px-2 py-2"
                      value={form.lifestyleStyle}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, lifestyleStyle: e.target.value }))
                      }
                    >
                      <option value="minimal">极简</option>
                      <option value="warm">温暖</option>
                      <option value="modern">现代</option>
                      <option value="vintage">复古</option>
                    </select>
                  </CardContent>
                </Card>
              )}

              {form.imageType === "MODEL_USE" && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">模特设置</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    <select
                      className="rounded-md border border-input bg-background px-2 py-2"
                      value={form.modelGender}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, modelGender: e.target.value }))
                      }
                    >
                      <option value="female">女性</option>
                      <option value="male">男性</option>
                      <option value="any">不限</option>
                    </select>
                    <select
                      className="rounded-md border border-input bg-background px-2 py-2"
                      value={form.modelAge}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, modelAge: e.target.value }))
                      }
                    >
                      <option value="20-30">20–30</option>
                      <option value="30-40">30–40</option>
                      <option value="40-50">40–50</option>
                    </select>
                    <select
                      className="rounded-md border border-input bg-background px-2 py-2"
                      value={form.modelSkin}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, modelSkin: e.target.value }))
                      }
                    >
                      <option value="any">肤色不限</option>
                      <option value="light">白</option>
                      <option value="asian">亚洲</option>
                      <option value="dark">黑</option>
                      <option value="latin">拉丁</option>
                    </select>
                    <select
                      className="rounded-md border border-input bg-background px-2 py-2"
                      value={form.modelExpression}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          modelExpression: e.target.value,
                        }))
                      }
                    >
                      <option value="smile">微笑</option>
                      <option value="natural">自然</option>
                      <option value="focused">专注</option>
                    </select>
                  </CardContent>
                </Card>
              )}

              {form.imageType === "INFOGRAPHIC" && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">信息图设置</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i}>
                        <Label className="text-xs">卖点 {i + 1}</Label>
                        <Input
                          className="mt-1"
                          value={form.sellingPoints?.[i] ?? ""}
                          onChange={(e) => {
                            const next = [...(form.sellingPoints ?? ["", "", "", ""])];
                            next[i] = e.target.value;
                            setForm((f) => ({ ...f, sellingPoints: next }));
                          }}
                          placeholder="一句话"
                        />
                      </div>
                    ))}
                    <Label className="text-xs">配色</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                      value={form.infographicPalette}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          infographicPalette: e.target.value,
                        }))
                      }
                    >
                      <option value="brand">跟随品牌色</option>
                      <option value="auto">自动推荐</option>
                    </select>
                    <Label className="text-xs">布局</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                      value={form.infographicLayout}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          infographicLayout: e.target.value,
                        }))
                      }
                    >
                      <option value="left_image">左图右文</option>
                      <option value="top_image">上图下文</option>
                      <option value="radial">中心放射</option>
                      <option value="compare">对比式</option>
                    </select>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">图片规格</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <Label className="text-xs">尺寸</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2"
                      value={form.specPreset}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          specPreset: e.target.value as GenerateFormState["specPreset"],
                        }))
                      }
                    >
                      <option value="amazon_1600">亚马逊标准 1600×1600（意图）</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                  {form.specPreset === "custom" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        placeholder="宽"
                        value={form.customWidth ?? 1600}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            customWidth: Number(e.target.value) || 1600,
                          }))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="高"
                        value={form.customHeight ?? 1600}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            customHeight: Number(e.target.value) || 1600,
                          }))
                        }
                      />
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between text-xs">
                      <span>风格强度</span>
                      <span>{form.styleStrength}/10</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={form.styleStrength}
                      className="mt-1 w-full accent-indigo-600"
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          styleStrength: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">生成数量</Label>
                    <div className="mt-1 flex gap-2">
                      {([1, 2, 4] as const).map((n) => (
                        <Button
                          key={n}
                          type="button"
                          size="sm"
                          variant={form.count === n ? "default" : "outline"}
                          onClick={() => setForm((f) => ({ ...f, count: n }))}
                        >
                          {n} 张
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    预估：Claude 按次计费；Imagen 约 $0.03/张（以 Google 账单为准）。
                    出图约 10–20 秒，请稍候。
                  </p>
                  {parentRegenId && (
                    <p className="text-xs text-amber-700">
                      已选择基于某张图重新生成（将关联父图 ID）。
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={promptLoading}
                      onClick={() => void runPrompt()}
                    >
                      {promptLoading ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 size-4" />
                      )}
                      AI 生成 Prompt
                    </Button>
                    <Button
                      type="button"
                      disabled={genLoading}
                      onClick={() => void runGenerate()}
                    >
                      {genLoading ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <ImageIcon className="mr-2 size-4" />
                      )}
                      生成图片
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0 flex-1 space-y-4 lg:w-[65%]">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Prompt 预览</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">英文（可编辑）</Label>
                    <textarea
                      className={cn(taClass, "mt-1 min-h-[140px] font-mono text-xs")}
                      value={promptEn}
                      onChange={(e) => setPromptEn(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">中文对照</Label>
                    <textarea
                      className={cn(taClass, "mt-1 min-h-[72px]")}
                      value={promptZh}
                      onChange={(e) => setPromptZh(e.target.value)}
                      readOnly={false}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={genLoading || !promptEn.trim()}
                    onClick={() => void runGenerate()}
                  >
                    用这个 Prompt 生成图片
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">本次生成结果</CardTitle>
                </CardHeader>
                <CardContent>
                  {images.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无生成记录</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {images.map((img) => (
                        <div
                          key={img.id}
                          className="overflow-hidden rounded-xl border bg-slate-50/50"
                        >
                          <button
                            type="button"
                            className="relative block w-full"
                            onClick={() =>
                              setLightbox(`/${img.filePath.replace(/^\/+/, "")}`)
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/${img.filePath.replace(/^\/+/, "")}`}
                              alt=""
                              className="aspect-square w-full object-cover"
                              loading="lazy"
                            />
                          </button>
                          <div className="flex flex-wrap gap-1 p-2">
                            <Button
                              type="button"
                              size="icon"
                              variant={img.isFavorite ? "default" : "outline"}
                              className="size-8"
                              title="收藏"
                              onClick={() => void toggleFavorite(img)}
                            >
                              <Heart className="size-4" />
                            </Button>
                            <a
                              href={`/${img.filePath.replace(/^\/+/, "")}`}
                              download
                              title="下载"
                              className={cn(
                                buttonVariants({
                                  variant: "outline",
                                  size: "icon",
                                }),
                                "size-8"
                              )}
                            >
                              <Download className="size-4" />
                            </a>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-8"
                              title="基于这张重新生成"
                              onClick={() => {
                                setPromptEn(img.promptEn);
                                setParentRegenId(img.id);
                                toast.message("已载入 Prompt，可微调后点「生成图片」");
                              }}
                            >
                              <RefreshCw className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-8"
                              title="编辑 Prompt"
                              onClick={() => {
                                setPromptEn(img.promptEn);
                                setPromptZh(img.promptZh);
                                setParentRegenId(null);
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-8"
                              title="后处理"
                              onClick={() => {
                                setProcessOpen(img);
                                setOverlayText("");
                              }}
                            >
                              <Package className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive"
                              title="删除"
                              onClick={() => void removeImage(img)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 text-xs"
                              onClick={() => addToBundle(img.id)}
                            >
                              加入套装
                            </Button>
                          </div>
                          <div className="px-2 pb-2 text-[10px] text-muted-foreground">
                            {TYPE_LABEL[img.imageType]} · {new Date(img.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">项目图片库</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    按类型分组；套装最多 7 张，可拖拽排序后保存并导出 ZIP。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => void saveBundleOrder()}>
                    保存套装顺序
                  </Button>
                  <Button type="button" size="sm" onClick={() => void exportZip()}>
                    导出 ZIP
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs font-medium">套装顺序（对应亚马逊 1–7）</Label>
                <div className="mt-2 flex min-h-[52px] flex-wrap gap-2 rounded-lg border border-dashed p-2">
                  {bundleOrder.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      在上方结果卡片点击「加入套装」
                    </span>
                  ) : (
                    bundleOrder.map((id, idx) => {
                      const img = images.find((x) => x.id === id);
                      if (!img) return null;
                      return (
                        <div
                          key={id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/bundle-idx", String(idx));
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const from = Number(
                              e.dataTransfer.getData("text/bundle-idx")
                            );
                            if (!Number.isFinite(from)) return;
                            moveSlot(from, idx);
                          }}
                          className="flex items-center gap-1 rounded-md border bg-white p-1 pr-2 text-xs shadow-sm"
                        >
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                            {idx + 1}
                          </span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/${img.filePath.replace(/^\/+/, "")}`}
                            alt=""
                            className="size-10 rounded object-cover"
                            loading="lazy"
                          />
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setBundleOrder((prev) => prev.filter((x) => x !== id))
                            }
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <ScrollArea className="h-[320px] w-full rounded-md border">
                <div className="space-y-4 p-3">
                  {TYPE_CARDS.map((t) => {
                    const list = grouped.get(t.id) ?? [];
                    if (list.length === 0) return null;
                    return (
                      <div key={t.id}>
                        <div className="mb-2 text-sm font-medium">
                          {t.emoji} {t.title}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {list.map((img) => (
                            <button
                              key={img.id}
                              type="button"
                              className="relative h-20 w-20 overflow-hidden rounded-md border"
                              onClick={() =>
                                setLightbox(
                                  `/${img.filePath.replace(/^\/+/, "")}`
                                )
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/${img.filePath.replace(/^\/+/, "")}`}
                                alt=""
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建图片项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>产品名称</Label>
              <Input
                className="mt-1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <Label>品类</Label>
              <Input
                className="mt-1"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
            </div>
            <div>
              <Label>简要描述</Label>
              <textarea
                className={cn(taClass, "mt-1")}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void createProject()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!processOpen} onOpenChange={(o) => !o && setProcessOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>简单后处理</DialogTitle>
          </DialogHeader>
          {processOpen && (
            <div className="space-y-3 py-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void postProcess(processOpen, { action: "crop_amazon" })}
              >
                裁剪为亚马逊 1:1（1600）
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void postProcess(processOpen, { action: "white_bg" })}
              >
                添加白底（透明通道时展平）
              </Button>
              <div>
                <Label className="text-xs">亮度微调</Label>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={adjustBright}
                  className="mt-1 w-full accent-indigo-600"
                  onChange={(e) => setAdjustBright(Number(e.target.value))}
                />
                <Button
                  type="button"
                  className="mt-2 w-full"
                  variant="outline"
                  onClick={() =>
                    void postProcess(processOpen, {
                      action: "adjust",
                      brightness: adjustBright,
                    })
                  }
                >
                  应用亮度
                </Button>
              </div>
              <div>
                <Label className="text-xs">叠加短文字</Label>
                <Input
                  className="mt-1"
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                  placeholder="25 字符内为佳"
                />
                <Button
                  type="button"
                  className="mt-2 w-full"
                  variant="outline"
                  disabled={!overlayText.trim()}
                  onClick={() =>
                    void postProcess(processOpen, {
                      action: "text",
                      text: overlayText.trim(),
                      position: "bottom",
                    })
                  }
                >
                  叠加到底部
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {lightbox && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-h-[90vh] max-w-[95vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      )}
    </div>
  );
}
