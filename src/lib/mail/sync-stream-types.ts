/** 与 IMAP 同步 NDJSON 流一致，供客户端解析（勿从此文件 import 服务端模块） */
export type MailSyncStreamEvent =
  | { phase: "connect"; message: string }
  | {
      phase: "fetch";
      message: string;
      current?: number;
      total?: number;
    }
  | { phase: "ai"; message: string; current: number; total: number }
  | {
      phase: "done";
      imported: number;
      /** AI 摘要成功写入 */
      analyzed: number;
      /** 无正文 / 过短，未调用 Claude */
      aiSkipped?: number;
      /** Claude 或入库失败 */
      aiFailed?: number;
      note?: string;
      message?: string;
    }
  | { phase: "error"; message: string; stack?: string };
