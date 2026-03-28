export function mailUiMock(): boolean {
  const v = process.env.MAIL_UI_MOCK?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function mailEnvConfigured(): {
  imap: boolean;
  smtp: boolean;
} {
  return {
    imap: Boolean(
      process.env.IMAP_HOST?.trim() &&
        process.env.EMAIL_USER?.trim() &&
        process.env.EMAIL_AUTH_CODE?.trim()
    ),
    smtp: Boolean(
      process.env.SMTP_HOST?.trim() &&
        process.env.EMAIL_USER?.trim() &&
        process.env.EMAIL_AUTH_CODE?.trim()
    ),
  };
}
