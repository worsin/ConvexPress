import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { ConvexError } from "convex/values";

import authConfig from "./auth.config";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { resolveAuthRuntimeConfig } from "./authOrigins";
import { decideAuthUserClaim } from "./authPolicy";
import {
  authorizeFirstOwnerCreation,
  recordFirstOwnerCreated,
} from "./serverBootstrap";

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, authUser) => {
        const now = Date.now();
        const email = authUser.email?.toLowerCase().trim() || undefined;
        const name = authUser.name?.trim() || undefined;
        const anyUser = await ctx.db.query("overseer_users").take(1);

        if (anyUser.length === 0) {
          if (!email) {
            throw new ConvexError(
              "The reserved installation owner must have an email",
            );
          }
          const reservation = await authorizeFirstOwnerCreation(ctx, {
            ownerEmail: email,
          });
          decideAuthUserClaim({
            now,
            normalizedEmail: email,
            anyUserExists: false,
            reservation,
          });

          const userId = await ctx.db.insert("overseer_users", {
            authUserId: authUser._id,
            email,
            name,
            role: "owner",
            isActive: true,
            createdAt: now,
            lastLoginAt: now,
          });
          await authComponent.setUserId(ctx, authUser._id, userId);
          await ensureUserProfile(ctx, { _id: userId, email, name });
          await grantOwnerRoleAssignment(ctx, userId, now);
          await recordFirstOwnerCreated(ctx, {
            reservationId: reservation.reservationId,
            ownerUserId: userId,
          });
          return;
        }

        const matches = email
          ? await ctx.db
              .query("overseer_users")
              .withIndex("email", (q) => q.eq("email", email))
              .take(2)
          : [];
        if (matches.length > 1) {
          throw new ConvexError(
            "Multiple ConvexPress operator rows use this email; an owner must repair the account",
          );
        }
        const provisioned = matches[0];
        decideAuthUserClaim({
          now,
          normalizedEmail: email ?? "",
          anyUserExists: true,
          provisionedUser: provisioned,
        });

        await ctx.db.patch(provisioned!._id, {
          authUserId: authUser._id,
          name: provisioned!.name ?? name,
          lastLoginAt: now,
        });
        await authComponent.setUserId(ctx, authUser._id, provisioned!._id);
        await ensureUserProfile(ctx, {
          ...provisioned!,
          name: provisioned!.name ?? name,
        });
      },
      onUpdate: async (ctx, authUser, previousAuthUser) => {
        if (
          authUser.email === previousAuthUser.email &&
          authUser.name === previousAuthUser.name &&
          authUser.image === previousAuthUser.image
        ) {
          return;
        }
        const user = await findOperatorByAuthId(ctx, authUser._id);
        if (!user) return;
        await ctx.db.patch(user._id, {
          email: authUser.email?.toLowerCase().trim() || undefined,
          name: user.name ?? authUser.name?.trim() ?? undefined,
          image: authUser.image ?? user.image,
          updatedAt: Date.now(),
        });
      },
      onDelete: async (ctx, authUser) => {
        const user = await findOperatorByAuthId(ctx, authUser._id);
        if (!user) return;
        await ctx.db.patch(user._id, {
          authUserId: undefined,
          updatedAt: Date.now(),
        });
      },
    },
  },
});

async function findOperatorByAuthId(ctx: { db: any }, authUserId: string) {
  const matches = await ctx.db
    .query("overseer_users")
    .withIndex("by_auth_user", (q: any) => q.eq("authUserId", authUserId))
    .take(2);
  if (matches.length > 1) {
    throw new ConvexError("Duplicate ConvexPress authentication links detected");
  }
  return matches[0] ?? null;
}

async function grantOwnerRoleAssignment(
  ctx: { db: any },
  userId: Id<"overseer_users">,
  now: number,
) {
  try {
    const findRole = async (slug: string) => {
      const matches = await ctx.db
        .query("overseer_roles")
        .withIndex("by_slug", (q: any) => q.eq("slug", slug))
        .take(2);
      return matches.length === 1 ? matches[0] : null;
    };
    const ownerRole = (await findRole("owner")) ?? (await findRole("administrator"));
    if (!ownerRole) return;

    const existing = await ctx.db
      .query("overseer_roleAssignments")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .take(1);
    if (existing.length > 0) return;

    await ctx.db.insert("overseer_roleAssignments", {
      roleId: ownerRole._id,
      userId,
      subjectType: "user",
      subjectId: String(userId),
      assignedAt: now,
      status: "active",
      owner_id: String(userId),
    });
  } catch {
    // Role catalogs are seeded independently; reconciliation fills this later.
  }
}

async function ensureUserProfile(
  ctx: { db: any },
  user: {
    _id: Id<"overseer_users">;
    email?: string;
    name?: string;
    username?: string;
    bio?: string;
  },
) {
  const existing = await ctx.db
    .query("overseer_userProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .take(1);
  if (existing.length > 0) return;

  const now = Date.now();
  await ctx.db.insert("overseer_userProfiles", {
    userId: user._id,
    displayName: user.username ?? user.name ?? user.email,
    bio: user.bio,
    timezone: "America/Denver",
    language: "en",
    notificationPreferences: {
      email: true,
      desktop: true,
      approvalAlerts: true,
      budgetAlerts: true,
      errorAlerts: true,
    },
    uiPreferences: {
      theme: "dark",
      sidebarCollapsed: false,
      compactMode: false,
    },
    createdAt: now,
    updatedAt: now,
  });
}

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const runtime = resolveAuthRuntimeConfig({
    siteUrl: process.env.CONVEX_SITE_URL ?? "",
    configuredMode: process.env.CONVEXPRESS_AUTH_MODE,
    additionalOrigins: process.env.CONVEXPRESS_AUTH_TRUSTED_ORIGINS,
  });

  return betterAuth({
    baseURL: runtime.siteUrl,
    trustedOrigins: runtime.trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    plugins: [
      twoFactor(),
      crossDomain({ siteUrl: runtime.siteUrl }),
      convex({ authConfig, jwtExpirationSeconds: 60 * 60 }),
    ],
  });
};
