// @ts-nocheck
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getServiceKeyFromAction } from "../helpers/serviceKeys";
import {
  buildClerkCreateUserPayload,
  clerkErrorMessage,
  extractClerkUserId,
  findClerkUserByEmail,
  normalizeClerkEmail,
  type ClerkProvisioningResult,
} from "./clerkManagementHelpers";

const clerkSourceValidator = v.union(
  v.literal("wordpress_import"),
  v.literal("wordpress_credential_backfill"),
  v.literal("woocommerce_import"),
  v.literal("woocommerce_review_import"),
  v.literal("admin_manual"),
  v.literal("first_admin"),
  v.literal("smoke_admin"),
  v.literal("bootstrap_admin"),
  v.literal("clerk_webhook"),
  v.literal("clerk_session"),
  v.literal("unknown"),
);

const clerkProvisioningStatusValidator = v.union(
  v.literal("pending"),
  v.literal("provisioned"),
  v.literal("linked_existing"),
  v.literal("reset_required"),
  v.literal("skipped"),
  v.literal("failed"),
);

const clerkPasswordHasherValidator = v.union(v.literal("phpass"), v.literal("bcrypt"));

export const getUserForClerkProvisioning = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const markClerkProvisioning = internalMutation({
  args: {
    userId: v.id("users"),
    source: clerkSourceValidator,
    status: clerkProvisioningStatusValidator,
    reason: v.optional(v.string()),
    error: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    setAuthSourceToClerk: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: Record<string, unknown> = {
      clerkProvisioningStatus: args.status,
      clerkProvisioningSource: args.source,
      clerkProvisioningReason: args.reason,
      clerkProvisioningError: args.error,
      clerkProvisioningAttemptedAt: now,
      updatedAt: now,
    };

    if (args.status === "provisioned" || args.status === "linked_existing") {
      patch.clerkProvisionedAt = now;
    }

    if (args.clerkUserId) {
      patch.clerkUserId = args.clerkUserId;
      patch.emailVerified = true;
      if (args.setAuthSourceToClerk) {
        patch.authSource = "clerk";
      }
    }

    await ctx.db.patch(args.userId, patch);
  },
});

async function recordProvisioningResult(
  ctx: { runMutation: (ref: any, args: any) => Promise<any> },
  args: {
    userId: Id<"users">;
    source: string;
    setAuthSourceToClerk?: boolean;
  },
  result: ClerkProvisioningResult,
) {
  await ctx.runMutation(internal.auth.clerkManagement.markClerkProvisioning, {
    userId: args.userId,
    source: args.source,
    status: result.status,
    reason: result.reason,
    error: result.error,
    clerkUserId: result.clerkUserId,
    setAuthSourceToClerk: args.setAuthSourceToClerk,
  });
}

export const ensureUserInClerk = internalAction({
  args: {
    userId: v.id("users"),
    source: clerkSourceValidator,
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    password: v.optional(v.string()),
    passwordDigest: v.optional(v.string()),
    passwordHasher: v.optional(clerkPasswordHasherValidator),
    externalId: v.optional(v.string()),
    setAuthSourceToClerk: v.optional(v.boolean()),
    skipPasswordRequirement: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ClerkProvisioningResult> => {
    const user = await ctx.runQuery(internal.auth.clerkManagement.getUserForClerkProvisioning, {
      userId: args.userId,
    });
    if (!user) {
      return { status: "failed", reason: "user_not_found" };
    }

    const setAuthSourceToClerk = args.setAuthSourceToClerk ?? !user.passwordHash;
    const email = normalizeClerkEmail(args.email || user.email);
    if (!email || email.endsWith("@imported.local")) {
      const result: ClerkProvisioningResult = { status: "skipped", reason: "missing_email" };
      await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
      return result;
    }

    if (user.clerkUserId) {
      const result: ClerkProvisioningResult = {
        status: "linked_existing",
        reason: "already_linked",
        clerkUserId: user.clerkUserId,
        passwordHasher: args.passwordHasher,
      };
      await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
      return result;
    }

    const clerkSecretKey = await getServiceKeyFromAction(
      ctx,
      "integrations.clerk",
      "clerkSecretKey",
      "CLERK_SECRET_KEY",
    );

    if (!clerkSecretKey) {
      const result: ClerkProvisioningResult = {
        status: "failed",
        reason: "clerk_secret_key_missing",
        passwordHasher: args.passwordHasher,
      };
      await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
      return result;
    }

    let existingClerkUserId: string | undefined;
    try {
      existingClerkUserId = await findClerkUserByEmail(clerkSecretKey, email);
    } catch (error) {
      const result: ClerkProvisioningResult = {
        status: "failed",
        reason: "clerk_find_user_failed",
        passwordHasher: args.passwordHasher,
        error: error instanceof Error ? error.message : String(error),
      };
      await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
      return result;
    }

    if (existingClerkUserId) {
      const result: ClerkProvisioningResult = {
        status: "linked_existing",
        reason: "email_already_existed_in_clerk",
        clerkUserId: existingClerkUserId,
        passwordHasher: args.passwordHasher,
      };
      await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
      return result;
    }

    const body = buildClerkCreateUserPayload({
      email,
      source: args.source,
      userId: args.userId,
      externalId: args.externalId,
      firstName: args.firstName || user.firstName,
      lastName: args.lastName || user.lastName,
      username: args.username || user.username,
      displayName: args.displayName || user.displayName,
      password: args.password,
      passwordDigest: args.passwordDigest?.trim(),
      passwordHasher: args.passwordHasher,
      skipPasswordRequirement: args.skipPasswordRequirement,
    });

    let response: Response;
    let payloadText: string;
    try {
      response = await fetch("https://api.clerk.com/v1/users", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clerkSecretKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      payloadText = await response.text();
    } catch (error) {
      const result: ClerkProvisioningResult = {
        status: "failed",
        reason: "clerk_create_user_request_failed",
        passwordHasher: args.passwordHasher,
        error: error instanceof Error ? error.message : String(error),
      };
      await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
      return result;
    }
    if (!response.ok) {
      let conflictUserId: string | undefined;
      try {
        conflictUserId = await findClerkUserByEmail(clerkSecretKey, email);
      } catch {
        conflictUserId = undefined;
      }

      if (conflictUserId) {
        const result: ClerkProvisioningResult = {
          status: "linked_existing",
          reason: "email_already_existed_in_clerk_after_conflict",
          clerkUserId: conflictUserId,
          passwordHasher: args.passwordHasher,
        };
        await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
        return result;
      }

      const result: ClerkProvisioningResult = {
        status: "failed",
        reason: "clerk_create_user_failed",
        passwordHasher: args.passwordHasher,
        error: clerkErrorMessage(payloadText),
      };
      await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
      return result;
    }

    let clerkUserId: string | undefined;
    try {
      clerkUserId = extractClerkUserId(JSON.parse(payloadText));
    } catch {
      clerkUserId = undefined;
    }
    if (!clerkUserId) {
      const result: ClerkProvisioningResult = {
        status: "failed",
        reason: "clerk_response_missing_user_id",
        passwordHasher: args.passwordHasher,
      };
      await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
      return result;
    }

    const result: ClerkProvisioningResult = {
      status: "provisioned",
      reason: args.passwordDigest
        ? "password_digest_imported"
        : args.password
          ? "password_set"
          : "password_requirement_skipped",
      clerkUserId,
      passwordHasher: args.passwordHasher,
    };
    await recordProvisioningResult(ctx, { ...args, setAuthSourceToClerk }, result);
    return result;
  },
});
