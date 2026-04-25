import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_KEYLEN = 64;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();
  if (!email || email.length > 320) {
    return null;
  }

  const basicEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return basicEmailPattern.test(email) ? email : null;
}

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length < 2 || name.length > 80) {
    return null;
  }

  return name;
}

export function normalizePassword(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const password = value.trim();
  if (password.length < 8 || password.length > 128) {
    return null;
  }

  return password;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, HASH_KEYLEN).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) {
    return false;
  }

  const actual = scryptSync(password, salt, HASH_KEYLEN).toString("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
