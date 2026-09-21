import { describe, expect, test } from "bun:test";
import { defineSchema, makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { eventsTables } from "../../schema/events";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/bootstrap/registerListeners.ts": () => import("../registerListeners"),
  "./convex/events/internals.ts": () => import("../../events/internals"),
};
const ensureRequired = makeFunctionReference<"mutation">("bootstrap/registerListeners:ensureRequired");
const harness = () => convexTest({ schema: defineSchema(eventsTables), modules });

describe("installation listener bootstrap", () => {
  test("registers fresh defaults and repeats without changing records", async () => {
    const t = harness();
    const first = await t.mutation(ensureRequired, {});
    const before = await t.run((ctx) => ctx.db.query("eventListeners").collect());
    expect(first.created).toBeGreaterThan(0);
    expect(before.some((row) => row.eventCode === "*" && row.handlerModule === "auditLogs/internals")).toBe(true);
    expect(before.some((row) => row.eventCode === "lms.course_published")).toBe(true);
    const repeated = await t.mutation(ensureRequired, {});
    expect(repeated.created).toBe(0);
    expect(repeated.reactivated).toBe(0);
    expect(repeated.deactivated).toBe(0);
    expect(await t.run((ctx) => ctx.db.query("eventListeners").collect())).toEqual(before);
  });

  test("preserves disabled, customized and obsolete listeners and does not replay old events", async () => {
    const t = harness();
    await t.mutation(ensureRequired, {});
    await t.run(async (ctx) => {
      const audit = (await ctx.db.query("eventListeners").collect()).find((row) => row.eventCode === "*")!;
      await ctx.db.patch(audit._id, { isActive: false, handlerModule: "custom/audit", priority: 17, updatedAt: 123 });
      await ctx.db.insert("eventListeners", {
        eventCode: "post.published", name: "Email: Post Published Notifications",
        handlerModule: "custom/mail", handlerFunction: "send", handlerType: "action",
        priority: 11, isActive: true, maxRetries: 0, retryDelayMs: 0, retryBackoff: "linear",
        system: "custom", createdAt: 123, updatedAt: 123,
      });
      await ctx.db.insert("events", {
        code: "registration.user_registered", system: "registration", payload: "{}", status: "pending",
        listenersTotal: 0, listenersCompleted: 0, listenersFailed: 0, emittedAt: 123,
      });
    });
    const snapshot = () => t.run(async (ctx) => ({
      listeners: await ctx.db.query("eventListeners").collect(),
      events: await ctx.db.query("events").collect(),
      executions: await ctx.db.query("eventListenerExecutions").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    const before = await snapshot();
    const result = await t.mutation(ensureRequired, {});
    expect(result.reactivated).toBe(0);
    expect(result.deactivated).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect(before.executions).toEqual([]);
    expect(before.scheduled).toEqual([]);
    // Even a previously scheduled dispatcher uses execution IDs fixed at emit time,
    // not the newly registered listener inventory.
    await t.mutation(makeFunctionReference<"mutation">("events/internals:processEvent"), {
      eventId: before.events[0]._id,
    });
    const processed = await snapshot();
    expect(processed.events[0].status).toBe("completed");
    expect(processed.executions).toEqual([]);
    expect(processed.scheduled).toEqual([]);
  });

  test("repairs a partial installation while leaving every surviving record unchanged", async () => {
    const t = harness();
    await t.mutation(ensureRequired, {});
    const removed = await t.run(async (ctx) => {
      const rows = await ctx.db.query("eventListeners").collect();
      const audit = rows.find((row) => row.eventCode === "*")!;
      await ctx.db.delete(audit._id);
      return audit;
    });
    const before = await t.run((ctx) => ctx.db.query("eventListeners").collect());
    const result = await t.mutation(ensureRequired, {});
    const after = await t.run((ctx) => ctx.db.query("eventListeners").collect());
    expect(result.created).toBe(1);
    expect(after.filter((row) => row.eventCode !== "*")).toEqual(before);
    expect(after.find((row) => row.eventCode === "*")?.name).toBe(removed.name);
  });
});
