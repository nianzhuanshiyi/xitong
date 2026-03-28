export const SUPPLIER_STATUS_LABEL: Record<string, string> = {
  COOPERATING: "已合作",
  EVALUATING: "评估中",
  CANDIDATE: "备选",
  REJECTED: "已淘汰",
};

export const FILE_CATEGORY_LABEL: Record<string, string> = {
  CATALOG: "📋 产品目录",
  PRICE_LIST: "💰 报价单",
  TEST_REPORT: "🧪 检测报告",
  CERTIFICATION: "📜 资质证书",
  CONTRACT: "🤝 合同协议",
  PACKAGING: "📦 包装方案",
  PRODUCT_IMAGE: "🖼️ 产品图片",
  OTHER: "📄 其他资料",
};

export function countryFlag(code: string | null | undefined) {
  if (code === "US") return "🇺🇸";
  if (code === "KR") return "🇰🇷";
  if (code === "CN") return "🇨🇳";
  return "🌐";
}
