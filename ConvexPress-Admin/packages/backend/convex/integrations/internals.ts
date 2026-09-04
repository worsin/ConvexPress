/**
 * Integrations — internal functions used by the verification action.
 *
 * `loadProviderConfiguration` returns the RAW stored values for a provider
 * (secrets still encrypted). Only the node action decrypts them, right before
 * the outbound request, and nothing decrypted is ever written back.
 */

import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { getDefaults, type SettingsSection } from "../settings/defaults";
import { getCurrentUserId } from "../helpers/permissions";
import {
  integrationCheckDetailValidator,
  integrationCheckStatusValidator,
} from "../schema/integrations";
import { getIntegration } from "./registry";
import { fingerprintConfiguration } from "./fingerprint";

export function envPresence(name: string | undefined): boolean {
  if (!name) return false;
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Raw configuration for a provider: stored section values (secrets remain
 * ciphertext), the env fallbacks that exist, and the fingerprint the check
 * will be stamped with.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const loadProviderConfiguration = internalQuery({
  args: { providerId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const definition = getIntegration(args.providerId);
    if (!definition) throw new Error(`Unknown integration: ${args.providerId}`);

    let values: Record<string, unknown> = {};
    if (definition.storage.kind === "settings") {
      const section = definition.storage.section as SettingsSection;
      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q: any) => q.eq("section", section))
        .unique();
      values = { ...getDefaults(section), ...((doc?.values as Record<string, unknown>) ?? {}) };
    }

    // Env fallbacks apply only where nothing is stored, mirroring the
    // overview query so fingerprints line up.
    const storedEmpty = (key: string) => {
      const stored = values[key];
      return typeof stored === "string" ? stored.trim().length === 0 : stored === undefined || stored === null;
    };
    const envValues: Record<string, string> = {};
    for (const field of definition.fields) {
      if (field.env && storedEmpty(field.key) && envPresence(field.env)) {
        envValues[field.key] = process.env[field.env] as string;
      }
    }
    // The AI key's env fallback depends on the selected provider.
    if (definition.id === "ai" && storedEmpty("apiKey")) {
      const provider = String(values.provider ?? "openrouter");
      const envName =
        provider === "openai"
          ? "OPENAI_API_KEY"
          : provider === "anthropic"
            ? "ANTHROPIC_API_KEY"
            : "OPENROUTER_API_KEY";
      if (envPresence(envName)) envValues.apiKey = process.env[envName] as string;
    }

    return {
      values,
      envValues,
      fingerprint: fingerprintConfiguration({
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        ...Object.fromEntries(
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          definition.fields.map((field) => [field.key, values[field.key]]),
        ),
        ...Object.fromEntries(
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          Object.keys(envValues).map((key) => [`env:${key}`, true]),
        ),
      }),
    };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordCheck = internalMutation({
  args: {
    providerId: v.string(),
    status: integrationCheckStatusValidator,
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    checkedBy: v.optional(v.id("users")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    latencyMs: v.optional(v.number()),
    summary: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    details: v.array(integrationCheckDetailValidator),
    configFingerprint: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("integration_checks")
      .withIndex("by_provider", (q: any) => q.eq("providerId", args.providerId))
      .unique();
    const row = {
      providerId: args.providerId,
      status: args.status,
      checkedAt: Date.now(),
      checkedBy: args.checkedBy,
      latencyMs: args.latencyMs,
      summary: args.summary.slice(0, 300),
      details: args.details.slice(0, 12).map((detail: { label: string; ok: boolean; note?: string }) => ({
        label: detail.label.slice(0, 80),
        ok: detail.ok,
        note: detail.note?.slice(0, 200),
      })),
      configFingerprint: args.configFingerprint,
    };
    if (existing) {
      await ctx.db.replace(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("integration_checks", row);
  },
});

/** Identity of the calling operator for `checkedBy` stamps. */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const currentOperatorId = internalQuery({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => getCurrentUserId(ctx),
});
