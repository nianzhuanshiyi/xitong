import prisma from "@/lib/prisma";

async function getPerplexityKey(): Promise<string | null> {
  try {
    const row = await prisma.systemSetting.findFirst({
      where: { key: "perplexity_api_key" },
    });
    return row?.value || null;
  } catch {
    return null;
  }
}

export async function perplexitySearch(query: string): Promise<string> {
  const apiKey = (await getPerplexityKey()) || process.env.PERPLEXITY_API_KEY || null;

  if (!apiKey) {
    return "未配置 Perplexity API Key，无法进行实时搜索。请在设置中配置 PERPLEXITY_API_KEY。";
  }

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "你是一个搜索助手。请用中文返回搜索结果，保持简洁但信息完整。包含关键数据、日期和来源。"
          },
          { role: "user", content: query }
        ],
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[perplexity] API error:", res.status, errText);
      return `搜索请求失败 (${res.status})`;
    }

    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || "未获取到搜索结果";
    const citations = data.citations;

    let result = answer;
    if (citations && citations.length > 0) {
      result += "\n\n参考来源：\n" + citations.map((url: string, i: number) => `${i + 1}. ${url}`).join("\n");
    }
    return result;
  } catch (err) {
    console.error("[perplexity] error:", err);
    return `搜索失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}
