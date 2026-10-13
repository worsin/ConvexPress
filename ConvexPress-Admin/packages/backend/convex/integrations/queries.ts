/**
 * Integrations — readiness overview for the admin hub.
 *
 * One subscription answers: for every provider, which fields are set (and
 * from where), whether the provider counts as configured, the last real
 * verification result, and whether that result is stale. Secrets never
 * leave this function: secret fields report a state, not a value.
 */

import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { isSecretFieldName } from "../helpers/settingsSecret";
import { getDefaults, type SettingsSection } from "../settings/defaults";
import { SHIPPING_PROVIDERS } from "../shipping/helpers";
import { getShippingProviderDescriptor, type ShippingProviderDescriptor } from "../shipping/providers";
import type { Doc } from "../_generated/dataModel";
import { fingerprintConfiguration } from "./fingerprint";
import { envPresence, settingsValues } from "./internals";
import { collectLegacySecrets } from "../helpers/settingsSecretUpgrade";
import { INTEGRATIONS, RUNTIME_ENVIRONMENT, type IntegrationField } from "./registry";

import { v } from "convex/values";
/** Overview shapes. */
export type OverviewFieldState = "set" | "env" | "empty";

export interface OverviewField {
  key: string;
  state: OverviewFieldState;
  value: string | boolean | null;
  envName: string | null;
}

export interface OverviewCheck {
  status: Doc<"integration_checks">["status"];
  checkedAt: number;
  latencyMs: number | null;
  summary: string;
  details: Array<{ label: string; ok: boolean; note: string | null }>;
  stale: boolean;
}

export interface OverviewShipping {
  connectionStatus: Doc<"shipping_provider_connections">["status"] | null;
  mode: Doc<"shipping_provider_connections">["mode"] | null;
  secretStored: boolean;
  lastVerifiedAt: number | null;
  lastErrorMessage: string | null;
  implementationStatus: ShippingProviderDescriptor["implementationStatus"];
  credentialFields: Array<{
    key: string;
    label: string;
    type: ShippingProviderDescriptor["credentialFields"][number]["type"];
    required: boolean;
    placeholder: string | null;
  }>;
}

export interface OverviewProvider {
  id: string;
  fields: OverviewField[];
  configured: boolean;
  missing: string[];
  check: OverviewCheck | null;
  shipping: OverviewShipping | null;
}

export const overview = query({
  args: {},
  returns: v.object({
    encryption: v.union(v.literal("aes-gcm"), v.literal("base64")),
    legacySecrets: v.number(),
    providers: v.array(v.object({
      id: v.string(),
      fields: v.array(v.object({
        key: v.string(),
        state: v.union(v.literal("set"), v.literal("env"), v.literal("empty")),
        value: v.union(v.boolean(), v.null(), v.string()),
        envName: v.union(v.null(), v.string()),
      })),
      configured: v.boolean(),
      missing: v.array(v.string()),
      check: v.union(v.null(), v.object({
        status: v.union(v.literal("verified"), v.literal("skipped"), v.literal("failed")),
        checkedAt: v.number(),
        latencyMs: v.union(v.null(), v.number()),
        summary: v.string(),
        details: v.array(v.object({ label: v.string(), ok: v.boolean(), note: v.union(v.null(), v.string()) })),
        stale: v.boolean(),
      })),
      shipping: v.union(v.null(), v.object({
        connectionStatus: v.union(v.null(), v.literal("error"), v.literal("disconnected"), v.literal("connected"), v.literal("degraded")),
        mode: v.union(v.null(), v.literal("sandbox"), v.literal("production")),
        secretStored: v.boolean(),
        lastVerifiedAt: v.union(v.null(), v.number()),
        lastErrorMessage: v.union(v.null(), v.string()),
        implementationStatus: v.union(v.literal("active"), v.literal("foundation"), v.literal("planned")),
        credentialFields: v.array(v.object({
          key: v.string(),
          label: v.string(),
          type: v.union(v.literal("url"), v.literal("password"), v.literal("text")),
          required: v.boolean(),
          placeholder: v.union(v.null(), v.string()),
        })),
      })),
    })),
  }),
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");

    const checks = await ctx.db.query("integration_checks").collect();
    const checkFor = new Map(checks.map((row) => [row.providerId, row] as const));

    const shippingConnections = await ctx.db.query("shipping_provider_connections").collect();
    const shippingSecrets = await ctx.db.query("shipping_provider_secrets").collect();

    const providers: OverviewProvider[] = [];
    for (const definition of INTEGRATIONS) {
      let values: Record<string, unknown> = {};
      if (definition.storage.kind === "settings") {
        const section = definition.storage.section as SettingsSection;
        const doc = await ctx.db
          .query("settings")
          .withIndex("by_section", (q) => q.eq("section", section))
          .unique();
        values = { ...getDefaults(section), ...settingsValues(doc?.values) };
      }

      const aiEnv =
        definition.id === "ai"
          ? String(values.provider ?? "openrouter") === "openai"
            ? "OPENAI_API_KEY"
            : String(values.provider ?? "openrouter") === "anthropic"
              ? "ANTHROPIC_API_KEY"
              : "OPENROUTER_API_KEY"
          : null;

      const fingerprintInput: Record<string, unknown> = {};
      const fields = definition.fields.map((field: IntegrationField): OverviewField => {
        const envName = field.key === "apiKey" && aiEnv ? aiEnv : (field.env ?? null);
        const stored =
          definition.storage.kind === "env" ? undefined : values[field.key];
        const hasStored =
          typeof stored === "string"
            ? stored.trim().length > 0
            : typeof stored === "boolean"
              ? true
              : stored !== undefined && stored !== null;
        const state: "set" | "env" | "empty" = hasStored
          ? "set"
          : envPresence(envName ?? undefined)
            ? "env"
            : "empty";
        const secret = field.kind === "secret" || field.kind === "json" || isSecretFieldName(field.key);
        fingerprintInput[field.key] = stored;
        if (state === "env") fingerprintInput[`env:${field.key}`] = true;
        return {
          key: field.key,
          state,
          value: secret
            ? null
            : typeof stored === "string" || typeof stored === "boolean"
              ? stored
              : null,
          envName,
        };
      });

      let shipping: OverviewShipping | null = null;
      let configured: boolean;
      let missing: string[];
      if (definition.storage.kind === "shipping") {
        const provider = definition.storage.provider;
        const connection = shippingConnections.find((entry) => entry.provider === provider) ?? null;
        const secretRow = connection
          ? shippingSecrets.find((secret) => secret.connectionId === connection._id) ?? null
          : null;
        const secretStored = Boolean(secretRow);
        const descriptor = getShippingProviderDescriptor(provider);
        shipping = {
          connectionStatus: connection?.status ?? null,
          mode: connection?.mode ?? null,
          secretStored,
          lastVerifiedAt: connection?.lastVerifiedAt ?? null,
          lastErrorMessage: connection?.lastErrorMessage ?? null,
          implementationStatus: descriptor.implementationStatus,
          credentialFields: descriptor.credentialFields.map((field) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            required: field.required,
            placeholder: field.placeholder ?? null,
          })),
        };
        configured = secretStored;
        missing = secretStored ? [] : ["Carrier credentials"];
        fingerprintInput.secretStored = secretStored;
        fingerprintInput.secretVersion = secretRow?.secretVersion ?? null;
      } else if (definition.storage.kind === "link") {
        configured = true;
        missing = [];
      } else if (definition.id === "captcha") {
        configured = fields.some((field) => field.state !== "empty");
        missing = configured ? [] : ["Any CAPTCHA secret"];
      } else {
        const required = definition.fields.filter((field) => field.required);
        // Toggle-gated optional groups (KB / support search) only require
        // their fields when the toggle is on.
        const gatedOff = (key: string) =>
          (key.startsWith("meilisearch") && values.meilisearchEnabled === false) ||
          (key.startsWith("rag") && values.ragEnabled === false);
        const active = required.filter((field) => !gatedOff(field.key));
        missing = active
          .filter((field) => fields.find((entry) => entry.key === field.key)?.state === "empty")
          .map((field) => field.label);
        // Every required field switched off (KB search with indexing and
        // answers disabled) is "off", not "configured".
        configured = missing.length === 0 && active.length > 0;
      }

      const row = checkFor.get(definition.id);
      const check: OverviewCheck | null = row
        ? {
            status: row.status,
            checkedAt: row.checkedAt,
            latencyMs: row.latencyMs ?? null,
            summary: row.summary,
            details: row.details.map((detail) => ({
              label: detail.label,
              ok: detail.ok,
              note: detail.note ?? null,
            })),
            stale: row.configFingerprint !== fingerprintConfiguration(fingerprintInput),
          }
        : null;

      providers.push({ id: definition.id, fields, configured, missing, check, shipping });
    }

    const encryption: "aes-gcm" | "base64" = envPresence("SHIPPING_PROVIDER_ENCRYPTION_KEY")
      ? "aes-gcm"
      : "base64";
    // Secrets saved before the key existed are still reversible until re-sealed.
    const settingsDocs = await ctx.db.query("settings").collect();
    const legacySecrets = settingsDocs.reduce(
      (count, doc) => count + collectLegacySecrets(doc.values).length,
      0,
    );
    return { encryption, legacySecrets, providers };
  },
});

/** Presence (never values) of the runtime environment variables. */
export const environment = query({
  args: {},
  returns: v.array(v.object({
    group: v.string(),
    description: v.string(),
    keys: v.array(v.object({ name: v.string(), detail: v.string(), optional: v.boolean(), set: v.boolean() })),
  })),
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    return RUNTIME_ENVIRONMENT.map((group) => ({
      group: group.group,
      description: group.description,
      keys: group.keys.map((key: { name: string; detail: string; optional?: boolean }) => ({
        name: key.name,
        detail: key.detail,
        optional: key.optional ?? false,
        set: envPresence(key.name),
      })),
    }));
  },
});

// Keep the carrier list referenced so registry and shipping stay in sync at type level.
void SHIPPING_PROVIDERS;
