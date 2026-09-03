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
        key !== "requestedCapabilities" &&
        key !== "requestedSiteRole" &&
        key !== "controllerSubjectId",
    ) ||
    !Array.isArray(body.requestedCapabilities) ||
    body.requestedCapabilities.length === 0 ||
    body.requestedCapabilities.length > 64 ||
    body.requestedCapabilities.some(
      (capability) =>
        typeof capability !== "string" || !capabilities.has(capability),
    ) ||
    typeof body.requestedSiteRole !== "string" ||
    typeof body.controllerSubjectId !== "string"
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
      controllerSubjectId: body.controllerSubjectId,
    },
  };
}

function parseSessionRevocationRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid session revocation request");
  }
  const request = value as Record<string, unknown>;
  if (
    Object.keys(request).some((key) => key !== "envelope" && key !== "body") ||
    !request.body ||
    typeof request.body !== "object" ||
    Array.isArray(request.body)
  ) {
    throw new Error("Invalid session revocation request");
  }
  const body = request.body as Record<string, unknown>;
  if (
    (body.scope !== "operator" && body.scope !== "controller") ||
    (body.scope === "operator" &&
      (typeof body.controllerSubjectId !== "string" ||
        Object.keys(body).some(
          (key) => key !== "scope" && key !== "controllerSubjectId",
        ))) ||
    (body.scope === "controller" && Object.keys(body).some((key) => key !== "scope"))
  ) {
    throw new Error("Invalid session revocation request");
  }
  return {
    envelope: parseRuntimeSignedEnvelope(request.envelope),
    body:
      body.scope === "operator"
        ? {
            scope: "operator" as const,
            controllerSubjectId: body.controllerSubjectId as string,
          }
        : { scope: "controller" as const },
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

export const sessionRevocationHandler = httpAction(async (ctx, request) => {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
    return json({ error: "Management session revocation failed" }, 413);
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 65_536) {
      return json({ error: "Management session revocation failed" }, 413);
    }
    const parsed = parseSessionRevocationRequest(JSON.parse(raw));
    const result = await ctx.runAction(
      anyApi.management.actions.revokeSessions,
      parsed,
    );
    return json(result, 200);
  } catch {
    return json({ error: "Management session revocation failed" }, 401);
  }
});
