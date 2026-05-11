/**
 * Plugin enablement helpers.
 *
 * Every extension backend function should first call `requirePluginEnabled`
 * (for mutations/actions) or check `isPluginEnabled` (for read queries that
 * should degrade gracefully).
 *
 * Enablement resolution:
 *   1. Read the `plugins` settings section.
 *   2. Look up the pluginId's settings key (e.g. `commerceEnabled`).
 *   3. If absent, fall back to PLUGIN_DEFAULTS.
 *   4. If the pluginId has a parent (e.g. commerceBundles → commerce),
 *      the parent must also be enabled.
 */

import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import {
  PLUGIN_DEFAULTS,
  PLUGIN_PARENT,
  PLUGIN_SETTINGS_KEY,
  type PluginId,
} from "../plugins/registry";

type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

/** Return the merged plugins settings object (defaults + stored). */
async function readPluginsSettings(
  ctx: AnyCtx,
): Promise<Record<string, boolean>> {
  const ctxAny = ctx as any;
  // Actions don't have ctx.db. Use the public settings query so cron/action
  // contexts are not blocked by admin-only getBySection auth checks.
  if (typeof ctxAny.runQuery === "function" && !ctxAny.db) {
    const result = await ctxAny.runQuery(api.settings.queries.getPublic, {});
    return (result?.plugins ?? {}) as Record<string, boolean>;
  }
  // Query/mutation context: direct DB read.
  if (ctxAny.db) {
    const row = await ctxAny.db
      .query("settings")
      .withIndex("by_section", (q: any) => q.eq("section", "plugins"))
      .unique();
    return (row?.values ?? {}) as Record<string, boolean>;
  }
  return {};
}

/** True iff the plugin (and its parent, if any) is enabled. */
export async function isPluginEnabled(
  ctx: AnyCtx,
  pluginId: PluginId,
): Promise<boolean> {
  const stored = await readPluginsSettings(ctx);
  return isEnabledFromValues(pluginId, stored);
}

function isEnabledFromValues(
  pluginId: PluginId,
  stored: Record<string, boolean>,
): boolean {
  const key = PLUGIN_SETTINGS_KEY[pluginId];
  const self =
    typeof stored[key] === "boolean" ? stored[key] : PLUGIN_DEFAULTS[pluginId];
  if (!self) return false;
  const parent = PLUGIN_PARENT[pluginId];
  if (parent) {
    return isEnabledFromValues(parent, stored);
  }
  return true;
}

/** Throw PLUGIN_DISABLED if not enabled. Use at the top of every mutation/action. */
export async function requirePluginEnabled(
  ctx: AnyCtx,
  pluginId: PluginId,
): Promise<void> {
  const ok = await isPluginEnabled(ctx, pluginId);
  if (!ok) {
    throw new ConvexError({
      code: "PLUGIN_DISABLED",
      pluginId,
      message: `The ${pluginId} extension is disabled.`,
    });
  }
}
