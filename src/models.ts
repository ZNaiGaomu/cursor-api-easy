/**
 * Cursor model discovery via GetUsableModels gRPC endpoint.
 * Spawns a Node child for HTTP/2 (Bun's node:http2 is broken).
 * Falls back to a hardcoded list if the endpoint is unreachable.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve as pathResolve } from "node:path";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const DEFAULT_CONTEXT_WINDOW = 200_000;
const DEFAULT_MAX_TOKENS = 64_000;

const HELPER_DIR =
  typeof import.meta.dir === "string"
    ? import.meta.dir
    : pathResolve(
        new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      );
const HELPER_PATH = pathResolve(HELPER_DIR, "models-h2.mjs");

export interface CursorModel {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

/** Expanded fallback if live discovery fails. */
const FALLBACK_MODELS: CursorModel[] = [
  { id: "default", name: "Auto", reasoning: false, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "composer-2.5", name: "Composer 2.5", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "composer-2", name: "Composer 2", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "claude-opus-4-8-thinking-high", name: "Opus 4.8 1M Thinking", reasoning: true, contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "claude-opus-4-8-high", name: "Opus 4.8 1M", reasoning: false, contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "claude-sonnet-5-thinking-high", name: "Sonnet 5 1M Thinking", reasoning: true, contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "claude-sonnet-5-high", name: "Sonnet 5 1M", reasoning: false, contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "claude-4.6-sonnet-medium", name: "Sonnet 4.6 1M", reasoning: false, contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "claude-4.6-sonnet-medium-thinking", name: "Sonnet 4.6 1M Thinking", reasoning: true, contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "claude-4.5-sonnet", name: "Sonnet 4.5", reasoning: false, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "claude-4.5-sonnet-thinking", name: "Sonnet 4.5 Thinking", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "claude-4-sonnet", name: "Sonnet 4", reasoning: false, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "claude-4-sonnet-thinking", name: "Sonnet 4 Thinking", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "claude-4.5-opus-high", name: "Opus 4.5", reasoning: false, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "claude-4.5-opus-high-thinking", name: "Opus 4.5 Thinking", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "gpt-5.4-medium", name: "GPT-5.4 1M", reasoning: true, contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "gpt-5.4-high", name: "GPT-5.4 1M High", reasoning: true, contextWindow: 1_000_000, maxTokens: 64_000 },
  { id: "gpt-5.2", name: "GPT-5.2", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "gpt-5.2-high", name: "GPT-5.2 High", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "gpt-5-mini", name: "GPT-5 Mini", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "gpt-5.3-codex", name: "Codex 5.3", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "gpt-5.3-codex-high", name: "Codex 5.3 High", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "gemini-3-flash", name: "Gemini 3 Flash", reasoning: true, contextWindow: 1_000_000, maxTokens: 65_536 },
  { id: "cursor-grok-4.6-high", name: "Cursor Grok 4.6", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "kimi-k3-high", name: "Kimi K3 High", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
  { id: "glm-5.2-high", name: "GLM 5.2", reasoning: true, contextWindow: 200_000, maxTokens: 64_000 },
];

const CursorModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  reasoning: z.boolean(),
  contextWindow: z.number().int().positive().catch(DEFAULT_CONTEXT_WINDOW),
  maxTokens: z.number().int().positive().catch(DEFAULT_MAX_TOKENS),
});

export interface CursorModelDiscoveryOptions {
  apiKey: string;
  timeoutMs?: number;
}

/**
 * Fetch models from Cursor via a Node HTTP/2 helper process.
 */
export async function fetchCursorUsableModels(
  options: CursorModelDiscoveryOptions,
): Promise<CursorModel[] | null> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  try {
    const { stdout } = await execFileAsync(
      process.execPath.includes("bun") ? "node" : process.execPath,
      [HELPER_PATH, options.apiKey],
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      },
    );

    const parsed = JSON.parse(stdout) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const models: CursorModel[] = [];
    for (const item of parsed) {
      const result = CursorModelSchema.safeParse(item);
      if (result.success) models.push(result.data);
    }
    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
}

/**
 * Get cursor models: try dynamic discovery, fall back to hardcoded list.
 */
export async function getCursorModels(
  apiKey: string,
): Promise<CursorModel[]> {
  const discovered = await fetchCursorUsableModels({ apiKey });
  return discovered && discovered.length > 0 ? discovered : FALLBACK_MODELS;
}
