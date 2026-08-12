/**
 * Cursor OAuth authentication for standalone CLI.
 * Handles PKCE-based login, polling, token refresh, and file-based storage.
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { exec } from "node:child_process";
import {
  generateCursorAuthParams,
  pollCursorAuth,
  refreshCursorToken as refreshToken,
  getTokenExpiry,
  type CursorCredentials,
} from "./auth";
import { ensureConfigDir } from "./paths";

const CREDENTIALS_FILE = () => join(ensureConfigDir(), "credentials.json");

export interface StoredCredentials {
  access: string;
  refresh: string;
  expires: number;
}

export function getStoredCredentials(): StoredCredentials | null {
  try {
    ensureConfigDir();
    const data = readFileSync(CREDENTIALS_FILE(), "utf-8");
    const creds = JSON.parse(data) as StoredCredentials;
    if (!creds.access || !creds.refresh || !creds.expires) {
      return null;
    }
    return creds;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: CursorCredentials): void {
  ensureConfigDir();
  writeFileSync(
    CREDENTIALS_FILE(),
    JSON.stringify({
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
    }, null, 2)
  );
}

export function clearCredentials(): void {
  try {
    unlinkSync(CREDENTIALS_FILE());
  } catch {}
}

export function isAuthenticated(): boolean {
  const creds = getStoredCredentials();
  if (!creds) return false;
  return creds.expires > Date.now();
}

function openBrowser(url: string) {
  try {
    if (process.platform === "win32") {
      exec(`cmd /c start "" "${url.replace(/"/g, "")}"`);
    } else if (process.platform === "darwin") {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  } catch {}
}

export async function login(): Promise<{ accessToken: string; refreshToken: string }> {
  const { verifier, challenge, uuid, loginUrl } = await generateCursorAuthParams();

  console.log("📋 Opening browser for login...\n");
  console.log(`   If browser doesn't open, visit:`);
  console.log(`   ${loginUrl}\n`);

  openBrowser(loginUrl);

  console.log("⏳ Waiting for authentication...\n");

  const result = await pollCursorAuth(uuid, verifier);

  const credentials: CursorCredentials = {
    access: result.accessToken,
    refresh: result.refreshToken,
    expires: getTokenExpiry(result.accessToken),
  };

  saveCredentials(credentials);

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}

export function logout(): void {
  clearCredentials();
}

export async function refreshCursorToken(refreshTokenVal: string): Promise<CursorCredentials> {
  return refreshToken(refreshTokenVal);
}

export { getTokenExpiry };
