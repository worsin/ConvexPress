import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
function configured(env) {
  try {
    const convex = new URL(env.CONVEXPRESS_CONVEX_URL),
      site = new URL(env.CONVEXPRESS_SITE_URL);
    if (
      convex.protocol !== "https:" ||
      !convex.hostname.endsWith(".convex.cloud") ||
      convex.username ||
      convex.password ||
      convex.port ||
      convex.pathname !== "/" ||
      convex.search ||
      convex.hash ||
      site.protocol !== "https:" ||
      site.username ||
      site.password ||
      site.port ||
      site.pathname !== "/" ||
      site.search ||
      site.hash ||
      !/^[-a-zA-Z0-9_:]{1,160}$/.test(env.CONVEXPRESS_INSTANCE_KEY ?? "")
    )
      return null;
    const managementOrigin = convex.origin.replace(/\.convex\.cloud$/, ".convex.site");
    if (env.CONVEXPRESS_CONVEX_SITE_URL && env.CONVEXPRESS_CONVEX_SITE_URL !== managementOrigin)
      return null;
    const releaseId = env.CONVEXPRESS_RELEASE_ID;
    const artifactHash = env.CONVEXPRESS_ARTIFACT_HASH;
    // Older publishers may omit the entire receipt; a partial or malformed
    // receipt must never look like a successfully configured current release.
    if ((releaseId !== undefined || artifactHash !== undefined) &&
      (typeof releaseId !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(releaseId) ||
        typeof artifactHash !== "string" || !/^[a-f0-9]{64}$/.test(artifactHash))) return null;
    return {
      convexUrl: convex.origin,
      managementOrigin,
      siteOrigin: site.origin,
      instanceKey: env.CONVEXPRESS_INSTANCE_KEY,
      releaseId: releaseId ?? null,
      artifactHash: artifactHash ?? null,
    };
  } catch {
    return null;
  }
}
/** One function process serves one immutable runtime target. No request changes
 * process.env; all storefront state continues through the existing SSR runtime. */
export function createVercelHandler(fetchHandler, env = process.env) {
  const bound = configured(env);
  return async function handler(req, res) {
    const current = configured(env);
    if (!bound || !current || JSON.stringify(bound) !== JSON.stringify(current)) {
      res.statusCode = 503;
      res.end("This website is awaiting configuration.");
      return;
    }
    let url;
    try {
      if (!req.url?.startsWith("/") || req.url.startsWith("//")) throw Error();
      url = new URL(req.url, bound.siteOrigin);
      if (url.origin !== bound.siteOrigin) throw Error();
    } catch {
      res.statusCode = 400;
      res.end("Invalid request.");
      return;
    }
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", onClose);
    req.once("aborted", () => controller.abort());
    try {
      const headers = new Headers();
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
      const method = req.method ?? "GET";
      const hasBody = method !== "GET" && method !== "HEAD";
      const request = new Request(url, {
        method,
        headers,
        signal: controller.signal,
        ...(hasBody ? { body: Readable.toWeb(req), duplex: "half" } : {}),
      });
      const response = await fetchHandler(request);
      res.statusCode = response.status;
      for (const [name, value] of response.headers)
        if (name.toLowerCase() !== "set-cookie" && !name.toLowerCase().startsWith("x-convexpress-")) res.setHeader(name, value);
      // Only the immutable function bindings can attest to release identity.
      // Neither request headers nor an application response can impersonate it.
      res.setHeader("x-convexpress-instance", bound.instanceKey);
      if (bound.releaseId && bound.artifactHash) {
        res.setHeader("x-convexpress-release", bound.releaseId);
        res.setHeader("x-convexpress-artifact", bound.artifactHash);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader("set-cookie", cookies);
      if (method === "HEAD" || !response.body) {
        await response.body?.cancel();
        res.end();
      } else await pipeline(Readable.fromWeb(response.body), res, { signal: controller.signal });
    } catch {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Website request failed.");
      } else res.destroy();
    } finally {
      res.removeListener("close", onClose);
    }
  };
}
