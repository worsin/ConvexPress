import type { LeaseProof, LeaseRead } from "./delivery";

export const DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
type Dependencies = {
  authorize(proof: LeaseProof & { requestTime: number }): Promise<LeaseRead>;
  start(proof: LeaseProof): Promise<unknown>;
  fetch: typeof fetch;
};
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
function error(status: number) { return new Response("Download unavailable", { status, headers }); }
async function input(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw Error();
  const reader = request.body?.getReader();
  if (!reader) throw Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2048) throw Error();
      chunks.push(part.value);
    }
  } catch (cause) { await reader.cancel(); throw cause; }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(data));
}
function parse(value: unknown): (LeaseProof & ({ mode: "metadata" } | { mode: "chunk"; offset: number; length: number })) | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!("leaseId" in value) || typeof value.leaseId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.leaseId)) return null;
  if (!("secret" in value) || typeof value.secret !== "string" || !/^[a-f0-9]{64}$/.test(value.secret)) return null;
  if (!("mode" in value)) return null;
  const proof = { leaseId: value.leaseId, secret: value.secret };
  if (value.mode === "metadata" && Object.keys(value).every(key => ["mode", "leaseId", "secret"].includes(key))) return { ...proof, mode: "metadata" };
  if (value.mode !== "chunk" || !Object.keys(value).every(key => ["mode", "leaseId", "secret", "offset", "length"].includes(key))) return null;
  if (!("offset" in value) || typeof value.offset !== "number" || !Number.isSafeInteger(value.offset) || value.offset < 0) return null;
  if (!("length" in value) || typeof value.length !== "number" || !Number.isSafeInteger(value.length) || value.length < 0 || value.length > DOWNLOAD_CHUNK_BYTES) return null;
  return { ...proof, mode: "chunk", offset: value.offset, length: value.length };
}

/** Restricts each Convex response to one verified range. The Website assembles
 * ranges as a stream, so total file size is independent of this response bound. */
export async function handleDownloadBytes(request: Request, deps: Dependencies): Promise<Response> {
  if (request.method !== "POST") return error(405);
  let body: ReturnType<typeof parse>;
  try { body = parse(await input(request)); } catch { return error(400); }
  if (!body) return error(400);
  const proof = { leaseId: body.leaseId, secret: body.secret };
  let lease: LeaseRead;
  try { lease = await deps.authorize({ ...proof, requestTime: Date.now() }); } catch { return error(403); }
  if (body.mode === "metadata") {
    // An explicit projection prevents the internal storage URL escaping.
    return Response.json({ fileName: lease.fileName, fileSize: lease.fileSize, etag: lease.etag, expiresAt: lease.expiresAt }, { headers });
  }
  if (body.offset > lease.fileSize || body.length > lease.fileSize - body.offset || (body.length === 0 && lease.fileSize !== 0)) return error(416);
  if (lease.fileSize === 0) {
    try { await deps.start(proof); } catch { return error(403); }
    return new Response(null, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": "0" } });
  }
  const end = body.offset + body.length - 1;
  const expectedRange = `bytes ${body.offset}-${end}/${lease.fileSize}`;
  let upstream: Response;
  try { upstream = await deps.fetch(lease.url, { headers: { Range: `bytes=${body.offset}-${end}`, "Accept-Encoding": "identity" }, redirect: "error", signal: request.signal }); } catch { return error(502); }
  if (upstream.status !== 206 || upstream.headers.get("content-range") !== expectedRange || upstream.headers.get("content-length") !== String(body.length) || ![null, "identity"].includes(upstream.headers.get("content-encoding")) || !upstream.body) {
    await upstream.body?.cancel();
    return error(502);
  }
  try { await deps.start(proof); } catch { await upstream.body.cancel(); return error(403); }
  const reader = upstream.body.getReader();
  const expectedLength = body.length;
  let received = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          if (received !== expectedLength) throw Error("Incomplete download chunk");
          controller.close();
          return;
        }
        received += next.value.byteLength;
        if (received > expectedLength) throw Error("Oversized download chunk");
        controller.enqueue(next.value);
      } catch (cause) { await reader.cancel(); controller.error(cause); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(stream, { status: 206, headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(expectedLength), "Content-Range": expectedRange, "Accept-Ranges": "bytes", ETag: lease.etag } });
}
