import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve as pathResolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  authorizeApiKey,
  authFailureStatus,
  createApiKey,
  deleteApiKey,
  extractBearerToken,
  hasAdminPassword,
  listApiKeys,
  setAdminPassword,
  updateApiKey,
  verifyAdminPassword,
} from "./api-keys";
import { ensureConfigDir } from "./paths";

const ADMIN_DIR =
  typeof import.meta.dir === "string"
    ? import.meta.dir
    : pathResolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requireAdmin(req: Request): Response | null {
  const password =
    req.headers.get("x-admin-password") ||
    req.headers.get("X-Admin-Password") ||
    "";
  if (!password || !verifyAdminPassword(password)) {
    return json({ error: "管理员密码错误" }, 401);
  }
  return null;
}

export function unauthorizedFromKey(reason: { status: number; message: string; code: string }) {
  return json(
    { error: { message: reason.message, type: "invalid_request_error", code: reason.code } },
    reason.status,
  );
}

export function protectApiRequest(req: Request) {
  const token = extractBearerToken(req);
  const result = authorizeApiKey(token);
  if (!result.ok) return { ok: false as const, response: unauthorizedFromKey(authFailureStatus(result.reason)) };
  return { ok: true as const, key: result.key };
}

export async function handleAdminRequest(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    const html = readFileSync(pathResolve(ADMIN_DIR, "admin.html"), "utf-8");
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (!url.pathname.startsWith("/admin/api/")) return null;

  if (url.pathname === "/admin/api/setup" && req.method === "POST") {
    if (process.env.ADMIN_PASSWORD?.trim() || hasAdminPassword()) {
      return json({ error: "管理员密码已存在，请直接登录" }, 400);
    }
    const body = (await req.json()) as { password?: string };
    setAdminPassword(body.password || "");
    return json({ ok: true });
  }

  const denied = requireAdmin(req);
  if (denied) return denied;

  if (url.pathname === "/admin/api/keys" && req.method === "GET") {
    return json({ keys: listApiKeys() });
  }

  if (url.pathname === "/admin/api/keys" && req.method === "POST") {
    const body = (await req.json()) as {
      name?: string;
      requestLimit?: number | null;
      expiresAt?: number | null;
      note?: string;
    };
    const created = createApiKey({
      name: body.name || "",
      requestLimit: body.requestLimit,
      expiresAt: body.expiresAt,
      note: body.note,
    });
    return json(created);
  }

  const match = url.pathname.match(/^\/admin\/api\/keys\/([a-f0-9]+)$/i);
  if (match && req.method === "PATCH") {
    const body = (await req.json()) as {
      name?: string;
      enabled?: boolean;
      requestLimit?: number | null;
      expiresAt?: number | null;
      note?: string;
    };
    const updated = updateApiKey(match[1]!, body);
    if (!updated) return json({ error: "Key 不存在" }, 404);
    return json({ record: updated });
  }

  if (match && req.method === "DELETE") {
    const ok = deleteApiKey(match[1]!);
    if (!ok) return json({ error: "Key 不存在" }, 404);
    return json({ ok: true });
  }

  return json({ error: "Not Found" }, 404);
}

export function ensureAdminConfigured(): string | null {
  if (process.env.ADMIN_PASSWORD?.trim()) return null;
  if (hasAdminPassword()) return null;
  const generated = `adm-${randomBytes(9).toString("base64url")}`;
  setAdminPassword(generated);
  writeFileSync(join(ensureConfigDir(), "admin-password.txt"), `${generated}\n`, "utf-8");
  return generated;
}
