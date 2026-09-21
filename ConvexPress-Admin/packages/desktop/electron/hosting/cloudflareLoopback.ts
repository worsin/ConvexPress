import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

export const CLOUDFLARE_LOOPBACK_PORT = 47123;
const CALLBACK_PATH = "/hosting/cloudflare/callback";
export const CLOUDFLARE_REDIRECT_URI = `http://localhost:${CLOUDFLARE_LOOPBACK_PORT}${CALLBACK_PATH}`;
type AuthorizationCode = { state: string; code: string };

/** Bind before opening the browser; provider credentials never pass through this listener. */
export async function startCloudflareLoopback(options: {
  port?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
} = {}) {
  let expectedState: string | undefined;
  let settled = false;
  let resolve!: (value: AuthorizationCode) => void;
  let reject!: (reason: Error) => void;
  const result = new Promise<AuthorizationCode>((yes, no) => { resolve = yes; reject = no; });
  // begin/openExternal can fail before the caller starts awaiting the callback.
  void result.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let host = "";
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    server.close();
    server.closeIdleConnections();
  };
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    cleanup();
    reject(new Error(message));
  };
  const abort = () => fail("Cloudflare authorization cancelled");
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status: number, message: string) => { response.writeHead(status); response.end(message); };
    if (request.headers.host !== host || request.socket.remoteAddress !== "127.0.0.1") {
      reply(400, "Invalid callback origin"); return;
    }
    if (request.method !== "GET") { reply(405, "GET required"); return; }
    if (!request.url || request.url.length > 8192) { reply(400, "Invalid callback"); return; }
    const url = new URL(request.url, `http://${host}`);
    if (url.pathname !== CALLBACK_PATH) { reply(404, "Not found"); return; }
    if (!expectedState || settled) { reply(409, "No pending authorization"); return; }
    const states = url.searchParams.getAll("state");
    if (states.length !== 1 || Buffer.byteLength(states[0]!) !== Buffer.byteLength(expectedState)
      || !timingSafeEqual(Buffer.from(states[0]!), Buffer.from(expectedState))) {
      reply(400, "Invalid authorization state"); return;
    }
    if (url.searchParams.has("error")) {
      reply(400, "Authorization declined. Return to ConvexPress to try again.");
      fail("Cloudflare authorization was declined"); return;
    }
    const codes = url.searchParams.getAll("code");
    if (codes.length !== 1 || !codes[0] || codes[0].length > 4096 || /[\u0000-\u0020\u007f]/.test(codes[0])) {
      reply(400, "Invalid authorization code"); return;
    }
    settled = true;
    reply(200, "Authorization received. Return to ConvexPress to see the connection result.");
    cleanup();
    resolve({ state: expectedState, code: codes[0] });
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 5000;
  server.maxConnections = 8;
  await new Promise<void>((yes, no) => {
    const error = () => no(new Error("The Cloudflare callback port is unavailable. Close the other connection attempt and retry."));
    server.once("error", error);
    server.listen(options.port ?? CLOUDFLARE_LOOPBACK_PORT, "127.0.0.1", () => {
      server.removeListener("error", error);
      server.on("error", () => fail("Cloudflare callback listener failed"));
      yes();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") { cleanup(); throw new Error("Cloudflare callback listener failed"); }
  host = `localhost:${address.port}`;
  timer = setTimeout(() => fail("Cloudflare authorization timed out. Start a new connection attempt."), options.timeoutMs ?? 5 * 60_000);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  return {
    redirectUri: `http://${host}${CALLBACK_PATH}`,
    expectState(state: string) {
      if (expectedState || settled || !/^[A-Za-z0-9_-]{32,256}$/.test(state)) throw new Error("Invalid Cloudflare authorization state");
      expectedState = state;
    },
    result,
    close: abort,
  };
}
