// @ts-nocheck — Convex generated API union types exceed TypeScript's instantiation
// depth (TS2589) for every ctx.runQuery/runMutation/db call in this module, the
// same limitation documented in auth/clerkManagement.ts. The pure logic lives in
// clerkConnectionHelpers.ts and stays fully typed and unit-tested.
/**
 * Clerk Connection — the per-site pipeline that turns one credential into a
 * fully working customer sign-in.
 *
 * Entry points (all gated on `manage_options`):
 *   connectWithSecretKey  paste `sk_…`; everything else is derived + configured
 *   startKeyless          no Clerk account yet: create a claimable app, then configure
 *   verify                live readiness checks against Clerk (persisted)
 *   syncCapabilities      refresh the public environment document Clerk publishes
 *   webhookPortalUrl      one-time URL to Clerk's (Svix) webhook portal
 *   runTokenProbe         dev instances: mint a real "convex" token and verify it
 *   getStatus             everything the admin page renders (no plaintext secrets)
 *   saveWebhookSecret / disconnect
 *
 * Nothing here can redeploy the Convex backend. The deployment env vars
 * (`CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`) are applied by the desktop
 * app / control plane; `getStatus` reports whether they match.
 */

import { ConvexError, v } from "convex/values";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { internal } from "../_generated/api";
import { action, mutation, query, type ActionCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { decryptSettingSecret } from "../helpers/settingsSecret";
import { CLERK_INTEGRATION_DEFAULTS } from "../settings/defaults";
import {
  computeReadiness,
  decodePublishableKey,
  deriveHttpActionsOrigin,
  encodePublishableKey,
  environmentTypeFromSecretKey,
  isPublishableKey,
  isSecretKey,
  mergeAllowedOrigins,
  normalizeClerkEnvironment,
  normalizeFrontendApi,
  oauthRedirectUrls,
  pickPrimaryDomain,
  uniqueOrigins,
  webhookEndpointUrl,
  type AuthCapabilities,
  type ClerkDomainRecord,
  type ClerkEnvironmentType,
  type Readiness,
} from "./clerkConnectionHelpers";
import type { ClerkConnectionSnapshot } from "./clerkConnectionInternals";

const CLERK_API = "https://api.clerk.com/v1";
const TIMEOUT_MS = 15_000;
const JWT_TEMPLATE_NAME = "convex";

/** Claims Convex reads through `ctx.auth.getUserIdentity()`; email is required for provisioning. */
const CONVEX_TEMPLATE_CLAIMS: Record<string, string> = {
  aud: "convex",
  email: "{{user.primary_email_address}}",
  email_verified: "{{user.email_verified}}",
  name: "{{user.full_name}}",
  given_name: "{{user.first_name}}",
  family_name: "{{user.last_name}}",
  picture: "{{user.image_url}}",
  nickname: "{{user.username}}",
  phone_number: "{{user.primary_phone_number}}",
  phone_number_verified: "{{user.phone_number_verified}}",
  updated_at: "{{user.updated_at}}",
};

// ─── HTTP helpers ───────────────────────────────────────────────────────────

interface ClerkResponse {
  ok: boolean;
  status: number;
  json: any;
  text: string;
}

async function http(url: string, init: RequestInit = {}): Promise<ClerkResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

type ClerkInit = Omit<RequestInit, "body"> & { body?: unknown };

function clerkFetch(secretKey: string, path: string, init: ClerkInit = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  }
  return http(`${CLERK_API}${path}`, { ...(init as RequestInit), headers, body });
}

function clerkErrorText(response: ClerkResponse): string {
  const first = Array.isArray(response.json?.errors) ? response.json.errors[0] : null;
  const message = first?.long_message ?? first?.message ?? first?.code ?? response.text;
  return `${String(message ?? "").replace(/\s+/g, " ").trim().slice(0, 200)} (HTTP ${response.status})`;
}

function listData(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

async function requireManageOptions(ctx: ActionCtx) {
  await ctx.runQuery(internal.settings.internals.requireManageOptionsInternal, {});
}

async function snapshot(ctx: ActionCtx): Promise<ClerkConnectionSnapshot> {
  return ctx.runQuery(internal.auth.clerkConnectionInternals.readConnection, {});
}

async function save(ctx: ActionCtx, values: Record<string, unknown>) {
  await ctx.runMutation(internal.auth.clerkConnectionInternals.saveConnection, { values });
}

function siteOriginsFor(snap: ClerkConnectionSnapshot, extra: string[] = []): string[] {
  return uniqueOrigins([
    snap.site.siteUrl,
    snap.site.homeUrl,
    snap.deployment.envSiteUrl,
    snap.site.identitySiteOrigin,
    ...extra,
  ]);
}

// ─── Clerk-side configuration steps ─────────────────────────────────────────

interface InstanceInfo {
  id: string;
  environmentType: ClerkEnvironmentType;
  allowedOrigins: string[] | null;
}

async function fetchInstance(secretKey: string): Promise<InstanceInfo> {
  const response = await clerkFetch(secretKey, "/instance");
  if (!response.ok) {
    throw new ConvexError({
      code: "CLERK_SECRET_KEY_REJECTED",
      message: `Clerk rejected the secret key: ${clerkErrorText(response)}`,
    });
  }
  return {
    id: String(response.json?.id ?? ""),
    environmentType:
      response.json?.environment_type === "production"
        ? "production"
        : environmentTypeFromSecretKey(secretKey) ?? "development",
    allowedOrigins: Array.isArray(response.json?.allowed_origins)
      ? response.json.allowed_origins.filter((item: unknown) => typeof item === "string")
      : null,
  };
}

async function fetchDomains(secretKey: string): Promise<ClerkDomainRecord[]> {
  const response = await clerkFetch(secretKey, "/domains");
  if (!response.ok) return [];
  return listData(response.json) as ClerkDomainRecord[];
}

interface TemplateResult {
  id: string;
  created: boolean;
  updated: boolean;
}

async function ensureConvexTemplate(secretKey: string): Promise<TemplateResult> {
  const list = await clerkFetch(secretKey, "/jwt_templates");
  if (!list.ok) throw new Error(`Could not list JWT templates: ${clerkErrorText(list)}`);
  const existing = listData(list.json).find((template: any) => template?.name === JWT_TEMPLATE_NAME);
  if (existing) {
    const claims = (existing.claims ?? {}) as Record<string, unknown>;
    const missing = Object.entries(CONVEX_TEMPLATE_CLAIMS).filter(([key]) => !(key in claims));
    if (claims.aud === "convex" && missing.length === 0) {
      return { id: String(existing.id), created: false, updated: false };
    }
    const patch = await clerkFetch(secretKey, `/jwt_templates/${existing.id}`, {
      method: "PATCH",
      body: {
        name: JWT_TEMPLATE_NAME,
        claims: { ...claims, ...Object.fromEntries(missing), aud: "convex" },
      },
    });
    if (!patch.ok) throw new Error(`Could not update the convex JWT template: ${clerkErrorText(patch)}`);
    return { id: String(existing.id), created: false, updated: true };
  }
  const created = await clerkFetch(secretKey, "/jwt_templates", {
    method: "POST",
    body: { name: JWT_TEMPLATE_NAME, claims: CONVEX_TEMPLATE_CLAIMS, lifetime: 60, allowed_clock_skew: 5 },
  });
  if (!created.ok) throw new Error(`Could not create the convex JWT template: ${clerkErrorText(created)}`);
  return { id: String(created.json?.id ?? ""), created: true, updated: false };
}

async function registerOrigins(
  secretKey: string,
  instance: InstanceInfo,
  origins: string[],
  warnings: string[],
): Promise<void> {
  if (origins.length === 0) return;
  const merged = mergeAllowedOrigins(instance.allowedOrigins, origins);
  if (merged.changed && merged.next) {
    const patch = await clerkFetch(secretKey, "/instance", {
      method: "PATCH",
      body: { allowed_origins: merged.next },
    });
    if (!patch.ok) warnings.push(`Allowed origins were not updated: ${clerkErrorText(patch)}`);
  }
  const wanted = oauthRedirectUrls(origins);
  const existing = await clerkFetch(secretKey, "/redirect_urls");
  const known = new Set(
    existing.ok ? listData(existing.json).map((row: any) => String(row?.url ?? "")) : [],
  );
  for (const url of wanted) {
    if (known.has(url)) continue;
    const created = await clerkFetch(secretKey, "/redirect_urls", { method: "POST", body: { url } });
    if (!created.ok && created.status !== 422 && created.status !== 400) {
      warnings.push(`Redirect URL ${url} was not registered: ${clerkErrorText(created)}`);
    }
  }
}

async function ensureSvixApp(secretKey: string, warnings: string[]): Promise<boolean> {
  const created = await clerkFetch(secretKey, "/webhooks/svix", { method: "POST" });
  if (created.ok) return true;
  const text = created.text.toLowerCase();
  if (created.status === 400 && (text.includes("already") || text.includes("exists"))) return true;
  warnings.push(`Webhook app was not created: ${clerkErrorText(created)}`);
  return false;
}

async function fetchCapabilities(frontendApi: string): Promise<AuthCapabilities | null> {
  const response = await http(`${frontendApi}/v1/environment?_clerk_js_version=5`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok || !response.json) return null;
  return normalizeClerkEnvironment(response.json);
}

interface ConfigureInput {
  secretKey: string;
  mode: "secret_key" | "keyless";
  publishableKeyHint?: string;
  claimUrl?: string;
  dashboardUrl?: string;
  extraOrigins?: string[];
}

interface ConfigureResult {
  publishableKey: string;
  frontendApi: string;
  environmentType: ClerkEnvironmentType;
  instanceId: string;
  jwtTemplate: TemplateResult;
  siteOrigins: string[];
  svixConfigured: boolean;
  capabilitiesSynced: boolean;
  warnings: string[];
}

/** The shared pipeline: derive → template → origins → webhook app → capabilities → save. */
async function configure(ctx: ActionCtx, input: ConfigureInput): Promise<ConfigureResult> {
  const warnings: string[] = [];
  const secretKey = input.secretKey.trim();
  const snap = await snapshot(ctx);

  const instance = await fetchInstance(secretKey);
  const hint = input.publishableKeyHint && isPublishableKey(input.publishableKeyHint)
    ? decodePublishableKey(input.publishableKeyHint)
    : null;
  const domains = await fetchDomains(secretKey);
  const primary = pickPrimaryDomain(domains, hint?.frontendApi);
  const frontendApi = normalizeFrontendApi(primary?.frontend_api_url ?? hint?.frontendApi ?? "");
  if (!frontendApi) {
    throw new ConvexError({
      code: "CLERK_FRONTEND_API_UNKNOWN",
      message: "Clerk did not report a Frontend API for this instance. Paste the publishable key as well.",
    });
  }
  const publishableKey =
    hint && hint.frontendApi === frontendApi
      ? input.publishableKeyHint!.trim()
      : encodePublishableKey(frontendApi, instance.environmentType);

  const jwtTemplate = await ensureConvexTemplate(secretKey);

  const siteOrigins = siteOriginsFor(snap, input.extraOrigins ?? []);
  try {
    await registerOrigins(secretKey, instance, siteOrigins, warnings);
  } catch (error) {
    warnings.push(`Origins were not registered: ${error instanceof Error ? error.message : String(error)}`);
  }

  let svixConfigured = false;
  try {
    svixConfigured = await ensureSvixApp(secretKey, warnings);
  } catch (error) {
    warnings.push(`Webhook app was not created: ${error instanceof Error ? error.message : String(error)}`);
  }

  let capabilities: AuthCapabilities | null = null;
  try {
    capabilities = await fetchCapabilities(frontendApi);
  } catch {
    capabilities = null;
  }
  if (!capabilities) warnings.push("Clerk's sign-in options could not be read yet; sync again in a minute.");

  const now = Date.now();
  await save(ctx, {
    clerkSecretKey: secretKey,
    clerkPublishableKey: publishableKey,
    clerkJwtIssuerDomain: frontendApi,
    clerkFrontendApi: frontendApi,
    clerkEnvironmentType: instance.environmentType,
    clerkInstanceId: instance.id,
    clerkConnectionMode: input.mode,
    clerkClaimUrl: input.mode === "keyless" ? (input.claimUrl ?? "") : "",
    clerkDashboardUrl:
      input.dashboardUrl ?? (typeof snap.values.clerkDashboardUrl === "string" ? snap.values.clerkDashboardUrl : ""),
    clerkClaimedAt: input.mode === "keyless" ? null : snap.values.clerkClaimedAt ?? null,
    clerkConnectedAt: now,
    clerkJwtTemplateId: jwtTemplate.id,
    clerkSvixConfigured: svixConfigured || Boolean(snap.values.clerkSvixConfigured),
    clerkSiteOrigins: siteOrigins,
    clerkCapabilities: capabilities ?? snap.values.clerkCapabilities ?? null,
    clerkCapabilitiesSyncedAt: capabilities ? now : snap.values.clerkCapabilitiesSyncedAt ?? null,
    clerkLastVerification: {
      checkedAt: now,
      secretKeyValid: true,
      jwksKeyCount: null,
      jwtTemplatePresent: true,
      jwtTemplateAudienceOk: true,
    },
    clerkLastVerifiedAt: now,
  });

  return {
    publishableKey,
    frontendApi,
    environmentType: instance.environmentType,
    instanceId: instance.id,
    jwtTemplate,
    siteOrigins,
    svixConfigured,
    capabilitiesSynced: Boolean(capabilities),
    warnings,
  };
}

// ─── Public actions ─────────────────────────────────────────────────────────

export const connectWithSecretKey = action({
  args: {
    secretKey: v.string(),
    publishableKey: v.optional(v.string()),
    extraOrigins: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<ConfigureResult> => {
    await requireManageOptions(ctx);
    if (!isSecretKey(args.secretKey)) {
      throw new ConvexError({
        code: "CLERK_SECRET_KEY_INVALID",
        message: "That does not look like a Clerk secret key (sk_test_… or sk_live_…).",
      });
    }
    if (args.publishableKey && !isPublishableKey(args.publishableKey)) {
      throw new ConvexError({
        code: "CLERK_PUBLISHABLE_KEY_INVALID",
        message: "That does not look like a Clerk publishable key (pk_test_… or pk_live_…).",
      });
    }
    return configure(ctx, {
      secretKey: args.secretKey,
      mode: "secret_key",
      publishableKeyHint: args.publishableKey?.trim(),
      extraOrigins: args.extraOrigins,
    });
  },
});

export const startKeyless = action({
  args: { extraOrigins: v.optional(v.array(v.string())) },
  handler: async (ctx, args): Promise<ConfigureResult & { claimUrl: string }> => {
    await requireManageOptions(ctx);
    const created = await http(`${CLERK_API}/accountless_applications?source=convexpress`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
    });
    if (!created.ok || !created.json?.secret_key) {
      throw new ConvexError({
        code: "CLERK_KEYLESS_UNAVAILABLE",
        message: `Clerk could not create a keyless application right now: ${clerkErrorText(created)}`,
      });
    }
    const claimUrl = String(created.json.claim_url ?? "");
    const result = await configure(ctx, {
      secretKey: String(created.json.secret_key),
      mode: "keyless",
      publishableKeyHint: String(created.json.publishable_key ?? ""),
      claimUrl,
      dashboardUrl: String(created.json.api_keys_url ?? ""),
      extraOrigins: args.extraOrigins,
    });
    return { ...result, claimUrl };
  },
});

export const syncCapabilities = action({
  args: {},
  handler: async (ctx): Promise<{ synced: boolean; capabilities: AuthCapabilities | null }> => {
    await requireManageOptions(ctx);
    const snap = await snapshot(ctx);
    const frontendApi = normalizeFrontendApi(
      String(snap.values.clerkFrontendApi || snap.values.clerkJwtIssuerDomain || snap.deployment.issuer || ""),
    );
    if (!frontendApi) return { synced: false, capabilities: null };
    const capabilities = await fetchCapabilities(frontendApi);
    if (!capabilities) return { synced: false, capabilities: null };
    await save(ctx, { clerkCapabilities: capabilities, clerkCapabilitiesSyncedAt: Date.now() });
    return { synced: true, capabilities };
  },
});

export const verify = action({
  args: {},
  handler: async (ctx): Promise<{ readiness: Readiness; checkedAt: number }> => {
    await requireManageOptions(ctx);
    const snap = await snapshot(ctx);
    const now = Date.now();
    const verification: Record<string, unknown> = { checkedAt: now };

    if (snap.secretKey) {
      const instance = await clerkFetch(snap.secretKey, "/instance");
      verification.secretKeyValid = instance.ok;
      if (!instance.ok) verification.secretKeyError = clerkErrorText(instance);
      if (instance.ok) {
        const templates = await clerkFetch(snap.secretKey, "/jwt_templates");
        const convex = listData(templates.json).find((t: any) => t?.name === JWT_TEMPLATE_NAME);
        verification.jwtTemplatePresent = Boolean(convex);
        verification.jwtTemplateAudienceOk = Boolean(convex && convex.claims?.aud === "convex");
        // Keyless apps report a claimed_at once the owner signs in.
        if (snap.values.clerkConnectionMode === "keyless" && !snap.values.clerkClaimedAt) {
          const frontendApi = normalizeFrontendApi(String(snap.values.clerkFrontendApi || ""));
          if (frontendApi) {
            const env = await http(`${frontendApi}/v1/environment?_clerk_js_version=5`);
            const claimedAt = env.json?.auth_config?.claimed_at;
            if (typeof claimedAt === "number" && claimedAt > 0) {
              await save(ctx, { clerkClaimedAt: claimedAt });
              snap.values.clerkClaimedAt = claimedAt;
            }
          }
        }
      }
    } else {
      verification.secretKeyValid = false;
      verification.secretKeyError = "No secret key stored.";
    }

    const issuer = normalizeFrontendApi(String(snap.values.clerkJwtIssuerDomain || snap.values.clerkFrontendApi || ""));
    if (issuer) {
      const jwks = await http(`${issuer}/.well-known/jwks.json`);
      verification.jwksKeyCount = Array.isArray(jwks.json?.keys) ? jwks.json.keys.length : 0;
    }

    await save(ctx, { clerkLastVerification: verification, clerkLastVerifiedAt: now });
    const readiness = readinessFrom({ ...snap, values: { ...snap.values, clerkLastVerification: verification } });
    return { readiness, checkedAt: now };
  },
});

export const webhookPortalUrl = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    await requireManageOptions(ctx);
    const snap = await snapshot(ctx);
    if (!snap.secretKey) throw new ConvexError({ code: "CLERK_NOT_CONNECTED", message: "Connect Clerk first." });
    if (!snap.values.clerkSvixConfigured) {
      const warnings: string[] = [];
      const ok = await ensureSvixApp(snap.secretKey, warnings);
      if (ok) await save(ctx, { clerkSvixConfigured: true });
    }
    const response = await clerkFetch(snap.secretKey, "/webhooks/svix_url", { method: "POST" });
    if (!response.ok || !response.json?.svix_url) {
      throw new ConvexError({
        code: "CLERK_WEBHOOK_PORTAL_UNAVAILABLE",
        message: `Clerk did not return a webhook portal link: ${clerkErrorText(response)}`,
      });
    }
    return { url: String(response.json.svix_url) };
  },
});

/**
 * Development instances only: create (or reuse) a probe user, mint a session
 * token from the "convex" template and verify it exactly the way this Convex
 * deployment would. Proves the whole chain without a browser.
 */
export const runTokenProbe = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ ok: boolean; detail: string; issuer?: string; audience?: string }> => {
    await requireManageOptions(ctx);
    const snap = await snapshot(ctx);
    if (!snap.secretKey) return { ok: false, detail: "Connect Clerk first." };
    if (snap.values.clerkEnvironmentType === "production") {
      return { ok: false, detail: "The token probe only runs against development instances." };
    }
    const issuer = normalizeFrontendApi(String(snap.values.clerkJwtIssuerDomain || snap.values.clerkFrontendApi || ""));
    if (!issuer) return { ok: false, detail: "No issuer recorded." };

    const email = "convexpress.probe+clerk_test@example.com";
    let userId: string | undefined;
    const found = await clerkFetch(snap.secretKey, `/users?email_address=${encodeURIComponent(email)}&limit=1`);
    userId = listData(found.json)[0]?.id;
    if (!userId) {
      // Satisfy whatever identifiers this instance requires (username, phone).
      const caps = (snap.values.clerkCapabilities as AuthCapabilities | null) ?? null;
      const body: Record<string, unknown> = {
        email_address: [email],
        first_name: "ConvexPress",
        last_name: "Probe",
        skip_password_requirement: true,
        skip_legal_checks: true,
        private_metadata: { convexpress: { probe: true } },
      };
      if (caps?.attributes.username.required) body.username = `cp_probe_${Date.now().toString(36)}`;
      if (caps?.attributes.phoneNumber.required) body.phone_number = ["+15005550006"];
      const created = await clerkFetch(snap.secretKey, "/users", { method: "POST", body });
      if (!created.ok) return { ok: false, detail: `Could not create the probe user: ${clerkErrorText(created)}` };
      userId = String(created.json?.id ?? "");
    }
    const session = await clerkFetch(snap.secretKey, "/sessions", { method: "POST", body: { user_id: userId } });
    if (!session.ok) return { ok: false, detail: `Could not open a probe session: ${clerkErrorText(session)}` };
    const sessionId = String(session.json?.id ?? "");
    try {
      const token = await clerkFetch(snap.secretKey, `/sessions/${sessionId}/tokens/${JWT_TEMPLATE_NAME}`, {
        method: "POST",
        body: {},
      });
      if (!token.ok || !token.json?.jwt) {
        return { ok: false, detail: `Clerk did not mint a convex token: ${clerkErrorText(token)}` };
      }
      const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
      const { payload } = await jwtVerify(String(token.json.jwt), jwks, { issuer, audience: "convex" });
      const deploymentIssuer = normalizeFrontendApi(snap.deployment.issuer ?? "");
      if (deploymentIssuer !== issuer) {
        return {
          ok: false,
          issuer,
          audience: "convex",
          detail: `Token is valid, but this deployment trusts ${deploymentIssuer || "no issuer"}. Apply the environment and redeploy.`,
        };
      }
      const hasEmail = typeof payload.email === "string";
      await save(ctx, {
        clerkLastVerification: {
          ...((snap.values.clerkLastVerification as Record<string, unknown> | null) ?? {}),
          tokenProbeAt: Date.now(),
          tokenProbeOk: true,
        },
      });
      return {
        ok: true,
        issuer,
        audience: "convex",
        detail: hasEmail
          ? "A real Clerk session token verified against this deployment's issuer with aud=convex and an email claim."
          : "Token verified, but it carries no email claim; customer provisioning would fail. Reconnect to repair the template.",
      };
    } finally {
      await clerkFetch(snap.secretKey, `/sessions/${sessionId}/revoke`, { method: "POST", body: {} });
    }
  },
});

// ─── Status (query) ─────────────────────────────────────────────────────────

function readinessFrom(snap: ClerkConnectionSnapshot): Readiness {
  const values = snap.values;
  const verification = (values.clerkLastVerification as Record<string, unknown> | null) ?? {};
  const issuer = normalizeFrontendApi(String(values.clerkJwtIssuerDomain || values.clerkFrontendApi || "")) || null;
  return computeReadiness({
    secretKeyValid:
      typeof verification.secretKeyValid === "boolean"
        ? verification.secretKeyValid
        : snap.secretKey
          ? null
          : false,
    secretKeyError: typeof verification.secretKeyError === "string" ? verification.secretKeyError : null,
    publishableKey: snap.publishableKey || null,
    issuer,
    jwksKeyCount: typeof verification.jwksKeyCount === "number" ? verification.jwksKeyCount : null,
    jwtTemplatePresent:
      typeof verification.jwtTemplatePresent === "boolean" ? verification.jwtTemplatePresent : null,
    jwtTemplateAudienceOk:
      typeof verification.jwtTemplateAudienceOk === "boolean" ? verification.jwtTemplateAudienceOk : null,
    deploymentIssuer: snap.deployment.issuer,
    deploymentHasSecret: snap.deployment.hasSecretKeyEnv,
    webhookSecretStored: Boolean(snap.webhookSecret),
    webhookLastReceivedAt:
      typeof values.clerkWebhookLastReceivedAt === "number" ? values.clerkWebhookLastReceivedAt : null,
    capabilitiesSyncedAt:
      typeof values.clerkCapabilitiesSyncedAt === "number" ? values.clerkCapabilitiesSyncedAt : null,
    connectionMode: String(values.clerkConnectionMode ?? ""),
    claimedAt: typeof values.clerkClaimedAt === "number" ? values.clerkClaimedAt : null,
  });
}

async function plainOrEnv(value: unknown, env: string | undefined): Promise<string> {
  if (typeof value === "string" && value.trim()) {
    const raw = value.trim();
    if (raw.startsWith("enc:") || raw.startsWith("b64:")) return (await decryptSettingSecret(raw)) || "";
    return raw;
  }
  return env?.trim() || "";
}

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "integrations.clerk"))
      .unique();
    const values: Record<string, unknown> = {
      ...CLERK_INTEGRATION_DEFAULTS,
      ...((doc?.values as Record<string, unknown> | undefined) ?? {}),
    };
    const identity = await ctx.db
      .query("convexpress_siteIdentity")
      .withIndex("by_identity_key", (q) => q.eq("identityKey", "site-identity"))
      .unique();
    const secretKey = await plainOrEnv(values.clerkSecretKey, process.env.CLERK_SECRET_KEY);
    const webhookSecret = await plainOrEnv(values.clerkWebhookSecret, process.env.CLERK_WEBHOOK_SECRET);
    const publishableKey = await plainOrEnv(values.clerkPublishableKey, process.env.CLERK_PUBLISHABLE_KEY);

    const deploymentOrigin =
      process.env.CONVEX_CLOUD_URL?.trim() || identity?.deploymentOrigin || null;
    const httpActionsOrigin =
      process.env.CONVEX_SITE_URL?.trim() ||
      identity?.managementOrigin ||
      deriveHttpActionsOrigin(deploymentOrigin);
    const envIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim() || null;
    const issuer = normalizeFrontendApi(String(values.clerkJwtIssuerDomain || values.clerkFrontendApi || "")) || null;

    const snap: ClerkConnectionSnapshot = {
      values,
      secretKey,
      webhookSecret,
      publishableKey,
      site: {
        siteUrl: "",
        homeUrl: "",
        identitySiteOrigin: identity?.siteOrigin ?? null,
        identityDeploymentOrigin: identity?.deploymentOrigin ?? null,
        identityManagementOrigin: identity?.managementOrigin ?? null,
      },
      deployment: {
        cloudUrl: process.env.CONVEX_CLOUD_URL?.trim() || null,
        siteUrl: process.env.CONVEX_SITE_URL?.trim() || null,
        issuer: envIssuer,
        hasSecretKeyEnv: Boolean(process.env.CLERK_SECRET_KEY?.trim()),
        hasWebhookSecretEnv: Boolean(process.env.CLERK_WEBHOOK_SECRET?.trim()),
        envSiteUrl: process.env.SITE_URL?.trim() || null,
      },
    };

    const readiness = readinessFrom(snap);
    const decoded = publishableKey ? decodePublishableKey(publishableKey) : null;
    return {
      connected: Boolean(secretKey),
      mode: String(values.clerkConnectionMode ?? "") as "" | "manual" | "secret_key" | "keyless",
      hasSecretKey: Boolean(secretKey),
      secretKeySource: values.clerkSecretKey ? ("settings" as const) : secretKey ? ("env" as const) : ("none" as const),
      publishableKey: publishableKey || null,
      publishableKeySource: values.clerkPublishableKey
        ? ("settings" as const)
        : publishableKey
          ? ("env" as const)
          : ("none" as const),
      frontendApi: normalizeFrontendApi(String(values.clerkFrontendApi || "")) || decoded?.frontendApi || null,
      issuer,
      environmentType:
        (values.clerkEnvironmentType as "" | "development" | "production") || decoded?.environmentType || "",
      instanceId: String(values.clerkInstanceId ?? ""),
      claimUrl: String(values.clerkClaimUrl ?? ""),
      dashboardUrl: String(values.clerkDashboardUrl ?? ""),
      claimedAt: (values.clerkClaimedAt as number | null) ?? null,
      connectedAt: (values.clerkConnectedAt as number | null) ?? null,
      jwtTemplateId: String(values.clerkJwtTemplateId ?? ""),
      svixConfigured: Boolean(values.clerkSvixConfigured),
      siteOrigins: Array.isArray(values.clerkSiteOrigins) ? (values.clerkSiteOrigins as string[]) : [],
      capabilities: (values.clerkCapabilities as AuthCapabilities | null) ?? null,
      capabilitiesSyncedAt: (values.clerkCapabilitiesSyncedAt as number | null) ?? null,
      lastVerifiedAt: (values.clerkLastVerifiedAt as number | null) ?? null,
      lastVerification: (values.clerkLastVerification as Record<string, unknown> | null) ?? null,
      webhook: {
        url: webhookEndpointUrl(httpActionsOrigin),
        secretStored: Boolean(webhookSecret),
        lastReceivedAt: (values.clerkWebhookLastReceivedAt as number | null) ?? null,
      },
      deployment: {
        origin: deploymentOrigin,
        httpActionsOrigin,
        issuer: envIssuer,
        hasSecretKeyEnv: Boolean(process.env.CLERK_SECRET_KEY?.trim()),
        issuerMatches: Boolean(issuer && envIssuer && normalizeFrontendApi(envIssuer) === issuer),
        /** Exactly what must be live on this deployment for customer tokens to be trusted. */
        requiredEnv: issuer
          ? [
              { name: "CLERK_JWT_ISSUER_DOMAIN", value: issuer },
              { name: "CLERK_SECRET_KEY", secret: true },
              ...(webhookSecret ? [{ name: "CLERK_WEBHOOK_SECRET", secret: true }] : []),
            ]
          : [],
      },
      readiness,
    };
  },
});

// ─── Deployment environment hand-off ────────────────────────────────────────

/**
 * The exact env var changes the desktop app / control plane must apply to this
 * deployment. Returns the decrypted secret for that single purpose; gated on
 * manage_options, the same trust level that entered it.
 */
export const deploymentEnvChanges = query({
  args: {},
  handler: async (ctx): Promise<Array<{ name: string; value: string | null }>> => {
    await requireCan(ctx, "manage_options");
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "integrations.clerk"))
      .unique();
    const values: Record<string, unknown> = {
      ...CLERK_INTEGRATION_DEFAULTS,
      ...((doc?.values as Record<string, unknown> | undefined) ?? {}),
    };
    const issuer = normalizeFrontendApi(String(values.clerkJwtIssuerDomain || values.clerkFrontendApi || ""));
    if (!issuer) return [];
    const secretKey = await plainOrEnv(values.clerkSecretKey, process.env.CLERK_SECRET_KEY);
    const webhookSecret = await plainOrEnv(values.clerkWebhookSecret, process.env.CLERK_WEBHOOK_SECRET);
    const publishableKey = await plainOrEnv(values.clerkPublishableKey, process.env.CLERK_PUBLISHABLE_KEY);
    const changes: Array<{ name: string; value: string | null }> = [
      { name: "CLERK_JWT_ISSUER_DOMAIN", value: issuer },
    ];
    if (secretKey) changes.push({ name: "CLERK_SECRET_KEY", value: secretKey });
    if (publishableKey) changes.push({ name: "CLERK_PUBLISHABLE_KEY", value: publishableKey });
    if (webhookSecret) changes.push({ name: "CLERK_WEBHOOK_SECRET", value: webhookSecret });
    return changes;
  },
});

// ─── Small mutations ────────────────────────────────────────────────────────

export const saveWebhookSecret = mutation({
  args: { webhookSecret: v.string() },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const secret = args.webhookSecret.trim();
    if (secret && !/^whsec_[A-Za-z0-9+/=_-]{10,}$/.test(secret)) {
      throw new ConvexError({ code: "CLERK_WEBHOOK_SECRET_INVALID", message: "Signing secrets start with whsec_." });
    }
    await ctx.runMutation(internal.auth.clerkConnectionInternals.saveConnection, {
      values: { clerkWebhookSecret: secret },
    });
  },
});

export const markClaimed = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    await ctx.runMutation(internal.auth.clerkConnectionInternals.saveConnection, {
      values: { clerkClaimedAt: Date.now() },
    });
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    await ctx.runMutation(internal.auth.clerkConnectionInternals.saveConnection, {
      values: { ...CLERK_INTEGRATION_DEFAULTS },
    });
  },
});
