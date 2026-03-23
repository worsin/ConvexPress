/**
 * Settings System - Shared Helpers
 *
 * Extracted helper functions used across mutations, queries, and internals.
 * Provides:
 *   - computeChanges: diff old vs new values for event payloads
 *   - validateSection: validate section-specific values (placeholder for future use)
 *   - getSettingsDoc: fetch a settings document by section with index lookup
 *   - mergeWithDefaults: merge stored values with defaults
 *
 * Usage:
 *   import { computeChanges, mergeWithDefaults } from "./helpers";
 */

import type { QueryCtx, MutationCtx } from "../_generated/server";
import { getDefaults, isValidSection, type SettingsSection } from "./defaults";

// ─── Change Detection ────────────────────────────────────────────────────────

/**
 * Compute an array of changes between old and new values.
 * Only includes fields that actually changed.
 *
 * Uses JSON.stringify for deep comparison of simple values
 * (strings, numbers, booleans, null, arrays, plain objects).
 *
 * @param oldValues - Previous settings values
 * @param newValues - New settings values
 * @returns Array of change objects with field, oldValue, newValue
 */
export function computeChanges(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  const changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }> = [];

  const allKeys = new Set([
    ...Object.keys(oldValues),
    ...Object.keys(newValues),
  ]);

  for (const key of allKeys) {
    const oldVal = oldValues[key];
    const newVal = newValues[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        field: key,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return changes;
}

// ─── Document Retrieval ──────────────────────────────────────────────────────
// NOTE: The following helpers (getSettingsDoc, mergeWithDefaults, requireValidSection)
// are designed for cross-system use. Other systems (e.g., Routing, Comment, Post)
// can import these to read settings server-side without duplicating lookup logic.

/**
 * Fetch a settings document by section name using the by_section index.
 * Returns the raw document or null if no settings have been saved for this section.
 *
 * Intended for cross-system use: other Convex functions that need to read
 * settings can import this helper instead of duplicating the query pattern.
 *
 * @param ctx - Convex query or mutation context
 * @param section - The settings section name
 * @returns The settings document or null
 */
export async function getSettingsDoc(
  ctx: QueryCtx | MutationCtx,
  section: string,
) {
  if (!isValidSection(section)) return null;

  return await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", section as SettingsSection))
    .unique();
}

// ─── Merge Helpers ───────────────────────────────────────────────────────────

/**
 * Merge stored values with code-defined defaults for a section.
 * Defaults are applied first, then stored values override them.
 *
 * Intended for cross-system use: other systems reading settings server-side
 * should use this to ensure defaults are always included.
 *
 * @param section - The settings section name
 * @param storedValues - Values from the database (may be partial)
 * @returns Complete merged values object
 */
export function mergeWithDefaults(
  section: SettingsSection,
  storedValues?: Record<string, unknown> | null,
): Record<string, unknown> {
  const defaults = getDefaults(section);

  if (!storedValues) {
    return defaults;
  }

  return { ...defaults, ...storedValues };
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate that a section name is one of the 6 valid section names.
 * Throws if invalid.
 *
 * Intended for cross-system use: other systems that accept dynamic section
 * names can use this to guard against invalid input.
 *
 * @param section - String to validate
 * @returns The validated section name
 * @throws Error if the section name is invalid
 */
export function requireValidSection(section: string): SettingsSection {
  if (!isValidSection(section)) {
    throw new Error(`Invalid settings section: "${section}"`);
  }
  return section;
}
