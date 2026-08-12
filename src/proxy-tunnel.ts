/**
 * Optional HTTP/SOCKS proxy for Cursor egress.
 * Set HTTPS_PROXY / HTTP_PROXY / ALL_PROXY to enable. Unset = direct connect.
 */
import net from "node:net";
import tls from "node:tls";
import http2 from "node:http2";
import type { Socket } from "node:net";
import type { ClientHttp2Session } from "node:http2";

export function getOptionalProxyUrl(): string | null {
  const value =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    "";
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** @deprecated use getOptionalProxyUrl */
export function getRequiredProxyUrl(): string | null {
  return getOptionalProxyUrl();
}

function parseProxy(proxyUrl: string): { host: string; port: number; kind: "http" | "socks5" } {
  const parsed = new URL(proxyUrl);
  const protocol = parsed.protocol.replace(/:$/, "");
  if (protocol === "socks5" || protocol === "socks5h" || protocol === "socks") {
    return { host: parsed.hostname, port: Number(parsed.port || 1080), kind: "socks5" };
  }
  if (protocol !== "http" && protocol !== "https") {
    throw new Error(
      `Unsupported proxy protocol ${parsed.protocol}. Use http://127.0.0.1:PORT or socks5h://127.0.0.1:PORT`,
    );
  }
  return {
    host: parsed.hostname,
    port: Number(parsed.port || (protocol === "https" ? 443 : 80)),
    kind: "http",
  };
}

function readExactFromSocket(socket: Socket, n: number, timeoutMs = 10_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let acc = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      acc = Buffer.concat([acc, chunk]);
      if (acc.length >= n) {
        cleanup();
        const extra = acc.subarray(n);
        if (extra.length > 0) socket.unshift(extra);
        resolve(acc.subarray(0, n));
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("proxy read timeout"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onErr);
    };
    socket.on("data", onData);
    socket.on("error", onErr);
  });
}

async function connectThroughSocks5(
  targetHost: string,
  targetPort: number,
  proxyHost: string,
  proxyPort: number,
): Promise<Socket> {
  const socket = await new Promise<Socket>((resolve, reject) => {
    const s = net.connect({ host: proxyHost, port: proxyPort });
    const onErr = (err: Error) => {
      try {
        s.destroy();
      } catch {}
      reject(err);
    };
    s.setTimeout(15_000, () => {
      s.destroy();
      reject(new Error(`SOCKS5 ${proxyHost}:${proxyPort} timed out (is 7890 running?)`));
    });
    s.once("error", onErr);
    s.once("connect", () => {
      s.setTimeout(0);
      s.removeListener("error", onErr);
      resolve(s);
    });
  });

  socket.write(Buffer.from([0x05, 0x01, 0x00]));
  const greet = await readExactFromSocket(socket, 2);
  if (greet[0] !== 0x05 || greet[1] !== 0x00) {
    socket.destroy();
    throw new Error(`SOCKS5 greeting rejected (${greet[0]},${greet[1]})`);
  }

  const hostBuf = Buffer.from(targetHost, "utf8");
  const req = Buffer.alloc(7 + hostBuf.length);
  req[0] = 0x05;
  req[1] = 0x01;
  req[2] = 0x00;
  req[3] = 0x03;
  req[4] = hostBuf.length;
  hostBuf.copy(req, 5);
  req.writeUInt16BE(targetPort, 5 + hostBuf.length);
  socket.write(req);

  const head = await readExactFromSocket(socket, 4);
  if (head[0] !== 0x05 || head[1] !== 0x00) {
    socket.destroy();
    throw new Error(`SOCKS5 CONNECT failed (rep=${head[1]})`);
  }
  const atyp = head[3];
  if (atyp === 0x01) await readExactFromSocket(socket, 6);
  else if (atyp === 0x04) await readExactFromSocket(socket, 18);
  else if (atyp === 0x03) {
    const lenBuf = await readExactFromSocket(socket, 1);
    await readExactFromSocket(socket, lenBuf[0]! + 2);
  } else {
    socket.destroy();
    throw new Error(`SOCKS5 unknown atyp ${atyp}`);
  }
  return socket;
}

function connectViaHttpConnect(
  targetHost: string,
  targetPort: number,
  proxyHost: string,
  proxyPort: number,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = net.connect({ host: proxyHost, port: proxyPort });
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const succeed = (value: Socket) => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      socket.removeListener("error", fail);
      resolve(value);
    };

    socket.setTimeout(15_000, () => {
      fail(new Error(`Proxy ${proxyHost}:${proxyPort} timed out (is 7890 running?)`));
    });
    socket.once("error", fail);
    socket.once("connect", () => {
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
          `Host: ${targetHost}:${targetPort}\r\n` +
          `Proxy-Connection: Keep-Alive\r\n\r\n`,
      );
    });

    let acc = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      acc = Buffer.concat([acc, chunk]);
      const headerEnd = acc.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        if (acc.length > 16_384) fail(new Error("Proxy CONNECT response too large"));
        return;
      }
      socket.removeListener("data", onData);
      const header = acc.subarray(0, headerEnd).toString("utf8");
      const leftover = acc.subarray(headerEnd + 4);
      const statusLine = header.split("\r\n")[0] || "";
      if (!/^HTTP\/1\.[01] 200\b/i.test(statusLine)) {
        fail(new Error(`Proxy CONNECT failed: ${statusLine}`));
        return;
      }
      if (leftover.length > 0) socket.unshift(leftover);
      succeed(socket);
    };
    socket.on("data", onData);
  });
}

export async function connectThroughHttpProxy(
  targetHost: string,
  targetPort: number,
  proxyUrl = getOptionalProxyUrl(),
): Promise<Socket> {
  if (!proxyUrl) {
    throw new Error("No HTTPS_PROXY / HTTP_PROXY / ALL_PROXY is set");
  }
  const proxy = parseProxy(proxyUrl);
  const errors: string[] = [];

  const trySocks = async () =>
    connectThroughSocks5(targetHost, targetPort, proxy.host, proxy.port);
  const tryHttp = async () =>
    connectViaHttpConnect(targetHost, targetPort, proxy.host, proxy.port);

  const order = proxy.kind === "socks5" ? [trySocks, tryHttp] : [tryHttp, trySocks];
  for (const attempt of order) {
    try {
      return await attempt();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(
    `Local proxy ${proxy.host}:${proxy.port} failed (${errors.join(" | ")}). No direct fallback.`,
  );
}

export async function connectHttp2Session(
  targetUrl: string,
): Promise<ClientHttp2Session> {
  const proxy = getOptionalProxyUrl();
  if (proxy) return connectHttp2ThroughProxy(targetUrl, proxy);
  return http2.connect(targetUrl);
}

export async function connectHttp2ThroughProxy(
  targetUrl: string,
  proxyUrl = getOptionalProxyUrl(),
): Promise<ClientHttp2Session> {
  if (!proxyUrl) {
    throw new Error("No HTTPS_PROXY / HTTP_PROXY / ALL_PROXY is set");
  }
  const target = new URL(targetUrl);
  const host = target.hostname;
  const port = Number(target.port || 443);
  const socket = await connectThroughHttpProxy(host, port, proxyUrl);

  const tlsSocket = tls.connect({
    socket,
    servername: host,
    ALPNProtocols: ["h2", "http/1.1"],
  });

  await new Promise<void>((resolve, reject) => {
    const onErr = (err: Error) => reject(err);
    tlsSocket.once("error", onErr);
    tlsSocket.once("secureConnect", () => {
      tlsSocket.removeListener("error", onErr);
      resolve();
    });
  });

  const alpn = tlsSocket.alpnProtocol;
  if (alpn !== "h2") {
    try {
      tlsSocket.destroy();
    } catch {}
    throw new Error(`Proxy TLS ALPN was ${alpn || "none"}, expected h2`);
  }

  return http2.connect(target.origin, {
    createConnection: () => tlsSocket,
  });
}
