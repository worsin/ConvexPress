/**
 * Clerk Connection — internal reads/writes used by the connection actions.
 *
 * Keeps every database touch in query/mutation context so the actions in
 * `clerkConnection.ts` only talk to Clerk and to these functions.
 */

import { v } from "convex/values";

import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { decryptSettingSecret, encryptSettingSecret, isSecretFieldName } from "../helpers/settingsSecret";
import { CLERK_INTEGRATION_DEFAULTS, GENERAL_DEFAULTS, type ClerkIntegrationSettings } from "../settings/defaults";
import { readClerkIntegrationSettings } from "./clerkConnectionHelpers";
import { clerkIntegrationSettingsPatchValidator } from "./clerkValidators";
import { insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";

const SECTION = "integrations.clerk" as const;

export interface ClerkConnectionSnapshot {
  values: ClerkIntegrationSettings;
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

async function readSection(ctx: Pick<QueryCtx, "db">, section: typeof SECTION | "general") {
  return ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", section))
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
  returns: v.object({
    values: v.object({
      clerkSecretKey: v.string(),
      clerkWebhookSecret: v.string(),
      clerkJwtIssuerDomain: v.string(),
      clerkPublishableKey: v.string(),
      clerkFrontendApi: v.string(),
      clerkEnvironmentType: v.union(v.literal(""), v.literal("production"), v.literal("development")),
      clerkInstanceId: v.string(),
      clerkConnectionMode: v.union(v.literal(""), v.literal("manual"), v.literal("secret_key"), v.literal("keyless")),
      clerkClaimUrl: v.string(),
      clerkDashboardUrl: v.string(),
      clerkClaimedAt: v.union(v.null(), v.number()),
      clerkConnectedAt: v.union(v.null(), v.number()),
      clerkJwtTemplateId: v.string(),
      clerkSvixConfigured: v.boolean(),
      clerkSiteOrigins: v.array(v.string()),
      clerkCapabilities: v.union(v.null(), v.object({
        version: v.literal(1),
        applicationName: v.union(v.null(), v.string()),
        environmentType: v.union(v.null(), v.literal("production"), v.literal("development")),
        attributes: v.object({
          emailAddress: v.object({
            enabled: v.boolean(),
            required: v.boolean(),
            verifications: v.array(v.union(v.literal("email_code"), v.literal("email_link"), v.literal("phone_code"))),
            usedForFirstFactor: v.boolean(),
            usedForSecondFactor: v.boolean(),
          }),
          phoneNumber: v.object({
            enabled: v.boolean(),
            required: v.boolean(),
            verifications: v.array(v.union(v.literal("email_code"), v.literal("email_link"), v.literal("phone_code"))),
            usedForFirstFactor: v.boolean(),
            usedForSecondFactor: v.boolean(),
          }),
          username: v.object({
            enabled: v.boolean(),
            required: v.boolean(),
            verifications: v.array(v.union(v.literal("email_code"), v.literal("email_link"), v.literal("phone_code"))),
            usedForFirstFactor: v.boolean(),
            usedForSecondFactor: v.boolean(),
          }),
          firstName: v.object({
            enabled: v.boolean(),
            required: v.boolean(),
            verifications: v.array(v.union(v.literal("email_code"), v.literal("email_link"), v.literal("phone_code"))),
            usedForFirstFactor: v.boolean(),
            usedForSecondFactor: v.boolean(),
          }),
          lastName: v.object({
            enabled: v.boolean(),
            required: v.boolean(),
            verifications: v.array(v.union(v.literal("email_code"), v.literal("email_link"), v.literal("phone_code"))),
            usedForFirstFactor: v.boolean(),
            usedForSecondFactor: v.boolean(),
          }),
          password: v.object({
            enabled: v.boolean(),
            required: v.boolean(),
            verifications: v.array(v.union(v.literal("email_code"), v.literal("email_link"), v.literal("phone_code"))),
            usedForFirstFactor: v.boolean(),
            usedForSecondFactor: v.boolean(),
          }),
        }),
        social: v.array(v.string()),
        signUp: v.object({
          mode: v.union(v.literal("public"), v.literal("restricted"), v.literal("waitlist")),
          captchaEnabled: v.boolean(),
          captchaWidgetType: v.union(v.null(), v.literal("smart"), v.literal("invisible")),
          legalConsentEnabled: v.boolean(),
          progressive: v.boolean(),
        }),
        signIn: v.object({
          preferredStrategy: v.union(v.literal("password"), v.literal("otp")),
          secondFactorRequired: v.boolean(),
          firstFactors: v.array(v.string()),
          secondFactors: v.array(v.string()),
        }),
        password: v.object({
          enabled: v.boolean(),
          required: v.boolean(),
          minLength: v.number(),
          maxLength: v.number(),
          requireSpecialChar: v.boolean(),
          requireNumbers: v.boolean(),
          requireUppercase: v.boolean(),
          requireLowercase: v.boolean(),
          allowedSpecialCharacters: v.string(),
          showZxcvbn: v.boolean(),
          minZxcvbnStrength: v.number(),
        }),
        passkeys: v.object({ enabled: v.boolean() }),
        links: v.object({
          termsUrl: v.union(v.null(), v.string()),
          privacyPolicyUrl: v.union(v.null(), v.string()),
          supportEmail: v.union(v.null(), v.string()),
        }),
      })),
      clerkCapabilitiesSyncedAt: v.union(v.null(), v.number()),
      clerkLastVerification: v.union(v.null(), v.object({
        checkedAt: v.optional(v.number()),
        secretKeyValid: v.optional(v.boolean()),
        secretKeyError: v.optional(v.string()),
        jwtTemplatePresent: v.optional(v.boolean()),
        jwtTemplateAudienceOk: v.optional(v.boolean()),
        jwksKeyCount: v.optional(v.union(v.null(), v.number())),
        tokenProbeAt: v.optional(v.number()),
        tokenProbeOk: v.optional(v.boolean()),
      })),
      clerkLastVerifiedAt: v.union(v.null(), v.number()),
      clerkWebhookLastReceivedAt: v.union(v.null(), v.number()),
    }),
    secretKey: v.string(),
    webhookSecret: v.string(),
    publishableKey: v.string(),
    site: v.object({
      siteUrl: v.string(),
      homeUrl: v.string(),
      identitySiteOrigin: v.union(v.null(), v.string()),
      identityDeploymentOrigin: v.union(v.null(), v.string()),
      identityManagementOrigin: v.union(v.null(), v.string()),
    }),
    deployment: v.object({
      cloudUrl: v.union(v.null(), v.string()),
      siteUrl: v.union(v.null(), v.string()),
      issuer: v.union(v.null(), v.string()),
      hasSecretKeyEnv: v.boolean(),
      hasWebhookSecretEnv: v.boolean(),
      envSiteUrl: v.union(v.null(), v.string()),
    }),
  }),
  handler: async (ctx): Promise<ClerkConnectionSnapshot> => {
    const doc = await readSection(ctx, SECTION);
    const values = readClerkIntegrationSettings(doc?.values, CLERK_INTEGRATION_DEFAULTS);
    const generalDoc = await readSection(ctx, "general");
    const generalValues: unknown = generalDoc?.values;
    const general: Record<string, unknown> = {
      ...GENERAL_DEFAULTS,
      ...(generalValues && typeof generalValues === "object" && !Array.isArray(generalValues) ? generalValues : {}),
    };
    const identity = await ctx.db
      .query("convexpress_siteIdentity")
      .withIndex("by_identity_key", (q) => q.eq("identityKey", "site-identity"))
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
    values: clerkIntegrationSettingsPatchValidator,
    system: v.optional(v.boolean()),
    /** For a system write that creates the settings: whom they're attributed to. */
    actorId: v.optional(v.id("users")),
  },
  /** Whether the settings were written. */
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const incoming: Record<string, unknown> = args.values;
    const doc = await readSection(ctx, SECTION);
    const user = await getCurrentUser(ctx);
    if (!user && !args.system) throw new Error("Sign in to change the Clerk connection.");
    const updatedBy = user?._id ?? doc?.updatedBy ?? (args.system ? args.actorId : undefined);
    if (!updatedBy) return false; // a system write with no one to attribute new settings to

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
      await patchWithMediaReferences<"settings">(ctx, "settings", doc._id, {
        values: next,
        updatedAt: now,
        updatedBy,
      });
    } else {
      await insertWithMediaReferences<"settings">(ctx, "settings", {
        section: SECTION,
        values: next,
        updatedAt: now,
        updatedBy,
      });
    }
    return true;
  },
});

/** Stamp the last verified webhook delivery. Called from the webhook handler. */
export const markWebhookReceived = internalMutation({
  args: { at: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await readSection(ctx, SECTION);
    if (!doc) return;
    const values = { ...(doc.values as Record<string, unknown>) };
    const previous = values.clerkWebhookLastReceivedAt;
    // Avoid a write per event: only stamp when older than a minute.
    if (typeof previous === "number" && args.at - previous < 60_000) return;
    values.clerkWebhookLastReceivedAt = args.at;
    await patchWithMediaReferences<"settings">(ctx, "settings", doc._id, { values, updatedAt: Date.now() });
  },
});
