/** 回复/转发时在正文末尾附加原信引用（英文块） */
export function buildOriginalMessageQuote(input: {
  fromAddress: string;
  toAddress: string;
  receivedAt: Date;
  subject: string;
  bodyText: string;
  maxBodyChars?: number;
}): string {
  const max = input.maxBodyChars ?? 12_000;
  const when = input.receivedAt.toUTCString();
  const body = input.bodyText.length > max
    ? `${input.bodyText.slice(0, max)}\n\n[…truncated]`
    : input.bodyText;
  return [
    "",
    "----- Original message -----",
    `From: ${input.fromAddress}`,
    `To: ${input.toAddress}`,
    `Date: ${when}`,
    `Subject: ${input.subject}`,
    "",
    body,
  ].join("\n");
}

export function replySubject(subject: string): string {
  const t = subject.trim();
  if (/^re:\s/i.test(t)) return t;
  return `Re: ${t}`;
}

export function forwardSubject(subject: string): string {
  const t = subject.trim();
  if (/^fwd:\s/i.test(t)) return t;
  return `Fwd: ${t}`;
}
