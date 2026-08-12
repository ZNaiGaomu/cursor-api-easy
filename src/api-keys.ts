import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureConfigDir } from "./paths";

const KEYS_FILE = () => join(ensureConfigDir(), "api-keys.json");
const ADMIN_FILE = () => join(ensureConfigDir(), "admin.json");

export interface StoredApiKey {
  id: string;
  name: string;
  keyHash: string;
  token?: string;
  suffix: string;
  enabled: boolean;
  createdAt: number;
  lastUsedAt: number | null;
  requestCount: number;
  requestLimit: number | null;
  expiresAt: number | null;
  note: string;
}

export interface ApiKeyPublic {
  id: string;
  name: string;
  suffix: string;
  token: string | null;
  enabled: boolean;
  createdAt: number;
  lastUsedAt: number | null;
  requestCount: number;
  requestLimit: number | null;
  remaining: number | null;
  expiresAt: number | null;
  note: string;
}

interface KeyFile {
  keys: StoredApiKey[];
}

interface AdminFile {
  passwordHash: string;
  passwordSalt: string;
}

export type KeyAuthFailure =
  | "missing"
  | "invalid"
  | "disabled"
  | "expired"
  | "quota";

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function toPublic(key: StoredApiKey): ApiKeyPublic {
  const remaining =
    key.requestLimit == null
      ? null
      : Math.max(0, key.requestLimit - key.requestCount);
  return {
    id: key.id,
    name: key.name,
    suffix: key.suffix,
    token: key.token || null,
    enabled: key.enabled,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    requestCount: key.requestCount,
    requestLimit: key.requestLimit,
    remaining,
    expiresAt: key.expiresAt,
    note: key.note,
  };
}

export function listApiKeys(): ApiKeyPublic[] {
  const file = readJson<KeyFile>(KEYS_FILE(), { keys: [] });
  return file.keys
    .map(toPublic)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function createApiKey(input: {
  name: string;
  requestLimit?: number | null;
  expiresAt?: number | null;
  note?: string;
}): { key: string; record: ApiKeyPublic } {
  const name = input.name.trim();
  if (!name) throw new Error("名称不能为空");
  const raw = `sk-${randomBytes(24).toString("base64url")}`;
  const record: StoredApiKey = {
    id: randomBytes(8).toString("hex"),
    name,
    keyHash: hashApiKey(raw),
    token: raw,
    suffix: raw.slice(-4),
    enabled: true,
    createdAt: Date.now(),
    lastUsedAt: null,
    requestCount: 0,
    requestLimit:
      typeof input.requestLimit === "number" && input.requestLimit > 0
        ? Math.floor(input.requestLimit)
        : null,
    expiresAt:
      typeof input.expiresAt === "number" && input.expiresAt > 0
        ? input.expiresAt
        : null,
    note: input.note?.trim() ?? "",
  };
  const file = readJson<KeyFile>(KEYS_FILE(), { keys: [] });
  writeJson(KEYS_FILE(), { keys: [...file.keys, record] });
  return { key: raw, record: toPublic(record) };
}

export function updateApiKey(
  id: string,
  patch: Partial<Pick<StoredApiKey, "name" | "enabled" | "requestLimit" | "expiresAt" | "note">>,
): ApiKeyPublic | null {
  const file = readJson<KeyFile>(KEYS_FILE(), { keys: [] });
  const index = file.keys.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = file.keys[index]!;
  const next: StoredApiKey = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() || current.name : current.name,
    enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
    requestLimit:
      patch.requestLimit === undefined
        ? current.requestLimit
        : patch.requestLimit && patch.requestLimit > 0
          ? Math.floor(patch.requestLimit)
          : null,
    expiresAt:
      patch.expiresAt === undefined
        ? current.expiresAt
        : patch.expiresAt && patch.expiresAt > 0
          ? patch.expiresAt
          : null,
    note: patch.note !== undefined ? patch.note.trim() : current.note,
  };
  const keys = file.keys.map((item, i) => (i === index ? next : item));
  writeJson(KEYS_FILE(), { keys });
  return toPublic(next);
}

export function deleteApiKey(id: string): boolean {
  const file = readJson<KeyFile>(KEYS_FILE(), { keys: [] });
  const keys = file.keys.filter((item) => item.id !== id);
  if (keys.length === file.keys.length) return false;
  writeJson(KEYS_FILE(), { keys });
  return true;
}

export function authorizeApiKey(
  raw: string | null,
): { ok: true; key: StoredApiKey } | { ok: false; reason: KeyAuthFailure } {
  if (!raw) return { ok: false, reason: "missing" };
  const hash = hashApiKey(raw);
  const file = readJson<KeyFile>(KEYS_FILE(), { keys: [] });
  const found = file.keys.find((item) => item.keyHash === hash);
  if (!found) return { ok: false, reason: "invalid" };
  if (!found.enabled) return { ok: false, reason: "disabled" };
  if (found.expiresAt && found.expiresAt <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (found.requestLimit != null && found.requestCount >= found.requestLimit) {
    return { ok: false, reason: "quota" };
  }
  return { ok: true, key: found };
}

export function touchApiKey(id: string): void {
  const file = readJson<KeyFile>(KEYS_FILE(), { keys: [] });
  const keys = file.keys.map((item) =>
    item.id === id
      ? { ...item, lastUsedAt: Date.now(), requestCount: item.requestCount + 1 }
      : item,
  );
  writeJson(KEYS_FILE(), { keys });
}

export function hasAdminPassword(): boolean {
  const file = readJson<AdminFile | Record<string, never>>(ADMIN_FILE(), {});
  return Boolean(file && "passwordHash" in file && file.passwordHash);
}

export function setAdminPassword(password: string): void {
  const trimmed = password.trim();
  if (trimmed.length < 6) throw new Error("管理员密码至少 6 位");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(trimmed, salt, 32).toString("hex");
  writeJson(ADMIN_FILE(), { passwordHash, passwordSalt: salt });
}

export function verifyAdminPassword(password: string): boolean {
  const envPassword = process.env.ADMIN_PASSWORD?.trim();
  if (envPassword) {
    const left = Buffer.from(password);
    const right = Buffer.from(envPassword);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
  const file = readJson<AdminFile | Record<string, never>>(ADMIN_FILE(), {});
  if (!file || !("passwordHash" in file) || !file.passwordSalt) return false;
  const computed = scryptSync(password, file.passwordSalt, 32);
  const expected = Buffer.from(file.passwordHash, "hex");
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

export function authFailureStatus(reason: KeyAuthFailure): { status: number; message: string; code: string } {
  switch (reason) {
    case "missing":
      return { status: 401, code: "missing_api_key", message: "Missing API key. Use Authorization: Bearer <key>." };
    case "invalid":
      return { status: 401, code: "invalid_api_key", message: "Invalid API key." };
    case "disabled":
      return { status: 403, code: "key_disabled", message: "This API key has been disabled." };
    case "expired":
      return { status: 403, code: "key_expired", message: "This API key has expired." };
    case "quota":
      return { status: 429, code: "quota_exceeded", message: "This API key has reached its request quota." };
  }
}
