import type { BundleSlot } from "./types";

/** 亚马逊 7 张图默认策略（新建项目兜底；可被 Claude 覆盖） */
export const DEFAULT_AMAZON_BUNDLE: BundleSlot[] = [
  {
    slot: 0,
    title: "图1 主图",
    imageType: "MAIN_WHITE",
    hintZh: "白底产品正面图，符合亚马逊主图规范",
  },
  {
    slot: 1,
    title: "图2 卖点",
    imageType: "INFOGRAPHIC",
    hintZh: "核心卖点信息图，图文结合",
  },
  {
    slot: 2,
    title: "图3 场景/模特",
    imageType: "LIFESTYLE",
    hintZh: "场景使用图或模特使用图",
  },
  {
    slot: 3,
    title: "图4 细节",
    imageType: "MAIN_WHITE",
    hintZh: "产品细节特写（可改用白底或微距）",
  },
  {
    slot: 4,
    title: "图5 尺寸/配件",
    imageType: "SIZE_COMPARE",
    hintZh: "尺寸对比图或包装配件全家福",
  },
  {
    slot: 5,
    title: "图6 对比/场景2",
    imageType: "BEFORE_AFTER",
    hintZh: "前后对比或第二套使用场景",
  },
  {
    slot: 6,
    title: "图7 包装/品牌",
    imageType: "PACKAGING",
    hintZh: "包装展示或 A+ 品牌故事氛围图",
  },
];
