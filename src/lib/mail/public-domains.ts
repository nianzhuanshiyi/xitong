/** 公共邮箱域名：不按域名自动归入供应商 */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "qq.com",
  "163.com",
  "126.com",
  "foxmail.com",
  "icloud.com",
  "live.com",
  "aol.com",
  "yeah.net",
  "sina.com",
]);

export function extractDomainFromAddress(addr: string): string | null {
  const m = addr.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export function isPublicEmailDomain(domain: string | null): boolean {
  if (!domain) return true;
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}
