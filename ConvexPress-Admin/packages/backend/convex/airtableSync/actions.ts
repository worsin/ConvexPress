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
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";

// ─── Auth helper ────────────────────────────────────────────────────────────

async function requireAdmin(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required for Airtable sync",
    });
  }

  await ctx.runQuery(
    internal.airtableSync._internal.checkAdminPermission,
    { userId: identity.subject },
  );

  return identity;
}

// ─── syncRoles ──────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncRoles = action({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireAdmin(ctx);
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return await ctx.runAction(
      internal.airtableSync.syncRoles.syncRoles,
      {},
    );
  },
});

// ─── syncCapabilities ───────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncCapabilities = action({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireAdmin(ctx);
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return await ctx.runAction(
      internal.airtableSync.syncCapabilities.syncCapabilities,
      {},
    );
  },
});

// ─── syncEvents ─────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncEvents = action({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireAdmin(ctx);
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return await ctx.runAction(
      internal.airtableSync.syncEvents.syncEvents,
      {},
    );
  },
});

// ─── syncRoutes ─────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncRoutes = action({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireAdmin(ctx);
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return await ctx.runAction(
      internal.airtableSync.syncRoutes.syncRoutes,
      {},
    );
  },
});

// ─── syncEmailNotifications ─────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncEmailNotifications = action({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireAdmin(ctx);
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return await ctx.runAction(
      internal.airtableSync.syncEmailNotifications.syncEmailNotifications,
      {},
    );
  },
});

// ─── syncSiteNotifications ──────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncSiteNotifications = action({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireAdmin(ctx);
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return await ctx.runAction(
      internal.airtableSync.syncSiteNotifications.syncSiteNotifications,
      {},
    );
  },
});
