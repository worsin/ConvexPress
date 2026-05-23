/**
 * Settings System - Public Mutations
 *
 * Two mutations:
 *   - updateSection: The main mutation for updating any of the 6 settings sections.
 *     Validates input, computes a diff, upserts the document, and emits events.
 *   - importAll: Imports settings from a JSON export. Upserts each section and
 *     emits events for each changed section.
 *
 * Both mutations require Administrator-level access via capability checks.
 *
 * Usage:
 *   // Client-side
 *   const updateSettings = useMutation(api.settings.mutations.updateSection);
 *   await updateSettings({ section: "general", values: { siteTitle: "New Title" } });
 */

import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { ConvexError } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SETTINGS_EVENTS, SYSTEM } from "../events/constants";
import { updateSectionArgs, importAllArgs } from "./validators";
import {
  getDefaults,
  isValidSection,
  SECTION_NAMES,
  type SettingsSection,
} from "./defaults";
import { computeChanges } from "./helpers";
import { validateSectionValues } from "./validation";
import { runBootstrapShippingTemplates } from "../shipping/bootstrap";
import { isPluginEnabled } from "../helpers/plugins";
import {
  SECRET_SENTINEL,
  encryptSettingSecret,
  isSecretFieldName,
  redactSettingSecrets,
} from "../helpers/settingsSecret";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map from settings section name to the specific capability required.
 */
const SECTION_CAPABILITY_MAP: Record<
  SettingsSection,
  | "settings.update_general"
  | "settings.update_reading"
  | "settings.update_writing"
  | "settings.update_discussion"
  | "settings.update_permalinks"
  | "settings.update_privacy"
  | "settings.update_email"
  | "manage_options"
> = {
  general: "settings.update_general",
  reading: "settings.update_reading",
  writing: "settings.update_writing",
  discussion: "settings.update_discussion",
  permalinks: "settings.update_permalinks",
  privacy: "settings.update_privacy",
  email: "settings.update_email",
  media: "manage_options",
  analytics: "manage_options",
  ai: "manage_options",
  blocks: "manage_options",
  plugins: "manage_options",
  search: "manage_options",
  // Knowledge Base System sections
  "kb.general": "manage_options",
  "kb.features": "manage_options",
  "kb.search": "manage_options",
  // Ticket System sections
  "ticket.general": "manage_options",
  "ticket.sla": "manage_options",
  // Support Bridge System sections
  "support.widget": "manage_options",
  "support.ai": "manage_options",
  // Website Appearance sections
  layout: "manage_options",
  header: "manage_options",
  footer: "manage_options",
  // Commerce / integrations
  "commerce.general": "manage_options",
  "commerce.payments": "manage_options",
  "commerce.subscriptions.counters": "manage_options",
  "integrations.shipping": "manage_options",
  "integrations.shipping.shipstation": "manage_options",
  "integrations.shipping.ups": "manage_options",
  "integrations.shipping.usps": "manage_options",
  "integrations.shipping.fedex": "manage_options",
  "integrations.shipping.dhl": "manage_options",
  "integrations.clerk": "manage_options",
  "integrations.google": "manage_options",
  "analytics.ga4": "manage_options",
};

// ─── updateSection ───────────────────────────────────────────────────────────

/**
 * Update a settings section. This is the main mutation for all 6 sections.
 *
 * Flow:
 *   1. Validate auth (Administrator with section-specific capability)
 *   2. Validate the section name
 *   3. Merge incoming values with defaults to get the complete new values
 *   4. Get current stored values (or defaults if none exist)
 *   5. Compute changes diff
 *   6. Skip if no changes
 *   7. Upsert: patch existing document or insert new
 *   8. Emit settings.updated event with the changes array
 *
 * @param section - One of the 6 settings section names
 * @param values - The complete new values for this section
 */
export const updateSection = mutation({
  args: updateSectionArgs,
  handler: async (ctx, args) => {
    const { section, values } = args;

    // 1. Validate section name
    if (!isValidSection(section)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid settings section: "${section}"`,
      });
    }

    // 2. Check authorization - section-specific capability
    const capability = SECTION_CAPABILITY_MAP[section];
    const user = await requireCan(ctx, capability);

    // 3. Validate section-specific values
    const validationErrors = validateSectionValues(section, values as Record<string, unknown>);
    if (validationErrors.length > 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Validation failed for ${section} settings`,
        errors: validationErrors.map((error) => ({
          field: error.field,
          message: error.message,
        })),
      });
    }

    // 4. Get defaults for this section
    const defaults = getDefaults(section);

    // 5. Merge incoming values with defaults (incoming takes precedence)
    const newValues: Record<string, unknown> = {
      ...defaults,
      ...(values as Record<string, unknown>),
    };

    // 6. Get current stored values (or defaults if nothing stored yet)
    const existingDoc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", section))
      .unique();

    const oldValues: Record<string, unknown> = existingDoc
      ? { ...defaults, ...(existingDoc.values as Record<string, unknown>) }
      : { ...defaults };

    // Secret-field handling:
    //   - If UI sent SECRET_SENTINEL for a secret field, user didn't change
    //     it — keep the existing stored (encrypted) value.
    //   - If UI sent a new plaintext value, encrypt it before writing.
    //   - Empty string means clear (user explicitly removed the key).
    for (const [k, v] of Object.entries(newValues)) {
      if (!isSecretFieldName(k)) continue;
      if (v === SECRET_SENTINEL) {
        // Keep whatever was already stored.
        newValues[k] = (existingDoc?.values as any)?.[k] ?? "";
      } else if (typeof v === "string" && v.length > 0) {
        newValues[k] = await encryptSettingSecret(v);
      }
    }

    // 7. Compute diff — use redacted view so the event payload never
    // carries plaintext secrets.
    const changes = computeChanges(
      redactSettingSecrets(oldValues) as any,
      redactSettingSecrets(newValues) as any,
    );

    // 8. Skip if no changes detected
    if (changes.length === 0) {
      return;
    }

    // 9. Upsert the settings document
    const now = Date.now();
    if (existingDoc) {
      await ctx.db.patch("settings", existingDoc._id, {
        values: newValues,
        updatedAt: now,
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("settings", {
        section,
        values: newValues,
        updatedAt: now,
        updatedBy: user._id,
      });
    }

    // 10. Side-effect hooks by section.
    // Any time integrations.shipping is saved, ensure the 5 shipping email
    // templates exist. Idempotent — runs a presence check per slug before
    // inserting, so repeated saves are free.
    if (section === "integrations.shipping") {
      await runBootstrapShippingTemplates(ctx, now);
    }
    if (section === "email") {
      await ctx.scheduler.runAfter(0, internal.emails.internals.bootstrapTemplates, {});
      await ctx.scheduler.runAfter(0, internal.bootstrap.registerListeners.run, {});
      await ctx.scheduler.runAfter(
        0,
        internal.shipping.bootstrap.bootstrapShippingTemplates,
        {},
      );
      if (await isPluginEnabled(ctx, "commerceReturns")) {
        await ctx.scheduler.runAfter(
          0,
          internal.commerceReturns.migrations.backfillLegacyReturns,
          {},
        );
      }
    }

    // 11. Emit event
    // Permalinks section emits settings.permalinks_changed (distinct event)
    // so the Routing System, Sitemap System, etc. can listen specifically.
    // All other sections emit settings.updated.
    if (section === "permalinks") {
      await emitEvent(ctx, SETTINGS_EVENTS.PERMALINKS_CHANGED, SYSTEM.SETTINGS, {
        oldStructure: oldValues.structure,
        newStructure: newValues.structure,
        oldCustomStructure: oldValues.customStructure,
        newCustomStructure: newValues.customStructure,
        oldCategoryBase: oldValues.categoryBase,
        newCategoryBase: newValues.categoryBase,
        oldTagBase: oldValues.tagBase,
        newTagBase: newValues.tagBase,
        updatedBy: user._id,
        timestamp: now,
      });
    } else {
      await emitEvent(ctx, SETTINGS_EVENTS.UPDATED, SYSTEM.SETTINGS, {
        section,
        changes,
        updatedBy: user._id,
        timestamp: now,
      });
    }
  },
});

// ─── importAll ───────────────────────────────────────────────────────────────

/**
 * Import settings from a JSON export object.
 *
 * The data parameter should contain a `settings` key with section names
 * as keys and value objects as values. Sections that are not valid or
 * not present are skipped.
 *
 * Flow:
 *   1. Validate auth (Administrator with settings.import capability)
 *   2. Extract the settings object from the data
 *   3. For each valid section in the data, upsert the settings document
 *   4. Emit events for each changed section
 *   5. Return a summary of imported and skipped sections
 *
 * @param data - Import data object, expected shape:
 *   { settings?: Record<string, any>, version?: string, ... }
 */
export const importAll = mutation({
  args: importAllArgs,
  handler: async (ctx, args) => {
    // 1. Check auth
    const user = await requireCan(ctx, "settings.import");

    // 2. Extract settings from data
    const data = args.data as Record<string, unknown>;
    const settingsData = (data.settings ?? data) as Record<string, unknown>;

    const imported: string[] = [];
    const skipped: string[] = [];
    const now = Date.now();

    // 3. Process each section
    for (const sectionName of SECTION_NAMES) {
      const sectionValues = settingsData[sectionName];

      // Skip sections not present in the import data
      if (
        sectionValues === undefined ||
        sectionValues === null ||
        typeof sectionValues !== "object"
      ) {
        skipped.push(sectionName);
        continue;
      }

      // Get defaults and merge
      const defaults = getDefaults(sectionName);
      const newValues: Record<string, unknown> = {
        ...defaults,
        ...(sectionValues as Record<string, unknown>),
      };

      // Get current stored values
      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", sectionName))
        .unique();

      const oldValues: Record<string, unknown> = existingDoc
        ? { ...defaults, ...(existingDoc.values as Record<string, unknown>) }
        : { ...defaults };

      // Compute changes
      const changes = computeChanges(oldValues, newValues);

      // Skip if no actual changes
      if (changes.length === 0) {
        skipped.push(sectionName);
        continue;
      }

      // Upsert
      if (existingDoc) {
        await ctx.db.patch("settings", existingDoc._id, {
          values: newValues,
          updatedAt: now,
          updatedBy: user._id,
        });
      } else {
        await ctx.db.insert("settings", {
          section: sectionName,
          values: newValues,
          updatedAt: now,
          updatedBy: user._id,
        });
      }

      // Emit event for this section
      // Permalinks section emits its own distinct event
      if (sectionName === "permalinks") {
        await emitEvent(ctx, SETTINGS_EVENTS.PERMALINKS_CHANGED, SYSTEM.SETTINGS, {
          oldStructure: oldValues.structure,
          newStructure: newValues.structure,
          oldCategoryBase: oldValues.categoryBase,
          newCategoryBase: newValues.categoryBase,
          oldTagBase: oldValues.tagBase,
          newTagBase: newValues.tagBase,
          updatedBy: user._id,
          timestamp: now,
          source: "import",
        });
      } else {
        await emitEvent(ctx, SETTINGS_EVENTS.UPDATED, SYSTEM.SETTINGS, {
          section: sectionName,
          changes,
          updatedBy: user._id,
          timestamp: now,
          source: "import",
        });
      }

      imported.push(sectionName);
    }

    return { imported, skipped };
  },
});
