import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { internal } from "../_generated/api";
import schema from "../schema";
import {
  authorizeFirstOwnerCreation,
  recordFirstOwnerCreated,
} from "../serverBootstrap";

const modules = {
  "./convex/_generated/api.js": () => import("../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../_generated/server.js"),
  "./convex/serverBootstrap.ts": () => import("../serverBootstrap"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

describe("server bootstrap transactions", () => {
  test("reserves idempotently and rejects a changed retry", async () => {
    const t = createHarness();
    const input = {
      reservationId: "reservation_0123456789",
      machineId: "machine_01234567",
      ownerEmail: "Owner@Example.com",
      ttlMs: 120_000,
    };

    const created = await t.mutation(internal.serverBootstrap.reserve, input);
    expect(created).toMatchObject({
      reservationId: "reservation_0123456789",
      machineId: "machine_01234567",
      ownerEmail: "owner@example.com",
      status: "reserved",
      idempotent: false,
    });

    const retried = await t.mutation(internal.serverBootstrap.reserve, input);
    expect(retried.idempotent).toBe(true);
    expect(retried.expiresAt).toBeGreaterThanOrEqual(created.expiresAt);

    await expect(
      t.mutation(internal.serverBootstrap.reserve, {
        ...input,
        machineId: "different_machine_01234567",
      }),
    ).rejects.toThrow("same machine and owner");
  });

  test("requires the reserved email and finalizes only after exact owner creation", async () => {
    const t = createHarness();
    const reservationId = "reservation_0123456789";
    await t.mutation(internal.serverBootstrap.reserve, {
      reservationId,
      machineId: "machine_01234567",
      ownerEmail: "owner@example.com",
      ttlMs: 120_000,
    });

    await expect(
      t.run(async (ctx) =>
        authorizeFirstOwnerCreation(ctx, { ownerEmail: "wrong@example.com" }),
      ),
    ).rejects.toThrow("does not match");
    await expect(
      t.mutation(internal.serverBootstrap.finalize, { reservationId }),
    ).rejects.toThrow("before finalizing");

    const ownerUserId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("overseer_users", {
        email: "owner@example.com",
        name: "Owner",
        role: "owner",
        isActive: true,
        createdAt: Date.now(),
      });
      await recordFirstOwnerCreated(ctx, { reservationId, ownerUserId: userId });
      return userId;
    });

    const finalized = await t.mutation(internal.serverBootstrap.finalize, {
      reservationId,
    });
    expect(finalized.status).toBe("finalized");
    expect(finalized.idempotent).toBe(false);
    expect(finalized.finalizedAt).toBeNumber();

    const snapshot = await t.run(async (ctx) => ({
      user: await ctx.db.get(ownerUserId),
      reservations: await ctx.db
        .query("overseer_serverBootstrapReservations")
        .take(2),
    }));
    expect(snapshot.user?.role).toBe("owner");
    expect(snapshot.reservations).toHaveLength(1);
    expect(snapshot.reservations[0]?.ownerUserId).toBe(ownerUserId);
  });
});
