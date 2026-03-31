/**
 * Call Claude API with a PDF document using native PDF support.
 * Claude reads the PDF directly — no pdf-parse needed.
 */
export async function callClaudeWithPdf(
  pdfBase64: string,
  systemPrompt: string,
  userPrompt: string,
  model: string = "claude-sonnet-4-20250514"
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("Claude API Key 未配置");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[CLAUDE-PDF] Error:", response.status, err.slice(0, 500));
    throw new Error(`Claude API 错误: ${response.status}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return (
    data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") || ""
  );
}

/**
 * Call Claude with PDF and parse the response as JSON.
 * Strips markdown fences and extracts JSON object.
 */
export async function callClaudeWithPdfJson<T = Record<string, unknown>>(
  pdfBase64: string,
  systemPrompt: string,
  userPrompt: string,
  model?: string
): Promise<T | null> {
  const raw = await callClaudeWithPdf(pdfBase64, systemPrompt, userPrompt, model);
  if (!raw.trim()) return null;

  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[CLAUDE-PDF] No JSON found in response:", raw.slice(0, 500));
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    console.error("[CLAUDE-PDF] JSON parse failed:", jsonMatch[0].slice(0, 500));
    return null;
  }
}
