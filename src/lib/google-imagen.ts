/**
 * Google Gemini API — Imagen 文生图（REST :predict）
 * @see https://ai.google.dev/gemini-api/docs/imagen
 */

export type ImagenAspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export type ImagenGenerateInput = {
  prompt: string;
  sampleCount: number;
  aspectRatio?: ImagenAspectRatio;
  imageSize?: "1K" | "2K";
  personGeneration?: "dont_allow" | "allow_adult" | "allow_all";
};

function defaultModel(): string {
  return (
    process.env.GOOGLE_IMAGEN_MODEL?.trim() || "imagen-4.0-generate-001"
  );
}

function collectBase64Images(obj: unknown, out: Buffer[]): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "string") {
    if (obj.length > 200 && /^[A-Za-z0-9+/=_-]+$/.test(obj.slice(0, 500))) {
      try {
        out.push(Buffer.from(obj, "base64"));
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) collectBase64Images(x, out);
    return;
  }
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    const b64 =
      o.bytesBase64Encoded ??
      o.bytes_base64_encoded ??
      o.imageBytes ??
      o.image_bytes;
    if (typeof b64 === "string" && b64.length > 100) {
      try {
        out.push(Buffer.from(b64, "base64"));
      } catch {
        /* ignore */
      }
    }
    for (const v of Object.values(o)) collectBase64Images(v, out);
  }
}

export async function imagenPredict(
  apiKey: string,
  input: ImagenGenerateInput
): Promise<{ ok: true; buffers: Buffer[] } | { ok: false; error: string }> {
  const model = defaultModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;

  const sampleCount = Math.min(4, Math.max(1, Math.floor(input.sampleCount)));

  const parameters: Record<string, unknown> = {
    sampleCount,
    aspectRatio: input.aspectRatio ?? "1:1",
  };
  if (input.imageSize) parameters.imageSize = input.imageSize;
  if (input.personGeneration)
    parameters.personGeneration = input.personGeneration;

  const body = {
    instances: [{ prompt: input.prompt }],
    parameters,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 400);
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      /* keep slice */
    }
    return { ok: false, error: msg };
  }

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "Imagen 返回非 JSON" };
  }

  const buffers: Buffer[] = [];
  const root = json as Record<string, unknown>;
  if (Array.isArray(root.predictions))
    collectBase64Images(root.predictions, buffers);
  collectBase64Images(json, buffers);

  const unique: Buffer[] = [];
  const seen = new Set<string>();
  for (const b of buffers) {
    const head = b.slice(0, 16).toString("hex");
    if (seen.has(head)) continue;
    seen.add(head);
    unique.push(b);
  }

  if (unique.length === 0) {
    return {
      ok: false,
      error: "Imagen 未返回可解析的图片数据（可能为区域/权限限制）",
    };
  }

  return { ok: true, buffers: unique.slice(0, sampleCount) };
}
