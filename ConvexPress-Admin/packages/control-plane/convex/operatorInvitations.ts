import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

const INVITATION_TTL_MS = 24 * 60 * 60 * 1_000;
const CLAIM_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type WriteCtx = Pick<MutationCtx, "db">;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeClaimSecret(value: string) {
  const secret = value.trim();
  if (!CLAIM_SECRET_PATTERN.test(secret)) {
    throw new Error("The invitation code is invalid");
  }
  return secret;
}

async function hashClaimSecret(value: string) {
  const bytes = new TextEncoder().encode(normalizeClaimSecret(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function latestInvitation(
  ctx: ReadCtx,
  operatorId: Id<"overseer_users">,
) {
  return (
    await ctx.db
      .query("overseer_operatorInvitations")
      .withIndex("by_operator_created", (q) => q.eq("operatorId", operatorId))
      .order("desc")
      .take(1)
  )[0] ?? null;
}

export async function issueOperatorInvitation(
  ctx: WriteCtx,
  args: {
    operatorId: Id<"overseer_users">;
    email: string;
    claimSecret: string;
    createdBy: Id<"overseer_users">;
    now?: number;
  },
) {
  const now = args.now ?? Date.now();
  const email = normalizeEmail(args.email);
  const tokenHash = await hashClaimSecret(args.claimSecret);
  const existing = await ctx.db
    .query("overseer_operatorInvitations")
    .withIndex("by_operator_created", (q) =>
      q.eq("operatorId", args.operatorId),
    )
    .order("desc")
    .take(20);
  for (const invitation of existing) {
    if (invitation.status === "pending") {
      await ctx.db.patch(invitation._id, {
        status: "revoked",
        revokedAt: now,
      });
    }
  }
  const expiresAt = now + INVITATION_TTL_MS;
  const invitationId = await ctx.db.insert("overseer_operatorInvitations", {
    operatorId: args.operatorId,
    email,
    tokenHash,
    status: "pending",
    expiresAt,
    createdAt: now,
    createdBy: args.createdBy,
  });
  return { invitationId, expiresAt };
}

export async function validateSignupSecret(
  ctx: ReadCtx,
  args: { email: string; claimSecret: string; now?: number },
) {
  const now = args.now ?? Date.now();
  const email = normalizeEmail(args.email);
  const secret = normalizeClaimSecret(args.claimSecret);
  const anyUsers = await ctx.db.query("overseer_users").take(1);

  if (anyUsers.length === 0) {
    const reservations = await ctx.db
      .query("overseer_serverBootstrapReservations")
      .withIndex("by_reservationKey", (q) =>
        q.eq("reservationKey", "server-bootstrap"),
      )
      .take(2);
    const reservation = reservations[0];
    if (
      reservations.length !== 1 ||
      !reservation ||
      reservation.status !== "reserved" ||
      reservation.expiresAt <= now ||
      reservation.ownerEmail !== email ||
      reservation.reservationId !== secret
    ) {
      throw new Error("A live matching bootstrap invitation code is required");
    }
    return { kind: "owner" as const, operatorId: null };
  }

  const users = await ctx.db
    .query("overseer_users")
    .withIndex("email", (q) => q.eq("email", email))
    .take(2);
  if (users.length !== 1 || !users[0]) {
    throw new Error("A matching pre-provisioned operator is required");
  }
  const operator = users[0];
  if (operator.isActive === false || operator.authUserId) {
    throw new Error("The operator invitation is not claimable");
  }
  const invitation = await latestInvitation(ctx, operator._id);
  if (!invitation || invitation.status !== "pending") {
    throw new Error("An active invitation is required");
  }
  if (invitation.expiresAt <= now) {
    throw new Error("The operator invitation has expired");
  }
  if (
    invitation.email !== email ||
    invitation.tokenHash !== (await hashClaimSecret(secret))
  ) {
    throw new Error("The invitation code is invalid");
  }
  return { kind: "operator" as const, operatorId: operator._id };
}

export async function getPendingOperatorInvitation(
  ctx: ReadCtx,
  args: { operatorId: Id<"overseer_users"> },
): Promise<Doc<"overseer_operatorInvitations"> | null> {
  const invitation = await latestInvitation(ctx, args.operatorId);
  return invitation?.status === "pending" ? invitation : null;
}

export async function consumePendingOperatorInvitation(
  ctx: WriteCtx,
  args: { operatorId: Id<"overseer_users">; now?: number },
) {
  const now = args.now ?? Date.now();
  const invitation = await getPendingOperatorInvitation(ctx, args);
  if (!invitation || invitation.expiresAt <= now) {
    throw new Error("An active invitation is required");
  }
  await ctx.db.patch(invitation._id, {
    status: "consumed",
    consumedAt: now,
  });
  return invitation;
}

export const validateForSignup = internalQuery({
  args: { email: v.string(), claimSecret: v.string() },
  returns: v.object({
    kind: v.union(v.literal("owner"), v.literal("operator")),
    operatorId: v.union(v.id("overseer_users"), v.null()),
  }),
  handler: async (ctx, args) => await validateSignupSecret(ctx, args),
});
