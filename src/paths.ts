import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function getConfigDir(): string {
  return join(
    process.env.HOME || process.env.USERPROFILE || homedir(),
    ".config",
    "cursor-openai-api",
  );
}

export function ensureConfigDir(): string {
  const dir = getConfigDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
}
