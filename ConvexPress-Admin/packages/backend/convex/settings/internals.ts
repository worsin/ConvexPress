/**
 * Settings System - Internal Functions
 *
 * Internal query for server-side settings access by other systems.
 * Not client-callable -- only invocable from other Convex functions.
 *
 * Usage (from another system's internals):
 *   import { internal } from "../_generated/api";
 *
 *   // Inside an internalMutation/internalQuery handler:
 *   const settings = await ctx.runQuery(internal.settings.internals.getInternal, {
 *     section: "permalinks",
 *   });
 *
 * Systems that consume this:
 *   - Routing System: reads permalink structure
 *   - Comment System: reads discussion/moderation settings
 *   - Post System: reads default category and post format
 *   - Registration System: reads membership and default role
 *   - RSS/Feed System: reads feed settings
 *   - SEO System: reads search engine visibility, site title
 *   - Sitemap System: reads permalink structure
 */

import { ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { decryptSettingSecret, encryptSettingSecret } from "../helpers/settingsSecret";
import { collectLegacySecrets, withReplacedValues } from "../helpers/settingsSecretUpgrade";
import { getInternalArgs } from "./validators";
import { getDefaults, isValidSection, type SettingsSection } from "./defaults";
import { requireCan } from "../helpers/permissions";

// ─── getInternal ─────────────────────────────────────────────────────────────

/**
 * Internal query for reading merged settings (defaults + stored).
 * Same behavior as getBySection but not client-callable.
 *
 * Takes a string section name (not a union validator) for flexibility
 * when called from internal functions that may build the section name
 * dynamically.
 *
 * @param section - Section name as a string
 * @returns Merged settings values, or null if the section is invalid
 */
export const getInternal = internalQuery({
  args: getInternalArgs,
  handler: async (ctx, args) => {
    const { section } = args;

    // Validate section name
    if (!isValidSection(section)) {
      return null;
    }

    const sectionName = section as SettingsSection;

    // Get defaults
    const defaults = getDefaults(sectionName);

    // Get stored document
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", sectionName))
      .unique();

    // Merge defaults with stored values
    const values = doc
      ? { ...defaults, ...(doc.values as Record<string, unknown>) }
      : { ...defaults };

    return {
      ...values,
      _id: doc?._id ?? null,
      updatedAt: doc?.updatedAt ?? null,
      updatedBy: doc?.updatedBy ?? null,
    };
  },
});

export const requireManageOptionsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    return true;
  },
});

// ─── Legacy secret upgrade ───────────────────────────────────────────────────

/**
 * Re-seal every reversible `b64:` secret as `enc:` now that the deployment has
 * an at-rest encryption key. Idempotent; safe to run repeatedly.
 */
export async function upgradeLegacySettingSecrets(ctx: {
  db: any;
}): Promise<{ upgraded: number; sections: string[] }> {
  if (!process.env.SHIPPING_PROVIDER_ENCRYPTION_KEY) {
    throw new ConvexError({
      code: "CONFIG_ERROR",
      message: "SHIPPING_PROVIDER_ENCRYPTION_KEY is not set on this deployment; nothing can be encrypted yet.",
    });
  }
  const docs = await ctx.db.query("settings").collect();
  let upgraded = 0;
  const sections: string[] = [];
  for (const doc of docs) {
    const legacy = collectLegacySecrets(doc.values);
    if (legacy.length === 0) continue;
    const replacements = [];
    for (const entry of legacy) {
      const plaintext = await decryptSettingSecret(entry.value);
      replacements.push({ path: entry.path, value: await encryptSettingSecret(plaintext) });
    }
    await ctx.db.patch(doc._id, {
      values: withReplacedValues(doc.values, replacements),
      updatedAt: Date.now(),
    });
    upgraded += replacements.length;
    sections.push(doc.section);
  }
  return { upgraded, sections };
}

/** Operator-run (admin key) variant for fleets: `convex run settings/internals:encryptStoredSecrets`. */
export const encryptStoredSecrets = internalMutation({
  args: {},
  handler: async (ctx) => upgradeLegacySettingSecrets(ctx),
});
