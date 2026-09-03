import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  cleanBootstrapInput,
  cleanOwnerEmail,
  cleanReservationId,
  decideReservationWrite,
} from "./serverBootstrapPolicy";

const RESERVATION_KEY = "server-bootstrap" as const;
const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,79}$/;

const reservationStatus = v.union(
  v.literal("reserved"),
  v.literal("owner_created"),
  v.literal("machine_enrolled"),
  v.literal("finalized"),
  v.literal("failed"),
);

const reservationResult = v.object({
  reservationId: v.string(),
  machineId: v.string(),
  ownerEmail: v.string(),
  status: reservationStatus,
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
  ownerCreatedAt: v.union(v.number(), v.null()),
  machineEnrolledAt: v.union(v.number(), v.null()),
  finalizedAt: v.union(v.number(), v.null()),
  failedAt: v.union(v.number(), v.null()),
  idempotent: v.boolean(),
});

type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type BootstrapMutationCtx = Pick<MutationCtx, "db">;

function controlPlaneError(code: string, message: string) {
  return new ConvexError({ code, message });
}

async function getReservation(ctx: ReadCtx) {
  const rows = await ctx.db
    .query("overseer_serverBootstrapReservations")
    .withIndex("by_reservationKey", (q) =>
      q.eq("reservationKey", RESERVATION_KEY),
    )
    .take(2);
  if (rows.length > 1) {
    throw controlPlaneError(
      "BOOTSTRAP_RESERVATION_CORRUPT",
      "Multiple server bootstrap reservations exist",
    );
  }
  return rows[0] ?? null;
}

function summarizeReservation(
  reservation: NonNullable<Awaited<ReturnType<typeof getReservation>>>,
  idempotent: boolean,
) {
  return {
    reservationId: reservation.reservationId,
    machineId: reservation.machineId,
    ownerEmail: reservation.ownerEmail,
    status: reservation.status,
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
    expiresAt: reservation.expiresAt,
    ownerCreatedAt: reservation.ownerCreatedAt ?? null,
    machineEnrolledAt: reservation.machineEnrolledAt ?? null,
    finalizedAt: reservation.finalizedAt ?? null,
    failedAt: reservation.failedAt ?? null,
    idempotent,
  };
}

export async function authorizeFirstOwnerCreation(
  ctx: BootstrapMutationCtx,
  args: { ownerEmail: string },
) {
  const ownerEmail = cleanOwnerEmail(args.ownerEmail);
  const existingUsers = await ctx.db.query("overseer_users").take(1);
  if (existingUsers.length > 0) {
    throw controlPlaneError(
      "BOOTSTRAP_OWNER_ALREADY_EXISTS",
      "The first installation owner already exists",
    );
  }

  const reservation = await getReservation(ctx);
  if (!reservation) {
    throw controlPlaneError(
      "BOOTSTRAP_RESERVATION_REQUIRED",
      "Reserve server bootstrap before creating the first owner",
    );
  }
  if (reservation.status === "failed") {
    throw controlPlaneError(
      "BOOTSTRAP_RESERVATION_FAILED",
      "The server bootstrap reservation has failed",
    );
  }
  if (reservation.status !== "reserved") {
    throw controlPlaneError(
      "BOOTSTRAP_RESERVATION_ALREADY_USED",
      "The server bootstrap reservation has already been used",
    );
  }
  if (reservation.expiresAt <= Date.now()) {
    throw controlPlaneError(
      "BOOTSTRAP_RESERVATION_EXPIRED",
      "The server bootstrap reservation has expired",
    );
  }
  if (reservation.ownerEmail !== ownerEmail) {
    throw controlPlaneError(
      "BOOTSTRAP_OWNER_MISMATCH",
      "The sign-up email does not match the reserved installation owner",
    );
  }

  return {
    reservationId: reservation.reservationId,
    machineId: reservation.machineId,
    ownerEmail: reservation.ownerEmail,
    status: reservation.status,
    expiresAt: reservation.expiresAt,
  } as const;
}

export async function recordFirstOwnerCreated(
  ctx: BootstrapMutationCtx,
  args: {
    reservationId: string;
    ownerUserId: Id<"overseer_users">;
  },
): Promise<void> {
  const reservationId = cleanReservationId(args.reservationId);
  const ownerUserId = ctx.db.normalizeId(
    "overseer_users",
    String(args.ownerUserId),
  );
  if (!ownerUserId) {
    throw controlPlaneError(
      "INVALID_BOOTSTRAP_OWNER_ID",
      "Invalid bootstrap owner identity",
    );
  }

  const reservation = await getReservation(ctx);
  if (!reservation || reservation.reservationId !== reservationId) {
    throw controlPlaneError(
      "BOOTSTRAP_RESERVATION_NOT_FOUND",
      "Server bootstrap reservation not found",
    );
  }
  if (
    reservation.status === "owner_created" &&
    reservation.ownerUserId === ownerUserId
  ) {
    return;
  }
  if (reservation.status !== "reserved") {
    throw controlPlaneError(
      "BOOTSTRAP_RESERVATION_NOT_ACTIVE",
      "The server bootstrap reservation cannot record an owner",
    );
  }
  if (reservation.expiresAt <= Date.now()) {
    throw controlPlaneError(
      "BOOTSTRAP_RESERVATION_EXPIRED",
      "The server bootstrap reservation has expired",
    );
  }

  const owner = await ctx.db.get(ownerUserId);
  if (
    !owner ||
    owner.role !== "owner" ||
    cleanOwnerEmail(owner.email ?? "") !== reservation.ownerEmail
  ) {
    throw controlPlaneError(
      "BOOTSTRAP_OWNER_MISMATCH",
      "The created owner does not match the bootstrap reservation",
    );
  }
  const users = await ctx.db.query("overseer_users").take(2);
  if (users.length !== 1 || users[0]._id !== ownerUserId) {
    throw controlPlaneError(
      "BOOTSTRAP_OWNER_CONFLICT",
      "First-owner creation is no longer exclusive",
    );
  }

  const now = Date.now();
  await ctx.db.patch(reservation._id, {
    status: "owner_created",
    ownerUserId,
    ownerCreatedAt: now,
    updatedAt: now,
  });
}

export const reserve = internalMutation({
  args: {
    reservationId: v.string(),
    machineId: v.string(),
    ownerEmail: v.string(),
    ttlMs: v.number(),
  },
  returns: reservationResult,
  handler: async (ctx, args) => {
    const input = cleanBootstrapInput(args);
    const now = Date.now();
    const existing = await getReservation(ctx);
    let decision;
    try {
      decision = decideReservationWrite({
        now,
        input,
        existing: existing ?? undefined,
      });
    } catch (error) {
      throw controlPlaneError(
        "BOOTSTRAP_RESERVATION_REJECTED",
        error instanceof Error ? error.message : "Bootstrap reservation rejected",
      );
    }

    if (decision.kind === "finalized") {
      return summarizeReservation(existing!, true);
    }
    if (decision.kind === "renew") {
      await ctx.db.patch(existing!._id, {
        updatedAt: now,
        expiresAt: decision.expiresAt,
      });
      const renewed = await ctx.db.get(existing!._id);
      if (!renewed) {
        throw controlPlaneError(
          "BOOTSTRAP_RESERVATION_LOST",
          "The bootstrap reservation disappeared during retry",
        );
      }
      return summarizeReservation(renewed, true);
    }

    const value = {
      reservationKey: RESERVATION_KEY,
      reservationId: input.reservationId,
      machineId: input.machineId,
      ownerEmail: input.ownerEmail,
      status: "reserved" as const,
      createdAt: now,
      updatedAt: now,
      expiresAt: decision.expiresAt,
    };

    const id = existing
      ? (await ctx.db.replace(existing._id, value), existing._id)
      : await ctx.db.insert("overseer_serverBootstrapReservations", value);
    const stored = await ctx.db.get(id);
    if (!stored) {
      throw controlPlaneError(
        "BOOTSTRAP_RESERVATION_CREATE_FAILED",
        "Could not create the server bootstrap reservation",
      );
    }
    return summarizeReservation(stored, false);
  },
});

export const finalize = internalMutation({
  args: { reservationId: v.string() },
  returns: reservationResult,
  handler: async (ctx, args) => {
    const reservationId = cleanReservationId(args.reservationId);
    const reservation = await getReservation(ctx);
    if (!reservation || reservation.reservationId !== reservationId) {
      throw controlPlaneError(
        "BOOTSTRAP_RESERVATION_NOT_FOUND",
        "Server bootstrap reservation not found",
      );
    }
    if (reservation.status === "finalized") {
      return summarizeReservation(reservation, true);
    }
    if (reservation.status !== "owner_created") {
      throw controlPlaneError(
        "BOOTSTRAP_OWNER_REQUIRED",
        "Create the reserved owner before finalizing bootstrap",
      );
    }

    const now = Date.now();
    await ctx.db.patch(reservation._id, {
      status: "finalized",
      finalizedAt: now,
      updatedAt: now,
    });
    const finalized = await ctx.db.get(reservation._id);
    if (!finalized) {
      throw controlPlaneError(
        "BOOTSTRAP_RESERVATION_LOST",
        "The bootstrap reservation disappeared while finalizing",
      );
    }
    return summarizeReservation(finalized, false);
  },
});

export const fail = internalMutation({
  args: {
    reservationId: v.string(),
    reasonCode: v.string(),
  },
  returns: reservationResult,
  handler: async (ctx, args) => {
    const reservationId = cleanReservationId(args.reservationId);
    const reasonCode = args.reasonCode.trim();
    if (!FAILURE_CODE_PATTERN.test(reasonCode)) {
      throw controlPlaneError(
        "INVALID_BOOTSTRAP_FAILURE_CODE",
        "Invalid bootstrap failure code",
      );
    }
    const reservation = await getReservation(ctx);
    if (!reservation || reservation.reservationId !== reservationId) {
      throw controlPlaneError(
        "BOOTSTRAP_RESERVATION_NOT_FOUND",
        "Server bootstrap reservation not found",
      );
    }
    if (reservation.status === "finalized") {
      throw controlPlaneError(
        "BOOTSTRAP_ALREADY_FINALIZED",
        "A finalized bootstrap cannot be failed",
      );
    }
    if (reservation.status === "owner_created") {
      throw controlPlaneError(
        "BOOTSTRAP_OWNER_ALREADY_CREATED",
        "Finalize the reservation that created the installation owner",
      );
    }
    if (reservation.status === "failed") {
      return summarizeReservation(reservation, true);
    }

    const now = Date.now();
    await ctx.db.patch(reservation._id, {
      status: "failed",
      failureCode: reasonCode,
      failedAt: now,
      updatedAt: now,
    });
    const failed = await ctx.db.get(reservation._id);
    if (!failed) {
      throw controlPlaneError(
        "BOOTSTRAP_RESERVATION_LOST",
        "The bootstrap reservation disappeared while failing",
      );
    }
    return summarizeReservation(failed, false);
  },
});

export const getStatus = internalQuery({
  args: { reservationId: v.string() },
  returns: v.union(reservationResult, v.null()),
  handler: async (ctx, args) => {
    const reservationId = cleanReservationId(args.reservationId);
    const reservation = await getReservation(ctx);
    if (!reservation || reservation.reservationId !== reservationId) return null;
    return summarizeReservation(reservation, true);
  },
});
