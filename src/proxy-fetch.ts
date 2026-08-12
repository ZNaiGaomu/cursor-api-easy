/**
 * HTTPS fetch. Uses HTTPS_PROXY / HTTP_PROXY / ALL_PROXY when set; otherwise direct.
 */
import https from "node:https";
import {
  connectThroughHttpProxy,
  getOptionalProxyUrl,
} from "./proxy-tunnel";

export { getOptionalProxyUrl, getRequiredProxyUrl } from "./proxy-tunnel";

export async function fetchThroughProxy(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const proxyUrl = getOptionalProxyUrl();
  if (!proxyUrl) {
    return fetch(url, init);
  }

  const target = new URL(url);
  if (target.protocol !== "https:") {
    throw new Error(`Only https URLs are allowed through the proxy (got ${target.protocol})`);
  }

  const socket = await connectThroughHttpProxy(target.hostname, 443, proxyUrl);

  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    Host: target.host,
  };
  if (init.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => {
      headers[key] = value;
    });
  }

  const body =
    typeof init.body === "string"
      ? init.body
      : init.body
        ? String(init.body)
        : undefined;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: target.hostname,
        port: 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        servername: target.hostname,
        createConnection: () => socket,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const outHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") outHeaders.set(key, value);
            else if (Array.isArray(value)) outHeaders.set(key, value.join(", "));
          }
          resolve(new Response(buf, { status: res.statusCode ?? 0, headers: outHeaders }));
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
