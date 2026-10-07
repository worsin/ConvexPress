const CHUNK_BYTES = 4 * 1024 * 1024;
type Metadata = { fileName: string; fileSize: number; etag: string; expiresAt: number };
type Dependencies = { backendSiteOrigin: string; fetch: typeof fetch; kind?: "commerce" | "lead-magnet" };
const privateHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
function failure(status: number) { return new Response("Download unavailable. Return to the page where you requested it and try again.", { status, headers: privateHeaders }); }
async function boundedText(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!body) throw Error("Missing response");
  const reader = body.getReader(), parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) throw Error("Oversized response");
      parts.push(part.value);
    }
  } catch (cause) { await reader.cancel(); throw cause; }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(result);
}
function metadata(value: unknown): Metadata {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "etag,expiresAt,fileName,fileSize") throw Error();
  if (!("fileName" in value) || typeof value.fileName !== "string" || value.fileName.length > 2000) throw Error();
  if (!("fileSize" in value) || typeof value.fileSize !== "number" || !Number.isSafeInteger(value.fileSize) || value.fileSize < 0) throw Error();
  if (!("expiresAt" in value) || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) throw Error();
  if (!("etag" in value) || typeof value.etag !== "string" || !/^"[a-f0-9]{64}"$/.test(value.etag)) throw Error();
  return { fileName: value.fileName, fileSize: value.fileSize, expiresAt: value.expiresAt, etag: value.etag };
}
export function downloadInterval(header: string | null, size: number): { offset: number; length: number; partial: boolean } | null {
  if (!header) return { offset: 0, length: size, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length, partial: true };
  }
  const offset = Number(match[1]), end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset) return null;
  return { offset, length: Math.min(end, size - 1) - offset + 1, partial: true };
}
export function attachment(name: string): string {
  const safe = Array.from(name.replace(/[\u0000-\u001f\u007f/\\]/g, "_")).slice(0, 240).join("") || "download";
  const encoded = encodeURIComponent(new TextDecoder().decode(new TextEncoder().encode(safe))).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="download"; filename*=UTF-8''${encoded}`;
}

/** Same-origin, cookie-backed attachment route. The cookie holds a bounded
 * delivery capability; neither cookies nor storage URLs appear in the URL. */
export async function serveDownload(request: Request, leaseId: string, deps: Dependencies): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(leaseId)) return failure(404);
  if (!["GET", "HEAD", "POST"].includes(request.method)) return failure(405);
  const isLeadMagnet = deps.kind === "lead-magnet";
  const routePath = `${isLeadMagnet ? "/api/lead-magnets" : "/api/downloads"}/${leaseId}`;
  const cookieName = `${isLeadMagnet ? "cp_lm_" : "cp_dl_"}${leaseId}`;
  let secret: string | undefined;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return failure(403);
    try {
      const form = new URLSearchParams(await boundedText(request.body, 1024));
      if ([...form.keys()].length !== 1 || form.getAll("secret").length !== 1) return failure(400);
      secret = form.get("secret") ?? undefined;
    } catch { return failure(400); }
  } else {
    secret = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  }
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) return failure(403);
  let endpoint: URL;
  try {
    endpoint = new URL(isLeadMagnet ? "/lead-magnets/downloads/bytes" : "/commerce/downloads/bytes", deps.backendSiteOrigin);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) return failure(503);
  } catch { return failure(503); }
  const proof = { leaseId, secret };
  const call = (body: object, signal = request.signal) => deps.fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...proof, ...body }), redirect: "error", signal });
  let meta: Metadata;
  try {
    const response = await call({ mode: "metadata" });
    if (!response.ok) { await response.body?.cancel(); return failure(response.status === 403 ? 403 : 502); }
    meta = metadata(JSON.parse(await boundedText(response.body, 8192)));
  } catch { return failure(502); }
  if (request.method === "POST") {
    const lifetime = Math.max(1, Math.min(3600, Math.floor((meta.expiresAt - Date.now()) / 1000)));
    const cookie = `${cookieName}=${secret}; Path=${routePath}; Max-Age=${lifetime}; HttpOnly; SameSite=Strict${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
    const jsonClient = request.headers.get("accept") === "application/json";
    return new Response(null, { status: jsonClient ? 204 : 303, headers: { ...privateHeaders, "Set-Cookie": cookie, ...(jsonClient ? {} : { Location: routePath }) } });
  }
  const rangeHeader = request.method === "HEAD" || (request.headers.has("if-range") && request.headers.get("if-range") !== meta.etag) ? null : request.headers.get("range");
  const interval = downloadInterval(rangeHeader, meta.fileSize);
  if (!interval) return new Response(null, { status: 416, headers: { ...privateHeaders, "Content-Range": `bytes */${meta.fileSize}` } });
  const responseHeaders = new Headers({ ...privateHeaders, "Content-Type": "application/octet-stream", "Content-Disposition": attachment(meta.fileName), "Content-Length": String(interval.length), "Accept-Ranges": "bytes", ETag: meta.etag });
  if (interval.partial) responseHeaders.set("Content-Range", `bytes ${interval.offset}-${interval.offset + interval.length - 1}/${meta.fileSize}`);
  if (request.method === "HEAD") return new Response(null, { headers: responseHeaders });

  const controller = new AbortController();
  const abort = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) abort();
  else request.signal.addEventListener("abort", abort, { once: true });
  const cleanup = () => request.signal.removeEventListener("abort", abort);
  const fetchChunk = async (offset: number, length: number) => {
    const response = await call({ mode: "chunk", offset, length }, controller.signal);
    const expectedStatus = meta.fileSize === 0 ? 200 : 206;
    if (response.status !== expectedStatus || response.headers.get("content-length") !== String(length) || (length > 0 && response.headers.get("content-range") !== `bytes ${offset}-${offset + length - 1}/${meta.fileSize}`) || (length > 0 && response.headers.get("etag") !== meta.etag) || (length > 0 && !response.body)) {
      await response.body?.cancel();
      throw Error("Download chunk unavailable");
    }
    return response;
  };
  let offset = interval.offset, remaining = interval.length, chunkLength = Math.min(remaining, CHUNK_BYTES), chunkReceived = 0;
  let first: Response;
  try { first = await fetchChunk(offset, chunkLength); } catch { cleanup(); controller.abort(); return failure(502); }
  if (remaining === 0) { await first.body?.cancel(); cleanup(); return new Response(null, { headers: responseHeaders }); }
  let reader = first.body!.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(output) {
      try {
        for (;;) {
          const part = await reader.read();
          if (!part.done) {
            chunkReceived += part.value.byteLength;
            if (chunkReceived > chunkLength) throw Error("Oversized download chunk");
            output.enqueue(part.value);
            return;
          }
          if (chunkReceived !== chunkLength) throw Error("Incomplete download chunk");
          offset += chunkLength; remaining -= chunkLength;
          if (remaining === 0) { cleanup(); output.close(); return; }
          chunkLength = Math.min(remaining, CHUNK_BYTES); chunkReceived = 0;
          const next = await fetchChunk(offset, chunkLength);
          reader = next.body!.getReader();
        }
      } catch (cause) { cleanup(); controller.abort(); await reader.cancel(); output.error(cause); }
    },
    async cancel(reason) { cleanup(); controller.abort(reason); await reader.cancel(reason); },
  });
  return new Response(stream, { status: interval.partial ? 206 : 200, headers: responseHeaders });
}
