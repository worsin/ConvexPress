import { describe, expect, test } from "bun:test";
import { defineSchema, makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { emailTables } from "../../schema/emails";
import { taxonomyTables } from "../../schema/taxonomies";
import { eventsTables } from "../../schema/events";
import { DEFAULT_TEMPLATES } from "../../emails/templateDefaults";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/bootstrap/requiredRecords.ts": () => import("../requiredRecords"),
};
const ensure = makeFunctionReference<"mutation">("bootstrap/requiredRecords:ensure");
const harness = () => convexTest({ schema: defineSchema({ ...emailTables, ...taxonomyTables, ...eventsTables }), modules });

describe("required installation records", () => {
  test("creates all email defaults including LMS and shipping and one default category without dispatch", async () => {
    const t = harness();
    const result = await t.mutation(ensure, {});
    expect(result.templatesCreated).toBe(DEFAULT_TEMPLATES.length);
    expect(result.categoryCreated).toBe(true);
    const templates = await t.run((ctx) => ctx.db.query("emailTemplates").collect());
    expect(templates.find((row) => row.slug === "lms-course-enrolled")?.bodyHtml).toContain("{course_url}");
    expect(templates.some((row) => row.slug === "shipping_delivered")).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("emailQueue").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
    const before = await t.run(async (ctx) => ({ templates: await ctx.db.query("emailTemplates").collect(), terms: await ctx.db.query("terms").collect() }));
    expect(await t.mutation(ensure, {})).toEqual({ templatesCreated: 0, templatesExisting: DEFAULT_TEMPLATES.length, categoryCreated: false });
    expect(await t.run(async (ctx) => ({ templates: await ctx.db.query("emailTemplates").collect(), terms: await ctx.db.query("terms").collect() }))).toEqual(before);
  });

  test("fills missing templates but preserves disabled/custom content, metadata, and existing category choices", async () => {
    const t = harness();
    await t.mutation(ensure, {});
    await t.run(async (ctx) => {
      const templates = await ctx.db.query("emailTemplates").collect();
      const enrollment = templates.find((row) => row.slug === "lms-course-enrolled")!;
      await ctx.db.patch(enrollment._id, { isActive: false, isCustomized: true, name: "Our enrollment", subjectTemplate: "Custom subject", bodyHtml: "<p>Custom prose</p>", priority: "digest", eventCode: "custom.event", updatedAt: 123 });
      await ctx.db.delete(templates.find((row) => row.slug === "shipping_delivered")!._id);
      const category = (await ctx.db.query("terms").collect())[0];
      await ctx.db.patch(category._id, { name: "Journal", slug: "journal", isDefault: false, updatedAt: 123 });
      await ctx.db.insert("eventListeners", {
        eventCode: "lms.enrolled", name: "Disabled enrollment email", handlerModule: "emails/internals",
        handlerFunction: "onLmsEnrolled", handlerType: "internal", priority: 20, isActive: false,
        maxRetries: 0, retryDelayMs: 0, retryBackoff: "linear", system: "email", createdAt: 123, updatedAt: 123,
      });
      await ctx.db.insert("emailQueue", {
        to: "fixture@example.invalid", from: "sender@example.invalid", fromName: "Offline fixture",
        subject: "Do not dispatch", bodyHtml: "<p>Existing queue row</p>", templateSlug: "lms-course-enrolled",
        templateVariables: "{}", status: "queued", priority: "immediate", attempts: 0, maxAttempts: 3, createdAt: 123,
      });
    });
    const before = await t.run(async (ctx) => ({ templates: await ctx.db.query("emailTemplates").collect(), terms: await ctx.db.query("terms").collect(), queue: await ctx.db.query("emailQueue").collect() }));
    expect(await t.mutation(ensure, {})).toEqual({ templatesCreated: 1, templatesExisting: DEFAULT_TEMPLATES.length - 1, categoryCreated: false });
    const after = await t.run(async (ctx) => ({ templates: await ctx.db.query("emailTemplates").collect(), terms: await ctx.db.query("terms").collect() }));
    expect(after.templates.filter((row) => row.slug !== "shipping_delivered")).toEqual(before.templates);
    expect(after.terms).toEqual(before.terms);
    expect(await t.run((ctx) => ctx.db.query("emailQueue").collect())).toEqual(before.queue);
    expect((await t.run((ctx) => ctx.db.query("eventListeners").collect()))[0].isActive).toBe(false);
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
  });
});
