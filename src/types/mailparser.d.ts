declare module "mailparser" {
  export function simpleParser(
    source: Buffer | string
  ): Promise<{
    messageId?: string;
    inReplyTo?: string;
    references?: string | string[];
    from?: { value?: { address?: string }[]; text?: string };
    to?: { value?: { address?: string }[] };
    subject?: string;
    text?: string;
    html?: string | false;
    date?: Date;
    attachments?: unknown[];
  }>;
}
