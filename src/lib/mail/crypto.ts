import crypto from "crypto";

/**
 * 简单 AES-256-GCM 加解密，用于邮箱密码存储。
 * 密钥来自 MAIL_ENCRYPTION_KEY 环境变量（32 字节 hex）或回退到 NEXTAUTH_SECRET 的 SHA-256。
 */

function getKey(): Buffer {
  const explicit = process.env.MAIL_ENCRYPTION_KEY?.trim();
  if (explicit && explicit.length >= 32) {
    return Buffer.from(explicit.slice(0, 32), "utf-8");
  }
  const secret = process.env.NEXTAUTH_SECRET ?? "fallback-mail-key";
  return crypto.createHash("sha256").update(secret).digest();
}

/** 加密：返回 `iv:authTag:ciphertext` 三段 hex */
export function encryptPassword(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** 解密 */
export function decryptPassword(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted password format");
  }
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const data = Buffer.from(parts[2], "hex");
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf-8") + decipher.final("utf-8");
}
