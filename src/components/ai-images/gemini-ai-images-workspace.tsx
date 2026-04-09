"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Download, ImageIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GEMINI_STYLE_OPTIONS,
  type GeminiImageStyle,
} from "@/lib/ai-images/gemini-styles";
import { cn } from "@/lib/utils";

type ProjectRow = {
  id: string;
  name: string;
  asin: string | null;
  category: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  _count: { generatedImages: number };
};

type GeneratedRow = {
  id: string;
  style: string;
  status: string;
  width: number;
  height: number;
  prompt: string;
  fullPrompt: string;
  imageData: string | null;
  imageUrl: string;
  filePath: string;
  paramsJson: string;
  createdAt: string;
};

function safeFilePart(s: string) {
  return s.replace(/[/\\?%*:|"<>]/g, "_").trim().slice(0, 80) || "project";
}

function mimeFromRow(img: GeneratedRow): string {
  try {
    const p = JSON.parse(img.paramsJson || "{}") as { mimeType?: string };
    if (p.mimeType && typeof p.mimeType === "string") return p.mimeType;
  } catch {
    /* ignore */
  }
  return "image/png";
}

function imageSrc(img: GeneratedRow): string {
  if (img.imageData) {
    if (img.imageData.startsWith("data:")) return img.imageData;
    return `data:${mimeFromRow(img)};base64,${img.imageData}`;
  }
  const fp = img.filePath?.trim();
  if (fp) return `/${fp.replace(/^\/+/, "")}`;
  return "";
}

export function GeminiAiImagesWorkspace() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    id: string;
    name: string;
    asin: string | null;
    description: string;
    generatedImages: GeneratedRow[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAsin, setNewAsin] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [productDescription, setProductDescription] = useState("");
  const [style, setStyle] = useState<GeminiImageStyle>("main_image");
  const [extraNotes, setExtraNotes] = useState("");
  const [generating, setGenerating] = useState(false);

  const lastDetailProjectId = useRef<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetch("/api/ai-images/projects");
      if (!r.ok) throw new Error("加载项目失败");
      const data = (await r.json()) as ProjectRow[];
      setProjects(data);
      setSelectedId((cur) => {
        if (cur && data.some((p) => p.id === cur)) return cur;
        return data[0]?.id ?? null;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const r = await fetch(`/api/ai-images/projects/${id}`);
      if (!r.ok) throw new Error("加载项目详情失败");
      const row = (await r.json()) as {
        id: string;
        name: string;
        asin: string | null;
        description: string;
        generatedImages: GeneratedRow[];
      };
      setDetail({
        id: row.id,
        name: row.name,
        asin: row.asin,
        description: row.description,
        generatedImages: row.generatedImages,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      setDetail(null);
      lastDetailProjectId.current = null;
    }
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!detail) return;
    if (lastDetailProjectId.current !== detail.id) {
      lastDetailProjectId.current = detail.id;
      setProductDescription(
        detail.description?.trim() ? detail.description : ""
      );
    }
  }, [detail]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  );

  async function createProject() {
    if (!newName.trim()) {
      toast.error("请填写项目名称");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/ai-images/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          asin: newAsin.trim() || undefined,
          description: newDesc.trim(),
          category: "",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "创建失败");
      toast.success("项目已创建");
      setNewOpen(false);
      setNewName("");
      setNewAsin("");
      setNewDesc("");
      await loadProjects();
      setSelectedId(j.id as string);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function deleteProject(id: string) {
    if (!confirm("确定删除该项目及全部生成图？")) return;
    try {
      const r = await fetch(`/api/ai-images/projects/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.message || "删除失败");
      }
      toast.success("已删除");
      if (selectedId === id) setSelectedId(null);
      await loadProjects();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function onGenerate() {
    if (!selectedId) {
      toast.error("请先选择或创建项目");
      return;
    }
    if (!productDescription.trim()) {
      toast.error("请填写产品描述");
      return;
    }
    setGenerating(true);
    try {
      const r = await fetch("/api/ai-images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedId,
          productDescription: productDescription.trim(),
          style,
          extraNotes: extraNotes.trim(),
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j.message || "生成失败");
      }
      toast.success("图片已生成");
      await loadDetail(selectedId);
      await loadProjects();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function deleteImage(imageId: string) {
    if (!confirm("删除此图片？")) return;
    try {
      const r = await fetch(`/api/ai-images/images/${imageId}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.message || "删除失败");
      }
      toast.success("已删除");
      if (selectedId) await loadDetail(selectedId);
      await loadProjects();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function downloadImage(img: GeneratedRow) {
    const nameBase = safeFilePart(detail?.name || selectedProject?.name || "project");
    const fname = `${nameBase}_${img.style}_${Date.now()}.png`;

    if (img.imageData) {
      const mime = mimeFromRow(img);
      const res = await fetch(`data:${mime};base64,${img.imageData}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const fp = img.filePath?.trim();
    if (fp) {
      const res = await fetch(`/${fp.replace(/^\/+/, "")}`);
      if (!res.ok) {
        toast.error("下载失败");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    toast.error("没有可下载的图片数据");
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[520px] gap-4">
      <Card className="flex w-72 shrink-0 flex-col border shadow-sm">
        <CardHeader className="space-y-2 pb-2">
          <CardTitle className="text-base">图片项目</CardTitle>
          <Button size="sm" className="w-full gap-1" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />
            新建项目
          </Button>
        </CardHeader>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="p-2">
            {loadingList ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                暂无项目，点击「新建项目」开始。
              </p>
            ) : (
              <ul className="space-y-1">
                {projects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "flex w-full flex-col rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        selectedId === p.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:bg-muted/80"
                      )}
                    >
                      <span className="font-medium line-clamp-1">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p._count.generatedImages} 张图
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        {!selectedId || !detail ? (
          <Card className="flex flex-1 items-center justify-center border border-dashed shadow-sm">
            <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <ImageIcon className="h-10 w-10 opacity-50" />
              <p>请选择左侧项目，或新建一个图片项目。</p>
            </div>
          </Card>
        ) : (
          <>
            <Card className="shrink-0 border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">生成图片</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void deleteProject(detail.id)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除项目
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>产品描述（必填，用于本次生成）</Label>
                  <textarea
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    placeholder="描述产品外观、材质、卖点等…"
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>图片风格</Label>
                    <Select
                      value={style}
                      onValueChange={(v) => setStyle(v as GeminiImageStyle)}
                    >
                      <SelectTrigger className="w-full shadow-sm">
                        <SelectValue placeholder="选择风格" />
                      </SelectTrigger>
                      <SelectContent>
                        {GEMINI_STYLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{opt.label}</span>
                              <span className="text-[10px] text-muted-foreground line-clamp-1">
                                {opt.hint}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>补充说明（可选）</Label>
                    <Input
                      placeholder="例如：要有温暖的灯光、偏日系风格…"
                      value={extraNotes}
                      onChange={(e) => setExtraNotes(e.target.value)}
                      className="shadow-sm"
                    />
                  </div>
                </div>

                <Button
                  className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 font-medium text-white shadow-md hover:from-indigo-700 hover:to-violet-700 sm:w-auto"
                  disabled={generating || loadingDetail}
                  onClick={() => void onGenerate()}
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      生成中…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      生成图片
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-1 flex-col border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">已生成图片</CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-hidden p-2 pt-0">
                <ScrollArea className="h-full max-h-[min(52vh,560px)] pr-3">
                  {loadingDetail && !generating ? (
                    <div className="grid grid-cols-2 gap-3 p-2 md:grid-cols-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="aspect-square animate-pulse rounded-lg bg-muted"
                        />
                      ))}
                    </div>
                  ) : detail.generatedImages.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      还没有生成记录，填写上方表单后点击「生成图片」。
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 p-2 md:grid-cols-3">
                      {detail.generatedImages.map((img) => {
                        const src = imageSrc(img);
                        return (
                          <div
                            key={img.id}
                            className="group relative overflow-hidden rounded-lg border bg-card shadow-sm"
                          >
                            {src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src}
                                alt={img.style}
                                className="aspect-square w-full object-cover"
                              />
                            ) : (
                              <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
                                无预览
                              </div>
                            )}
                            <div className="absolute inset-0 flex items-end justify-center gap-2 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8"
                                onClick={() => void downloadImage(img)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="h-8"
                                onClick={() => void deleteImage(img.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="border-t px-2 py-1 text-xs text-muted-foreground">
                              {img.style} · {img.width}×{img.height}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建图片项目</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>项目名称</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="如：瑜伽垫主图"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ASIN（可选）</Label>
              <Input
                value={newAsin}
                onChange={(e) => setNewAsin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>产品描述（可选）</Label>
              <textarea
                className="border-input bg-background min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              取消
            </Button>
            <Button disabled={creating} onClick={() => void createProject()}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
