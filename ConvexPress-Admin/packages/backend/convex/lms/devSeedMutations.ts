/**
 * TEMP — LMS verification helper. Upserts/removes a labeled test admin so the
 * LMS routes can be browser-verified. DELETE THIS FILE after verification.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// @ts-ignore: Convex generated API types exceed TS instantiation depth.
export const upsertTestAdmin = internalMutation({
  args: { email: v.string(), username: v.string(), passwordHash: v.string() },
  // @ts-ignore: Convex generated API types exceed TS instantiation depth.
  handler: async (
    ctx,
    { email, username, passwordHash },
  ): Promise<{ action: string; userId: string }> => {
    const db = ctx.db as any;
    const adminRole = await db
      .query("roles")
      .withIndex("by_slug", (q: any) => q.eq("slug", "administrator"))
      .unique();
    const existing = await db
      .query("users")
      .filter((q: any) => q.eq(q.field("email"), email))
      .first();
    const now = Date.now();
    if (existing) {
      await db.patch(existing._id, {
        passwordHash,
        authSource: "local",
        status: "active",
        isInternal: true,
        internalRole: "admin",
        emailVerified: true,
        ...(adminRole ? { roleId: adminRole._id } : {}),
        updatedAt: now,
      });
      return { action: "updated", userId: String(existing._id) };
    }
    const userId = await db.insert("users", {
      authSource: "local",
      email,
      emailVerified: true,
      username,
      displayName: "LMS Verify Admin",
      slug: username,
      isInternal: true,
      internalRole: "admin",
      ...(adminRole ? { roleId: adminRole._id } : {}),
      status: "active",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    return { action: "created", userId: String(userId) };
  },
});

// @ts-ignore: Convex generated API types exceed TS instantiation depth.
export const removeTestAdmin = internalMutation({
  args: { email: v.string() },
  // @ts-ignore: Convex generated API types exceed TS instantiation depth.
  handler: async (ctx, { email }): Promise<{ deleted: boolean }> => {
    const db = ctx.db as any;
    const u = await db
      .query("users")
      .filter((q: any) => q.eq(q.field("email"), email))
      .first();
    if (u) {
      await db.delete(u._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});
