import { createServer, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

export type WebsiteEditingBridge = { endpoint: string; key: string; expiresAt: number };

/** An explicit website launch may request only another one-use handoff from
 * its owning desktop window. This listener exposes no generic IPC or tokens. */
export async function startWebsiteEditingBridge(options: {
  siteUrl: string;
  renew: () => Promise<string>;
  onClose?: () => void;
  lifetimeMs?: number;
  requestTimeoutMs?: number;
}) {
  const site = new URL(options.siteUrl);
  if (site.username || site.password || (site.protocol !== "https:" && !(site.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname)))) throw Error("Invalid website editing origin");
  const key = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + Math.min(options.lifetimeMs ?? 8 * 60 * 60_000, 8 * 60 * 60_000);
  let closed = false, busy = false, nextRenewAt = 0, host = "", timer: ReturnType<typeof setTimeout> | undefined;
  const responses = new Set<ServerResponse>();
  const close = () => {
    if (closed) return;
    closed = true; if (timer) clearTimeout(timer);
    for (const response of responses) {
      if (!response.headersSent && !response.destroyed) { response.writeHead(410); response.end(JSON.stringify({ error: "Desktop editing connection closed" })); }
    }
    server.close(); server.closeIdleConnections();
    // Flush the refusal before terminating any remaining incomplete requests.
    setTimeout(() => server.closeAllConnections(), 25).unref();
    options.onClose?.();
  };
  const server = createServer(async (request, response) => {
    responses.add(response);
    response.once("close", () => responses.delete(response));
    const reply = (status: number, value: unknown) => {
      if (!response.destroyed) { response.writeHead(status); response.end(JSON.stringify(value)); }
    };
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Vary", "Origin");
    if (request.headers.host !== host || request.url !== "/convexpress/website-editing" || request.headers.origin !== site.origin) { reply(403, { error: "Website editing connection refused" }); return; }
    response.setHeader("Access-Control-Allow-Origin", site.origin);
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setHeader("Access-Control-Allow-Private-Network", "true");
      reply(204, null); return;
    }
    if (request.method !== "POST" || request.headers["content-type"]?.split(";")[0].trim() !== "application/json") { reply(405, { error: "Invalid editing request" }); return; }
    let body: { key?: unknown; action?: unknown };
    try {
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk); length += bytes.length;
        if (length > 1024) { reply(413, { error: "Editing request too large" }); return; }
        chunks.push(bytes);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!body || typeof body !== "object" || typeof body.key !== "string" || !/^[a-f0-9]{64}$/.test(body.key) || !timingSafeEqual(Buffer.from(key), Buffer.from(body.key))) throw Error();
    } catch { reply(403, { error: "Website editing connection refused" }); return; }
    if (closed || Date.now() >= expiresAt) { reply(410, { error: "Reopen website editing from ConvexPress" }); return; }
    if (body.action === "end") { response.once("finish", close); reply(200, { ended: true }); return; }
    if (body.action !== "renew") { reply(400, { error: "Invalid editing request" }); return; }
    if (busy) { reply(409, { error: "An editing renewal is already pending" }); return; }
    if (Date.now() < nextRenewAt) { response.setHeader("Retry-After", "5"); reply(429, { error: "Retry editing renewal shortly" }); return; }
    busy = true;
    nextRenewAt = Date.now() + 5000;
    const work = Promise.resolve().then(options.renew);
    // A timeout does not cancel the broker operation. Keep its slot occupied
    // until it settles, so repeated timeouts cannot accumulate mint requests.
    void work.finally(() => { busy = false; }).catch(() => {});
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        work,
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error()), options.requestTimeoutMs ?? 20_000); }),
      ]);
      if (closed || Date.now() >= expiresAt) return;
      const link = new URL(result);
      const code = new URLSearchParams(link.hash.slice(1)).get("cp-customize");
      if (link.origin !== site.origin || link.username || link.password || !code || !/^[a-f0-9]{64}$/.test(code)) throw Error();
      reply(200, { code });
    } catch { if (!closed) reply(403, { error: "Desktop authorization could not be renewed" }); }
    finally { if (timeout) clearTimeout(timeout); }
  });
  server.headersTimeout = 5000; server.requestTimeout = 5000; server.maxConnections = 8;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); server.on("error", close); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") { close(); throw Error("Desktop editing connection unavailable"); }
  host = `127.0.0.1:${address.port}`;
  timer = setTimeout(close, Math.max(1, expiresAt - Date.now())); timer.unref();
  return { descriptor: { endpoint: `http://${host}/convexpress/website-editing`, key, expiresAt } satisfies WebsiteEditingBridge, close };
}
