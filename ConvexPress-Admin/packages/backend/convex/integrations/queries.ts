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
import { getShippingProviderDescriptor } from "../shipping/providers";
import { fingerprintConfiguration } from "./fingerprint";
import { envPresence } from "./internals";
import { INTEGRATIONS, RUNTIME_ENVIRONMENT, type IntegrationField } from "./registry";

/** Overview shapes (kept as types; validators here blow the TS instantiation budget). */
export type OverviewFieldState = "set" | "env" | "empty";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const overview = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");

    const checks = await ctx.db.query("integration_checks").collect();
    const checkFor = new Map(checks.map((row: any) => [row.providerId as string, row]));

    const shippingConnections = await ctx.db.query("shipping_provider_connections").collect();
    const shippingSecrets = await ctx.db.query("shipping_provider_secrets").collect();

    const providers: Array<Record<string, unknown>> = [];
    for (const definition of INTEGRATIONS) {
      let values: Record<string, unknown> = {};
      if (definition.storage.kind === "settings") {
        const section = definition.storage.section as SettingsSection;
        const doc = await ctx.db
          .query("settings")
          .withIndex("by_section", (q: any) => q.eq("section", section))
          .unique();
        values = { ...getDefaults(section), ...((doc?.values as Record<string, unknown>) ?? {}) };
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
      const fields = definition.fields.map((field: IntegrationField) => {
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

      let shipping = null;
      let configured: boolean;
      let missing: string[];
      if (definition.storage.kind === "shipping") {
        const provider = definition.storage.provider;
        const connection = shippingConnections.find((entry: any) => entry.provider === provider) ?? null;
        const secretRow = connection
          ? shippingSecrets.find((secret: any) => secret.connectionId === connection._id) ?? null
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
      const check = row
        ? {
            status: row.status,
            checkedAt: row.checkedAt,
            latencyMs: row.latencyMs ?? null,
            summary: row.summary,
            details: row.details.map((detail: any) => ({
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
    return { encryption, providers };
  },
});

/** Presence (never values) of the runtime environment variables. */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const environment = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
