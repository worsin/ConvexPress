// @ts-nocheck — Convex generated API union types exceed TypeScript's instantiation
// depth (TS2589) for every ctx.runQuery/runMutation/db call in this module, the
// same limitation documented in auth/clerkManagement.ts. The pure logic lives in
// clerkConnectionHelpers.ts and stays fully typed and unit-tested.
/**
 * Clerk — public website contract.
 *
 * `getWebsiteAuthConfig` is PUBLIC (no auth): the storefront calls it during
 * SSR to learn which Clerk application to load and how Clerk is configured
 * (which sign-up fields exist, which social providers are on, captcha, legal
 * consent, password rules, second factors). Nothing secret leaves here: the
 * publishable key is public by design and the capabilities document is what
 * Clerk itself serves unauthenticated from its Frontend API.
 */

import { query } from "../_generated/server";
import { decryptSettingSecret } from "../helpers/settingsSecret";
import { CLERK_INTEGRATION_DEFAULTS } from "../settings/defaults";
import {
  decodePublishableKey,
  defaultAuthCapabilities,
  normalizeFrontendApi,
  type AuthCapabilities,
} from "./clerkConnectionHelpers";

import { v } from "convex/values";
async function plainOrEnv(value: unknown, env: string | undefined): Promise<string> {
  if (typeof value === "string" && value.trim()) {
    const raw = value.trim();
    if (raw.startsWith("enc:") || raw.startsWith("b64:")) return (await decryptSettingSecret(raw)) || "";
    return raw;
  }
  return env?.trim() || "";
}

export interface WebsiteAuthConfig {
  provider: "clerk" | "none";
  publishableKey: string | null;
  frontendApi: string | null;
  environmentType: "development" | "production" | null;
  /** True when this deployment will accept tokens from that Clerk app. */
  deploymentTrustsIssuer: boolean;
  capabilities: AuthCapabilities;
  capabilitiesSyncedAt: number | null;
  connectionMode: "" | "manual" | "secret_key" | "keyless";
}

export const getWebsiteAuthConfig = query({
  args: {},
  returns: v.object({
    provider: v.union(v.literal("none"), v.literal("clerk")),
    publishableKey: v.union(v.null(), v.string()),
    frontendApi: v.union(v.null(), v.string()),
    environmentType: v.union(v.null(), v.literal("production"), v.literal("development")),
    deploymentTrustsIssuer: v.boolean(),
    capabilities: v.object({
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
    }),
    capabilitiesSyncedAt: v.union(v.null(), v.number()),
    connectionMode: v.union(v.literal(""), v.literal("manual"), v.literal("secret_key"), v.literal("keyless")),
  }),
  handler: async (ctx): Promise<WebsiteAuthConfig> => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "integrations.clerk"))
      .unique();
    const values: Record<string, unknown> = {
      ...CLERK_INTEGRATION_DEFAULTS,
      ...((doc?.values as Record<string, unknown> | undefined) ?? {}),
    };
    const publishableKey = await plainOrEnv(values.clerkPublishableKey, process.env.CLERK_PUBLISHABLE_KEY);
    const decoded = publishableKey ? decodePublishableKey(publishableKey) : null;
    const frontendApi =
      normalizeFrontendApi(String(values.clerkFrontendApi || values.clerkJwtIssuerDomain || "")) ||
      decoded?.frontendApi ||
      null;
    const envIssuer = normalizeFrontendApi(process.env.CLERK_JWT_ISSUER_DOMAIN ?? "");
    const stored = values.clerkCapabilities as AuthCapabilities | null;
    const capabilities = stored && stored.version === 1 ? stored : defaultAuthCapabilities();

    return {
      provider: publishableKey ? "clerk" : "none",
      publishableKey: publishableKey || null,
      frontendApi,
      environmentType:
        (values.clerkEnvironmentType as "development" | "production" | "") || decoded?.environmentType || null,
      deploymentTrustsIssuer: Boolean(frontendApi && envIssuer && envIssuer === frontendApi),
      capabilities,
      capabilitiesSyncedAt: (values.clerkCapabilitiesSyncedAt as number | null) ?? null,
      connectionMode: (values.clerkConnectionMode as "" | "manual" | "secret_key" | "keyless") ?? "",
    };
  },
});
