import { expect, test } from "bun:test";
import { serveDownload, downloadInterval } from "./serve";
const leaseId = "lease_test", secret = "a".repeat(64), etag = `"${"b".repeat(64)}"`;
const url = `https://shop.invalid/api/downloads/${leaseId}`;
function fixture(size = 29 * 1024 * 1024 + 19, failAt?: number) {
  const calls: Array<{ offset: number; length: number }> = [];
  let signal: AbortSignal | null | undefined;
  const deps = {
    backendSiteOrigin: "https://backend.invalid",
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://backend.invalid/commerce/downloads/bytes");
      if (typeof init?.body !== "string") throw Error("Expected JSON request");
      const args = JSON.parse(init.body);
      expect(args.secret).toBe(secret);
      expect(args.leaseId).toBe(leaseId);
      if (args.mode === "metadata") return Response.json({ fileName: "Installer ' deluxe.zip", fileSize: size, etag, expiresAt: Date.now() + 60000 });
      signal = init.signal;
      calls.push({ offset: args.offset, length: args.length });
      if (failAt !== undefined && calls.length === failAt) return new Response("Unavailable", { status: 403 });
      expect(args.length).toBeLessThanOrEqual(4 * 1024 * 1024);
      const bytes = new Uint8Array(args.length).fill((args.offset / (4 * 1024 * 1024)) % 251);
      return new Response(size ? bytes : null, { status: size ? 206 : 200, headers: { "Content-Length": String(args.length), "Content-Range": `bytes ${args.offset}-${args.offset + args.length - 1}/${size}`, ETag: etag } });
    },
  };
  const request = (headers: HeadersInit = {}, method = "GET") => new Request(url, { method, headers: { Cookie: `cp_dl_${leaseId}=${secret}`, ...headers } });
  return { deps, calls, request, signal: () => signal };
}
test("streams a file larger than the Convex HTTP response limit through bounded ranges", async () => {
  const { deps, calls, request } = fixture();
  const response = await serveDownload(request(), leaseId, deps);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-disposition")).toContain("%27");
  expect(calls).toHaveLength(1);
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(bytes.length).toBe(29 * 1024 * 1024 + 19);
  expect(calls).toHaveLength(8);
  for (let i = 0; i < calls.length; i++) expect(bytes[calls[i]!.offset]).toBe(i);
});
test("HEAD returns size and validators without requesting byte delivery", async () => {
  const { deps, calls, request } = fixture();
  const response = await serveDownload(request({ Range: "bytes=0-15" }, "HEAD"), leaseId, deps);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-length")).toBe(String(29 * 1024 * 1024 + 19));
  expect(calls).toHaveLength(0);
});
test("resumed ranges use the requested interval and If-Range mismatches fall back to the complete file", async () => {
  const { deps, calls, request } = fixture(32);
  const response = await serveDownload(request({ Range: "bytes=10-15", "If-Range": etag }), leaseId, deps);
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe("bytes 10-15/32");
  expect((await response.arrayBuffer()).byteLength).toBe(6);
  expect(calls).toEqual([{ offset: 10, length: 6 }]);
  const full = await serveDownload(request({ Range: "bytes=10-15", "If-Range": "old" }), leaseId, deps);
  expect(full.status).toBe(200);
  expect((await full.arrayBuffer()).byteLength).toBe(32);
});
test("missing capabilities and cross-origin initiation are denied", async () => {
  const { deps, calls } = fixture();
  expect((await serveDownload(new Request(url), leaseId, deps)).status).toBe(403);
  const post = new Request(url, { method: "POST", headers: { Origin: "https://attacker.invalid", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret }) });
  expect((await serveDownload(post, leaseId, deps)).status).toBe(403);
  expect(calls).toHaveLength(0);
});
test("same-origin initiation keeps the secret in a path-scoped HttpOnly cookie", async () => {
  const { deps, calls } = fixture();
  const post = new Request(url, { method: "POST", headers: { Origin: "https://shop.invalid", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret }) });
  const response = await serveDownload(post, leaseId, deps);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/api/downloads/${leaseId}`);
  expect(response.headers.get("set-cookie")).toContain(`Path=/api/downloads/${leaseId};`);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict; Secure");
  expect(await response.text()).not.toContain(secret);
  expect(calls).toHaveLength(0);
});
test("revocation on a later chunk fails the transfer instead of returning a shorter successful body", async () => {
  const { deps, request } = fixture(undefined, 2);
  const response = await serveDownload(request(), leaseId, deps);
  await expect(response.arrayBuffer()).rejects.toThrow();
});
test("client cancellation aborts the backing request and stops further chunk requests", async () => {
  const { deps, calls, request, signal } = fixture();
  const response = await serveDownload(request(), leaseId, deps);
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  expect(signal()?.aborted).toBe(true);
  expect(calls.length).toBeLessThanOrEqual(2);
});
test("empty files are delivered without generating an invalid byte range", async () => {
  const { deps, calls, request } = fixture(0);
  const response = await serveDownload(request(), leaseId, deps);
  expect(response.status).toBe(200);
  expect((await response.arrayBuffer()).byteLength).toBe(0);
  expect(calls).toEqual([{ offset: 0, length: 0 }]);
});
test("range parser rejects malformed/multiple/overflow requests and supports suffix ranges", () => {
  for (const header of ["bytes=", "bytes=10-1", "bytes=32-", "bytes=0-1,5-7", "bytes=9007199254740992-", "bytes=-0"]) expect(downloadInterval(header, 32)).toBeNull();
  expect(downloadInterval("bytes=-8", 32)).toEqual({ offset: 24, length: 8, partial: true });
  expect(downloadInterval("bytes=20-999", 32)).toEqual({ offset: 20, length: 12, partial: true });
});

test("Lead Magnet delivery uses its own endpoint and cookie namespace",async()=>{
 const leadUrl=`https://shop.invalid/api/lead-magnets/${leaseId}`;
 let calls=0;
 const deps={kind:"lead-magnet" as const,backendSiteOrigin:"https://backend.invalid",fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{
  calls++;expect(String(input)).toBe("https://backend.invalid/lead-magnets/downloads/bytes");
  const args=JSON.parse(String(init?.body));expect(args.secret).toBe(secret);
  if(args.mode==="metadata")return Response.json({fileName:"guide.pdf",fileSize:4,etag,expiresAt:Date.now()+60000});
  return new Response("GUID",{status:206,headers:{"Content-Length":"4","Content-Range":"bytes 0-3/4",ETag:etag}});
 }};
 const wrong=new Request(leadUrl,{headers:{Cookie:`cp_dl_${leaseId}=${secret}`}});
 expect((await serveDownload(wrong,leaseId,deps)).status).toBe(403);expect(calls).toBe(0);
 const initiated=await serveDownload(new Request(leadUrl,{method:"POST",headers:{Origin:"https://shop.invalid","Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({secret})}),leaseId,deps);
 expect(initiated.status).toBe(303);expect(initiated.headers.get("set-cookie")).toContain(`cp_lm_${leaseId}=`);expect(initiated.headers.get("set-cookie")).toContain(`Path=/api/lead-magnets/${leaseId};`);expect(initiated.headers.get("location")).toBe(`/api/lead-magnets/${leaseId}`);
 const bytes=await serveDownload(new Request(leadUrl,{headers:{Cookie:`cp_lm_${leaseId}=${secret}`}}),leaseId,deps);
 expect(await bytes.text()).toBe("GUID");expect(bytes.headers.get("content-disposition")).toContain("guide.pdf");
});
