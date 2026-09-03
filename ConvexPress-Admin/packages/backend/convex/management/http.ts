import {
  parseRuntimeSignedEnvelope,
  RUNTIME_MANAGEMENT_CAPABILITY_CODES,
  type RuntimeManagementCapabilityCode,
} from "@convexpress/site-contract/runtime-protocol";
import { anyApi, httpActionGeneric as httpAction } from "convex/server";


const capabilities = new Set<string>(RUNTIME_MANAGEMENT_CAPABILITY_CODES);

function parseSessionExchangeRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid session exchange request");
  }
  const request = value as Record<string, unknown>;
  if (
    Object.keys(request).some((key) => key !== "envelope" && key !== "body") ||
    !request.body ||
    typeof request.body !== "object" ||
    Array.isArray(request.body)
  ) {
    throw new Error("Invalid session exchange request");
  }
  const body = request.body as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        key !== "requestedCapabilities" && key !== "requestedSiteRole",
    ) ||
    !Array.isArray(body.requestedCapabilities) ||
    body.requestedCapabilities.length === 0 ||
    body.requestedCapabilities.length > 64 ||
    body.requestedCapabilities.some(
      (capability) =>
        typeof capability !== "string" || !capabilities.has(capability),
    ) ||
    typeof body.requestedSiteRole !== "string"
  ) {
    throw new Error("Invalid session exchange request");
  }
  return {
    envelope: parseRuntimeSignedEnvelope(request.envelope),
    body: {
      requestedCapabilities: [
        ...body.requestedCapabilities,
      ] as RuntimeManagementCapabilityCode[],
      requestedSiteRole: body.requestedSiteRole,
    },
  };
}

const safeHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: safeHeaders,
  });
}

export const healthHandler = httpAction(async (ctx) => {
  const health = await ctx.runQuery(
    anyApi.management.queries.healthSnapshot,
    {},
  );
  if (!health) {
    return json({ error: "Site management identity is not configured" }, 503);
  }
  return json(health, 200);
});

export const sessionExchangeHandler = httpAction(async (ctx, request) => {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
    return json({ error: "Management session exchange failed" }, 413);
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 65_536) {
      return json({ error: "Management session exchange failed" }, 413);
    }
    const parsed = parseSessionExchangeRequest(JSON.parse(raw));
    const session = await ctx.runAction(
      anyApi.management.actions.exchangeSession,
      parsed,
    );
    return json(session, 200);
  } catch {
    return json({ error: "Management session exchange failed" }, 401);
  }
});
