import { makeFunctionReference } from "convex/server";
import { httpAction } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { generateRefreshToken, hashRefreshToken, signAccessToken, signManagementAccessToken } from "./helpers";
import { readLimitedRequestText } from "./inputLimits";

type Principal = { userId: Id<"users">; email: string; name: string; siteRole: string | null; expiresAt: number; managementSessionId: Id<"convexpress_managementSessions"> | null; instanceKey: string };
const consumeRef = makeFunctionReference<"mutation", { codeHash: string; origin: string }, Principal | null>("auth/operatorHandoffs:consume");

function responseHeaders(request: Request) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("origin");
  try {
    const parsed = new URL(origin ?? "");
    if (["http:", "https:"].includes(parsed.protocol) && parsed.origin === origin) headers.set("Access-Control-Allow-Origin", origin);
  } catch { /* Opaque or missing origins cannot redeem a browser handoff. */ }
  return headers;
}

export const operatorHandoffPreflight = httpAction(async (_ctx, request) => {
  const headers = responseHeaders(request);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(null, { status: headers.has("Access-Control-Allow-Origin") ? 204 : 403, headers });
});

export const operatorHandoffHandler = httpAction(async (ctx, request) => {
  const headers = responseHeaders(request);
  const refused = () => new Response(JSON.stringify({ error: "This website editing link expired or is no longer authorized. Open a new link from ConvexPress." }), { status: 403, headers });
  if (!headers.has("Access-Control-Allow-Origin")) return refused();
  try {
    const body: unknown = JSON.parse(await readLimitedRequestText(request, 1024));
    if (!body || typeof body !== "object" || !("code" in body) || typeof body.code !== "string" || !/^[a-f0-9]{64}$/.test(body.code)) return refused();
    const principal = await ctx.runMutation(consumeRef, { codeHash: await hashRefreshToken(body.code), origin: request.headers.get("origin")! });
    if (!principal || principal.expiresAt <= Date.now()) return refused();
    const token = principal.managementSessionId && principal.siteRole
      ? await signManagementAccessToken({ sessionId: principal.managementSessionId, sessionToken: generateRefreshToken(), siteRole: principal.siteRole, expiresAt: principal.expiresAt })
      : await signAccessToken({ userId: principal.userId, email: principal.email, name: principal.name, expiresAt: principal.expiresAt });
    return new Response(JSON.stringify({ token, expiresAt: principal.expiresAt, instanceKey: principal.instanceKey, userId: principal.userId }), { status: 200, headers });
  } catch { return refused(); }
});
