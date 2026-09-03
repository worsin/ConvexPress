import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import schema from "../schema";
import {
  consumePendingOperatorInvitation,
  issueOperatorInvitation,
  validateSignupSecret,
} from "../operatorInvitations";

const CLAIM_SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const REISSUED_CLAIM_SECRET = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

const modules = {
  "./convex/_generated/api.js": () => import("../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../_generated/server.js"),
  "./convex/operatorInvitations.ts": () => import("../operatorInvitations"),
};

describe("one-time outer operator invitations", () => {
  test("binds first-owner signup to the live bootstrap reservation secret", async () => {
    const t = convexTest({ schema, modules });
    const now = Date.parse("2026-09-03T18:00:00.000Z");
    const reservationId = "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR";
    await t.run((ctx) =>
      ctx.db.insert("overseer_serverBootstrapReservations", {
        reservationKey: "server-bootstrap",
        reservationId,
        machineId: "worker-machine",
        ownerEmail: "owner@example.com",
        status: "reserved",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 60_000,
      }),
    );

    await expect(
      t.run((ctx) =>
        validateSignupSecret(ctx, {
          email: "owner@example.com",
          claimSecret: "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
          now,
        }),
      ),
    ).rejects.toThrow("bootstrap invitation code");
    await expect(
      t.run((ctx) =>
        validateSignupSecret(ctx, {
          email: "owner@example.com",
          claimSecret: reservationId,
          now,
        }),
      ),
    ).resolves.toEqual({ kind: "owner", operatorId: null });
  });

  test("accepts only the matching live secret and rejects it after consumption", async () => {
    const t = convexTest({ schema, modules });
    const now = Date.parse("2026-09-03T18:00:00.000Z");
    const operatorId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("overseer_users", {
        email: "owner@example.com",
        role: "owner",
        isActive: true,
        createdAt: now,
      });
      const userId = await ctx.db.insert("overseer_users", {
        email: "operator@example.com",
        role: "viewer",
        isActive: true,
        createdAt: now,
        createdBy: ownerId,
      });
      await issueOperatorInvitation(ctx, {
        operatorId: userId,
        email: "operator@example.com",
        claimSecret: CLAIM_SECRET,
        createdBy: ownerId,
        now,
      });
      return userId;
    });

    await expect(
      t.run((ctx) =>
        validateSignupSecret(ctx, {
          email: "operator@example.com",
          claimSecret: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          now,
        }),
      ),
    ).rejects.toThrow("invitation code");

    await expect(
      t.run((ctx) =>
        validateSignupSecret(ctx, {
          email: "operator@example.com",
          claimSecret: CLAIM_SECRET,
          now,
        }),
      ),
    ).resolves.toMatchObject({ kind: "operator", operatorId });

    await t.run((ctx) =>
      consumePendingOperatorInvitation(ctx, {
        operatorId,
        now,
      }),
    );

    await expect(
      t.run((ctx) =>
        validateSignupSecret(ctx, {
          email: "operator@example.com",
          claimSecret: CLAIM_SECRET,
          now: now + 1,
        }),
      ),
    ).rejects.toThrow("active invitation");
  });

  test("rejects expired codes and invalidates older codes when reissued", async () => {
    const t = convexTest({ schema, modules });
    const now = Date.parse("2026-09-03T18:00:00.000Z");
    const { operatorId, ownerId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("overseer_users", {
        email: "owner@example.com",
        role: "owner",
        isActive: true,
        createdAt: now,
      });
      const operatorId = await ctx.db.insert("overseer_users", {
        email: "operator@example.com",
        role: "viewer",
        isActive: true,
        createdAt: now,
      });
      await issueOperatorInvitation(ctx, {
        operatorId,
        email: "operator@example.com",
        claimSecret: CLAIM_SECRET,
        createdBy: ownerId,
        now: now - 25 * 60 * 60 * 1_000,
      });
      return { operatorId, ownerId };
    });

    await expect(
      t.run((ctx) =>
        validateSignupSecret(ctx, {
          email: "operator@example.com",
          claimSecret: CLAIM_SECRET,
          now,
        }),
      ),
    ).rejects.toThrow("expired");

    await t.run((ctx) =>
      issueOperatorInvitation(ctx, {
        operatorId,
        email: "operator@example.com",
        claimSecret: REISSUED_CLAIM_SECRET,
        createdBy: ownerId,
        now,
      }),
    );
    await expect(
      t.run((ctx) =>
        validateSignupSecret(ctx, {
          email: "operator@example.com",
          claimSecret: CLAIM_SECRET,
          now,
        }),
      ),
    ).rejects.toThrow("invalid");
    await expect(
      t.run((ctx) =>
        validateSignupSecret(ctx, {
          email: "operator@example.com",
          claimSecret: REISSUED_CLAIM_SECRET,
          now,
        }),
      ),
    ).resolves.toMatchObject({ kind: "operator", operatorId });
  });
});
