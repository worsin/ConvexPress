import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../../_generated/api";
import schema from "../../../schema";

const modules = {
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/extensions/forms/actions.ts": () => import("../actions"),
};

async function fixture(result: Record<string, unknown>) {
  const t = convexTest({ schema, modules });
  const submissionId = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { email: "pending-payment@example.invalid", emailVerified: true, status: "active", authSource: "local", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true }, updatedAt: 1, updatedBy: user });
    const formId = await ctx.db.insert("forms", { title: "Join", slug: "join", status: "published", settings: "{}", createdBy: user, createdAt: 1, updatedAt: 1 });
    const actionId = await ctx.db.insert("form_actions", { formId, type: "subscription", label: "Subscribe", config: "{}", enabled: true, order: 0 });
    const submission = await ctx.db.insert("form_submissions", { formId, status: "complete", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("form_action_runs", { submissionId: submission, formActionId: actionId, formId, type: "subscription", status: "awaiting_payment", attempts: 1, result: JSON.stringify(result), createdAt: 1, updatedAt: 1 });
    return submission;
  });
  return { t, submissionId };
}

test("a pending subscription payment returns its string intent, secret and key", async () => {
  const { t, submissionId } = await fixture({
    needsPayment: true, intentId: "intent_1", clientSecret: "pi_secret_1", publishableKey: "pk_test_1",
    mode: "payment", amount: 1200, recurringAmount: 1200, currency: "USD", accountPolicy: "create_on_website",
  });
  const pending = await t.query(api.extensions.forms.actions.getPendingPayment, { submissionId });
  expect(pending).toMatchObject({ intentId: "intent_1", clientSecret: "pi_secret_1", publishableKey: "pk_test_1", mode: "payment", amount: 1200, currency: "USD", accountPolicy: "create_on_website" });
});

test("malformed stored fields fall back to safe defaults instead of failing the query", async () => {
  const { t, submissionId } = await fixture({ needsPayment: true, intentId: 42, clientSecret: { nested: true }, amount: "12", mode: null });
  const pending = await t.query(api.extensions.forms.actions.getPendingPayment, { submissionId });
  expect(pending).toMatchObject({ intentId: null, clientSecret: null, publishableKey: null, mode: "payment", amount: 0, recurringAmount: 0, currency: "USD", accountPolicy: "require_existing" });
});
