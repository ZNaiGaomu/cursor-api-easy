#!/usr/bin/env node
/**
 * Node-only HTTP/2 unary helper for GetUsableModels.
 * Bun's node:http2 is broken on some platforms; this is spawned from models.ts.
 *
 * Usage: node models-h2.mjs <accessToken>
 * Prints JSON array of {id,name,reasoning,contextWindow,maxTokens} to stdout.
 */
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { connectHttp2Session, getOptionalProxyUrl } from "./proxy-tunnel.js";
import {
  GetUsableModelsRequestSchema,
  GetUsableModelsResponseSchema,
} from "./proto/agent_pb.js";

const accessToken = process.argv[2] || process.env.CURSOR_ACCESS_TOKEN;
if (!accessToken) {
  console.error("missing access token");
  process.exit(2);
}

const CURSOR_BASE_URL = "https://api2.cursor.sh";
const CURSOR_CLIENT_VERSION = "cli-2026.02.13-41ac335";
const PATH = "/agent.v1.AgentService/GetUsableModels";
const DEFAULT_CONTEXT_WINDOW = 200_000;
const DEFAULT_MAX_TOKENS = 64_000;

const body = Buffer.from(
  toBinary(GetUsableModelsRequestSchema, create(GetUsableModelsRequestSchema, {})),
);

let client;
try {
  client = await connectHttp2Session(CURSOR_BASE_URL);
} catch (err) {
  const via = getOptionalProxyUrl();
  console.error(`connect failed${via ? ` via ${via}` : ""}: ${err?.message || err}`);
  process.exit(1);
}

const timer = setTimeout(() => {
  try {
    client.destroy();
  } catch {}
  console.error("timeout");
  process.exit(1);
}, 20_000);

client.on("error", (err) => {
  clearTimeout(timer);
  console.error(String(err?.message || err));
  process.exit(1);
});

const req = client.request({
  ":method": "POST",
  ":path": PATH,
  "content-type": "application/proto",
  te: "trailers",
  authorization: `Bearer ${accessToken}`,
  "x-ghost-mode": "true",
  "x-cursor-client-version": CURSOR_CLIENT_VERSION,
  "x-cursor-client-type": "cli",
});

const chunks = [];
let status = 0;

req.on("response", (headers) => {
  status = Number(headers[":status"] || 0);
});

req.on("data", (chunk) => {
  chunks.push(chunk);
});

req.on("error", (err) => {
  clearTimeout(timer);
  console.error(String(err?.message || err));
  process.exit(1);
});

req.on("end", () => {
  clearTimeout(timer);
  try {
    client.close();
  } catch {}

  if (status < 200 || status >= 300) {
    console.error(`http ${status}`);
    process.exit(1);
  }

  const buf = Buffer.concat(chunks);
  let decoded;
  try {
    decoded = fromBinary(GetUsableModelsResponseSchema, buf);
  } catch {
    // Try connect-style 5-byte frame
    if (buf.length >= 5) {
      const len = buf.readUInt32BE(1);
      decoded = fromBinary(
        GetUsableModelsResponseSchema,
        buf.subarray(5, 5 + len),
      );
    } else {
      console.error("decode failed");
      process.exit(1);
    }
  }

  const byId = new Map();
  for (const model of decoded.models || []) {
    const id = String(model.modelId || "").trim();
    if (!id) continue;
    const name =
      [model.displayName, model.displayNameShort, model.displayModelId, id]
        .find((v) => typeof v === "string" && v.trim())
        ?.trim() || id;
    byId.set(id, {
      id,
      name,
      reasoning: Boolean(model.thinkingDetails),
      contextWindow: /1m/i.test(id) || /1m/i.test(name) ? 1_000_000 : DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEFAULT_MAX_TOKENS,
    });
  }

  const models = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  process.stdout.write(JSON.stringify(models));
  process.exit(0);
});

req.end(body);
