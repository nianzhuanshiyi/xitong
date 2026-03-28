"use client";

import type { ListingResultPayload } from "./types";

export async function exportListingToDocx(params: {
  productName: string;
  brandName: string;
  marketplace: string;
  category: string;
  result: ListingResultPayload;
}): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import(
    "docx"
  );

  const { result, productName, brandName, marketplace, category } = params;

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      text: "Amazon Listing 导出",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${brandName} · ${productName}`, bold: true }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun(`站点：${marketplace}    类目：${category}`),
      ],
    }),
    new Paragraph({ text: "标题（3 版）", heading: HeadingLevel.HEADING_1 }),
  ];

  for (let i = 0; i < 3; i++) {
    children.push(
      new Paragraph({
        text: `版本 ${i + 1}（${(result.titles[i] ?? "").length}/200 字符）`,
        heading: HeadingLevel.HEADING_2,
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun(result.titles[i] || "（空）")],
      })
    );
  }

  children.push(
    new Paragraph({ text: "五点描述", heading: HeadingLevel.HEADING_1 })
  );
  result.bullets.forEach((b, i) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${i + 1}. `, bold: true }),
          new TextRun(b || "（空）"),
        ],
      })
    );
  });

  children.push(
    new Paragraph({
      text: "产品描述（HTML）",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [new TextRun(result.productDescriptionHtml || "（空）")],
    }),
    new Paragraph({ text: "后台搜索词", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun(result.searchTerms || "（空）")],
    }),
    new Paragraph({ text: "A+ 文案建议", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: "品牌故事", bold: true })],
    }),
    new Paragraph({ children: [new TextRun(result.aplus.brandStory)] }),
    new Paragraph({
      children: [new TextRun({ text: "产品对比图", bold: true })],
    }),
    new Paragraph({ children: [new TextRun(result.aplus.comparison)] }),
    new Paragraph({
      children: [new TextRun({ text: "使用场景", bold: true })],
    }),
    new Paragraph({ children: [new TextRun(result.aplus.scenarios)] }),
    new Paragraph({ children: [new TextRun({ text: "FAQ", bold: true })] }),
    new Paragraph({ children: [new TextRun(result.aplus.faq)] })
  );

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Listing-${brandName.replace(/\s+/g, "_")}-${Date.now()}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
