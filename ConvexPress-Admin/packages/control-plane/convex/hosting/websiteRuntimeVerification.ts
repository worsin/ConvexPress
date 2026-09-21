import { v, type Infer } from "convex/values";

export const RUNTIME_PATHS = ["/", "/document-preview/"] as const;
const code = v.union(v.literal("ok"), v.literal("http"), v.literal("identity"), v.literal("content"), v.literal("size"), v.literal("transport"), v.literal("timeout"));
export const runtimeVerification = v.object({
  releaseId: v.string(), instanceKey: v.string(), artifactHash: v.string(), siteOrigin: v.string(),
  checkedAt: v.number(), attempts: v.number(), result: v.union(v.literal("verified"), v.literal("failed")),
  routes: v.array(v.object({ path: v.union(v.literal("/"), v.literal("/document-preview/")), code, status: v.optional(v.number()), bytes: v.number() })),
});
export type RuntimeVerification = Infer<typeof runtimeVerification>;
type Target = Pick<RuntimeVerification, "releaseId" | "instanceKey" | "artifactHash" | "siteOrigin">;
type RouteResult = RuntimeVerification["routes"][number];

/** The origin comes from the persisted instance AND authenticated provider account. */
export function assertProbeOrigin(origin: string, worker: string, subdomain: string): string {
  const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!label.test(worker) || !label.test(subdomain) || origin !== `https://${worker}.${subdomain}.workers.dev`) throw Error("Registered website address must match this Worker's account subdomain");
  return origin;
}

export function assertRuntimeVerification(evidence: RuntimeVerification, target: Target, requireSuccess = false): void {
  if (["releaseId", "instanceKey", "artifactHash", "siteOrigin"].some(key => evidence[key as keyof Target] !== target[key as keyof Target])
    || !Number.isInteger(evidence.attempts) || evidence.attempts < 1 || evidence.attempts > 3
    || !Number.isFinite(evidence.checkedAt) || evidence.checkedAt > Date.now() + 1000 || evidence.checkedAt < Date.now() - 30_000
    || evidence.routes.length !== 2 || evidence.routes.some((route, i) => route.path !== RUNTIME_PATHS[i] || !Number.isInteger(route.bytes) || route.bytes < 0 || route.bytes > 2_097_152)) throw Error("Runtime verification does not match this release or has expired");
  const verified = evidence.routes.every(route => route.code === "ok" && route.status === 200 && route.bytes > 0);
  if ((evidence.result === "verified") !== verified || (requireSuccess && !verified)) throw Error("Public website runtime is not verified");
}

async function probeRoute(target: Target, path: typeof RUNTIME_PATHS[number], transport: typeof fetch, timeoutMs: number): Promise<RouteResult> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<RouteResult>(resolve => { timer = setTimeout(() => { timedOut = true; controller.abort(); void reader?.cancel().catch(() => { }); resolve({ path, code: "timeout", bytes: 0 }); }, timeoutMs); });
  const work = async (): Promise<RouteResult> => {
    let bytes = 0;
    try {
      const url = new URL(path, target.siteOrigin);
      url.searchParams.set("__convexpress_verify", crypto.randomUUID());
      const response = await transport(url, { signal: controller.signal, redirect: "error", credentials: "omit", cache: "no-store", headers: { accept: "text/html", "cache-control": "no-cache" } });
      const failure = (code: RouteResult["code"]): RouteResult => ({ path, code, status: response.status, bytes });
      if (response.status !== 200 || response.redirected) { void response.body?.cancel().catch(() => { }); return failure("http"); }
      if (response.headers.get("x-convexpress-instance") !== target.instanceKey || response.headers.get("x-convexpress-release") !== target.releaseId || response.headers.get("x-convexpress-artifact") !== target.artifactHash) { void response.body?.cancel().catch(() => { }); return failure("identity"); }
      if (!/^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "") || !response.body) { void response.body?.cancel().catch(() => { }); return failure("content"); }
      reader = response.body.getReader();
      const decoder = new TextDecoder(); let html = "";
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        if (bytes + chunk.value.byteLength > 2_097_152) { void reader.cancel().catch(() => { }); return failure("size"); }
        bytes += chunk.value.byteLength; html += decoder.decode(chunk.value, { stream: true });
      }
      html += decoder.decode();
      return failure(/<html(?:\s|>)/i.test(html) && /<\/html\s*>/i.test(html) ? "ok" : "content");
    } catch { return { path, code: timedOut ? "timeout" : "transport", bytes }; }
  };
  try { return await Promise.race([work(), timeout]); } finally { clearTimeout(timer); }
}

/** Test-only overrides do not enter a registered API. Production is at most six
 * anonymous fixed-route requests, each capped at 2 MiB and six seconds. */
export async function probeWebsiteRuntime(target: Target, options: { fetch?: typeof fetch; attempts?: number; timeoutMs?: number; wait?: (ms: number) => Promise<void> } = {}): Promise<RuntimeVerification> {
  const transport = options.fetch ?? fetch;
  const attempts = Math.min(3, Math.max(1, options.attempts ?? 3));
  let routes: RouteResult[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    routes = await Promise.all(RUNTIME_PATHS.map(path => probeRoute(target, path, transport, options.timeoutMs ?? 6000)));
    const result = routes.every(route => route.code === "ok") ? "verified" : "failed";
    if (result === "verified" || attempt === attempts) return { ...target, checkedAt: Date.now(), attempts: attempt, result, routes };
    await (options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(250 * attempt);
  }
  throw Error("Runtime verification did not run");
}
