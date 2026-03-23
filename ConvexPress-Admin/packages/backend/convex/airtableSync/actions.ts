/**
 * Airtable Sync - Public Authenticated Actions
 *
 * These are the client-callable action wrappers that authenticate the user
 * (requiring Administrator / manage_options capability) before delegating
 * to the internal sync implementations.
 *
 * The actual sync logic lives in the individual sync*.ts files as
 * internalAction functions. This separation ensures:
 *   1. Unauthenticated clients cannot trigger syncs
 *   2. Internal cross-calls (e.g., syncRoles calling syncCapabilities)
 *      bypass redundant auth checks
 *   3. The API surface is clean and auditable
 *
 * Usage (frontend):
 *   <AirtableSyncButton syncAction={api.airtableSync.actions.syncRoles} />
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";

// ─── Auth helper ────────────────────────────────────────────────────────────

async function requireAdmin(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier?: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required for Airtable sync",
    });
  }

  await ctx.runQuery(
    internal.airtableSync._internal.checkAdminPermission,
    { workosUserId: identity.subject },
  );

  return identity;
}

// ─── syncRoles ──────────────────────────────────────────────────────────────

export const syncRoles = action({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.runAction(
      internal.airtableSync.syncRoles.syncRoles,
      {},
    );
  },
});

// ─── syncCapabilities ───────────────────────────────────────────────────────

export const syncCapabilities = action({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.runAction(
      internal.airtableSync.syncCapabilities.syncCapabilities,
      {},
    );
  },
});

// ─── syncEvents ─────────────────────────────────────────────────────────────

export const syncEvents = action({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.runAction(
      internal.airtableSync.syncEvents.syncEvents,
      {},
    );
  },
});

// ─── syncRoutes ─────────────────────────────────────────────────────────────

export const syncRoutes = action({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.runAction(
      internal.airtableSync.syncRoutes.syncRoutes,
      {},
    );
  },
});

// ─── syncEmailNotifications ─────────────────────────────────────────────────

export const syncEmailNotifications = action({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.runAction(
      internal.airtableSync.syncEmailNotifications.syncEmailNotifications,
      {},
    );
  },
});

// ─── syncSiteNotifications ──────────────────────────────────────────────────

export const syncSiteNotifications = action({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.runAction(
      internal.airtableSync.syncSiteNotifications.syncSiteNotifications,
      {},
    );
  },
});
