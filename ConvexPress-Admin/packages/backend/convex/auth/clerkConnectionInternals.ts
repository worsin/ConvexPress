// @ts-nocheck — Convex generated API union types exceed TypeScript's instantiation
// depth (TS2589) for every ctx.runQuery/runMutation/db call in this module, the
// same limitation documented in auth/clerkManagement.ts. The pure logic lives in
// clerkConnectionHelpers.ts and stays fully typed and unit-tested.
/**
 * Clerk Connection — internal reads/writes used by the connection actions.
 *
 * Keeps every database touch in query/mutation context so the actions in
 * `clerkConnection.ts` only talk to Clerk and to these functions.
 */

import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { decryptSettingSecret, encryptSettingSecret, isSecretFieldName } from "../helpers/settingsSecret";
import { CLERK_INTEGRATION_DEFAULTS, GENERAL_DEFAULTS } from "../settings/defaults";

const SECTION = "integrations.clerk" as const;

export interface ClerkConnectionSnapshot {
  values: Record<string, unknown>;
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
  site: {
    siteUrl: string;
    homeUrl: string;
    identitySiteOrigin: string | null;
    identityDeploymentOrigin: string | null;
    identityManagementOrigin: string | null;
  };
  deployment: {
    cloudUrl: string | null;
    siteUrl: string | null;
    issuer: string | null;
    hasSecretKeyEnv: boolean;
    hasWebhookSecretEnv: boolean;
    envSiteUrl: string | null;
  };
}

async function readSection(ctx: { db: any }, section: string) {
  return ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", section))
    .unique();
}

async function plain(value: unknown): Promise<string> {
  if (typeof value !== "string" || !value.trim()) return "";
  const raw = value.trim();
  if (raw.startsWith("enc:") || raw.startsWith("b64:")) return (await decryptSettingSecret(raw)) || "";
  return raw;
}

/** Everything the connection pipeline needs, secrets decrypted. Internal only. */
export const readConnection = internalQuery({
  args: {},
  handler: async (ctx): Promise<ClerkConnectionSnapshot> => {
    const doc = await readSection(ctx, SECTION);
    const values: Record<string, unknown> = {
      ...CLERK_INTEGRATION_DEFAULTS,
      ...((doc?.values as Record<string, unknown> | undefined) ?? {}),
    };
    const generalDoc = await readSection(ctx, "general");
    const general: Record<string, unknown> = {
      ...GENERAL_DEFAULTS,
      ...((generalDoc?.values as Record<string, unknown> | undefined) ?? {}),
    };
    const identity = await ctx.db
      .query("convexpress_siteIdentity")
      .withIndex("by_identity_key", (q: any) => q.eq("identityKey", "site-identity"))
      .unique();

    return {
      values,
      secretKey: (await plain(values.clerkSecretKey)) || process.env.CLERK_SECRET_KEY?.trim() || "",
      webhookSecret: (await plain(values.clerkWebhookSecret)) || process.env.CLERK_WEBHOOK_SECRET?.trim() || "",
      publishableKey:
        (await plain(values.clerkPublishableKey)) || process.env.CLERK_PUBLISHABLE_KEY?.trim() || "",
      site: {
        siteUrl: typeof general.siteUrl === "string" ? general.siteUrl : "",
        homeUrl: typeof general.homeUrl === "string" ? general.homeUrl : "",
        identitySiteOrigin: identity?.siteOrigin ?? null,
        identityDeploymentOrigin: identity?.deploymentOrigin ?? null,
        identityManagementOrigin: identity?.managementOrigin ?? null,
      },
      deployment: {
        cloudUrl: process.env.CONVEX_CLOUD_URL?.trim() || null,
        siteUrl: process.env.CONVEX_SITE_URL?.trim() || null,
        issuer: process.env.CLERK_JWT_ISSUER_DOMAIN?.trim() || null,
        hasSecretKeyEnv: Boolean(process.env.CLERK_SECRET_KEY?.trim()),
        hasWebhookSecretEnv: Boolean(process.env.CLERK_WEBHOOK_SECRET?.trim()),
        envSiteUrl: process.env.SITE_URL?.trim() || null,
      },
    };
  },
});

/**
 * Merge a partial set of Clerk connection values into the settings section.
 * Secret-named fields are encrypted at rest exactly like `updateSection` does.
 * Requires a signed-in operator unless `system` is set (webhook receipts).
 */
export const saveConnection = internalMutation({
  args: {
    values: v.any(),
    system: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const incoming = (args.values ?? {}) as Record<string, unknown>;
    const doc = await readSection(ctx, SECTION);
    const user = await getCurrentUser(ctx);
    if (!user && !args.system) throw new Error("Sign in to change the Clerk connection.");
    if (!user && !doc) return; // nothing to annotate yet

    const next: Record<string, unknown> = {
      ...CLERK_INTEGRATION_DEFAULTS,
      ...((doc?.values as Record<string, unknown> | undefined) ?? {}),
    };
    for (const [key, value] of Object.entries(incoming)) {
      if (!(key in CLERK_INTEGRATION_DEFAULTS)) continue;
      if (isSecretFieldName(key) && typeof value === "string" && value.length > 0) {
        next[key] = await encryptSettingSecret(value);
      } else {
        next[key] = value;
      }
    }
    const now = Date.now();
    if (doc) {
      await ctx.db.patch(doc._id, {
        values: next,
        updatedAt: now,
        updatedBy: user?._id ?? doc.updatedBy,
      });
    } else {
      await ctx.db.insert("settings", {
        section: SECTION,
        values: next,
        updatedAt: now,
        updatedBy: user!._id,
      });
    }
  },
});

/** Stamp the last verified webhook delivery. Called from the webhook handler. */
export const markWebhookReceived = internalMutation({
  args: { at: v.number() },
  handler: async (ctx, args) => {
    const doc = await readSection(ctx, SECTION);
    if (!doc) return;
    const values = { ...(doc.values as Record<string, unknown>) };
    const previous = values.clerkWebhookLastReceivedAt;
    // Avoid a write per event: only stamp when older than a minute.
    if (typeof previous === "number" && args.at - previous < 60_000) return;
    values.clerkWebhookLastReceivedAt = args.at;
    await ctx.db.patch(doc._id, { values, updatedAt: Date.now() });
  },
});
