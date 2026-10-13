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

import type { RequestReadLedger } from "./requestReadLedger";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import {
  PLUGIN_SETTINGS_KEY,
  isPluginEnabledFromValues,
  type PluginId,
} from "../plugins/registry";

/** Queries and mutations read settings directly; actions go through a query. */
type AnyCtx = Pick<QueryCtx, "db"> | Pick<ActionCtx, "runQuery">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return the stored plugins settings values (defaults are applied by the registry). */
async function readPluginsSettings(
  ctx: AnyCtx,
  budget?: RequestReadLedger,
): Promise<Record<string, unknown>> {
  // Query/mutation context: direct DB read.
  if ("db" in ctx) {
    budget?.beforeRead();
    const row = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "plugins"))
      .unique();
    budget?.record(row);
    const values: unknown = row?.values;
    return isRecord(values) ? values : {};
  }
  // Actions don't have ctx.db. Use the public settings query so cron/action
  // contexts are not blocked by admin-only getBySection auth checks.
  if (budget) throw new ConvexError({code:"CANONICAL_READ_BUDGET",message:"Canonical reads require a database query context."});
  const result = await ctx.runQuery(api.settings.queries.getPublic, {});
  return result?.plugins ?? {};
}

/** True iff the plugin (and its parent, if any) is enabled. */
export async function isPluginEnabled(
  ctx: AnyCtx,
  pluginId: PluginId,
  budget?: RequestReadLedger,
): Promise<boolean> {
  const stored = await readPluginsSettings(ctx, budget);
  return isPluginEnabledFromValues(pluginId, stored);
}

/** Canonical policy projection from the same authoritative stored/default rules. */
export async function enabledPluginIds(ctx: QueryCtx | MutationCtx, budget?: RequestReadLedger): Promise<PluginId[]> {
  const stored = await readPluginsSettings(ctx, budget);
  return (Object.keys(PLUGIN_SETTINGS_KEY) as PluginId[]).filter(id => isPluginEnabledFromValues(id, stored));
}

/** Throw PLUGIN_DISABLED if not enabled. Use at the top of every mutation/action. */
export async function requirePluginEnabled(
  ctx: AnyCtx,
  pluginId: PluginId,
  budget?: RequestReadLedger,
): Promise<void> {
  const ok = await isPluginEnabled(ctx, pluginId, budget);
  if (!ok) {
    throw new ConvexError({
      code: "PLUGIN_DISABLED",
      pluginId,
      message: `The ${pluginId} extension is disabled.`,
    });
  }
}
