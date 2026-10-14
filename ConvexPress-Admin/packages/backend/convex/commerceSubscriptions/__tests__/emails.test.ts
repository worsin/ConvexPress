/**
 * Subscription lifecycle emails (upstream PR 035): what each event tells the
 * customer, rendered through the real templates and email queue.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { convexTest } from "convex-test";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/emails.ts": () => import("../emails"),
  "./convex/emails/internals.ts": () => import("../../emails/internals"),
};

const DAY = 24 * 60 * 60 * 1000;
// 9pm in Los Angeles on Oct 14 is already Oct 15 in UTC: dates follow the site's zone.
const NOW = Date.UTC(2026, 9, 15, 4, 0, 0);

beforeEach(() => setSystemTime(new Date(NOW)));
afterEach(() => setSystemTime());

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1,
    });
    const customer = await ctx.db.insert("users", {
      authSource: "local", email: "casey@example.invalid", firstName: "Casey", lastName: "Quinn", emailVerified: true,
      status: "active", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "general", values: { siteTitle: "Clinic", siteUrl: "https://clinic.example/", timezone: "America/Los_Angeles" },
      updatedAt: 1, updatedBy: admin,
    });
    await ctx.db.insert("settings", { section: "email", values: { enabled: true }, updatedAt: 1, updatedBy: admin });
    const templateId = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: true,
      cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = (title: string, amount: number) =>
      ctx.db.insert("commerce_subscription_offers", {
        title, slug: title.toLowerCase(), status: "active", templateId, sourceType: "custom", availableInCart: false,
        availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true,
        allowAddToExistingSubscription: false, currencyCode: "USD", recurringAmount: amount, createdAt: 1, updatedAt: 1,
      });
    const launch = await offer("Launch", 29_900);
    const growth = await offer("Growth", 59_900);
    // Bought on Launch, since upgraded to Growth: emails must name Growth.
    const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
      userId: customer, sourceChannel: "direct_form", templateId, status: "past_due", currencyCode: "USD", recurringAmount: 59_900,
      billingInterval: "month", billingIntervalCount: 1, currentPeriodStartAt: NOW - 20 * DAY, currentPeriodEndAt: NOW + 10 * DAY,
      nextBillingAt: NOW + 10 * DAY, pricingSnapshot: { offerId: launch }, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("commerce_subscription_items", {
      subscriptionId, sourceOfferId: launch, titleSnapshot: "Launch", quantity: 1, unitAmount: 29_900, currencyCode: "USD",
      status: "cancelled", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("commerce_subscription_items", {
      subscriptionId, sourceOfferId: growth, titleSnapshot: "Growth", quantity: 1, unitAmount: 59_900, currencyCode: "USD",
      status: "active", createdAt: 2, updatedAt: 2,
    });
    await ctx.db.insert("commerce_subscription_entitlements", {
      subscriptionId, userId: customer, entitlementCode: "portal", status: "grace", graceEndsAt: NOW + 6 * DAY, startsAt: 1,
      createdAt: 1, updatedAt: 1,
    });
    const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
      subscriptionId, status: "failed", invoiceNumber: "INV-000042", kind: "renewal", currencyCode: "USD", subtotalAmount: 59_900,
      taxAmount: 0, totalAmount: 59_900, createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("commerce_subscription_dunning_attempts", {
      subscriptionId, invoiceId, attemptNumber: 1, status: "failed", scheduledAt: NOW, processedAt: NOW,
      errorMessage: "insufficient_funds", createdAt: NOW, updatedAt: NOW,
    });
    return { subscriptionId, invoiceId };
  });
  await t.mutation(internal.emails.internals.bootstrapTemplates, {});

  const emit = (code: string, payload: Record<string, unknown>) =>
    t.run((ctx) =>
      ctx.db.insert("events", {
        code, system: "commerce", payload: JSON.stringify({ subscriptionId: ids.subscriptionId, ...payload }), status: "pending",
        listenersTotal: 0, listenersCompleted: 0, listenersFailed: 0, emittedAt: NOW,
      }),
    );
  const lastEmail = () =>
    t.run(async (ctx) => {
      const rows = await ctx.db.query("emailQueue").order("desc").take(1);
      const row = rows[0];
      if (!row) throw new Error("no email queued");
      return { slug: row.templateSlug, subject: row.subject, text: row.bodyText ?? "", html: row.bodyHtml, to: row.to };
    });
  return { t, ids, emit, lastEmail };
}

async function deliver(
  f: Awaited<ReturnType<typeof fixture>>,
  handler: "onSubscriptionPastDue" | "onSubscriptionRenewed" | "onSubscriptionCancelScheduled" | "onSubscriptionCancelled" | "onSubscriptionResumed" | "onSubscriptionCreated",
  eventId: Id<"events">,
) {
  await f.t.mutation(internal.commerceSubscriptions.emails[handler], { eventId });
  return f.lastEmail();
}

describe("subscription emails", () => {
  test("a failed payment says how much, why, when we retry, how long access lasts, with a working link", async () => {
    const f = await fixture();
    const eventId = await f.emit("commerce.subscription_past_due", {
      invoiceId: f.ids.invoiceId, attemptNumber: 1, maxAttempts: 4, nextRetryAt: NOW + DAY,
    });
    const email = await deliver(f, "onSubscriptionPastDue", eventId);
    expect(email.to).toBe("casey@example.invalid");
    expect(email.subject).toBe("Action needed: payment for Growth didn't go through");
    expect(email.text).toContain("Hi Casey, we couldn't charge $599.00 for Growth. Your card has insufficient funds.");
    expect(email.text).toContain("We'll try your card again on October 15, 2026. Your access continues until October 20, 2026.");
    expect(email.html).toContain('href="https://clinic.example/dashboard/subscriptions"');
  });

  test("the last failed try says so instead of a retry date", async () => {
    const f = await fixture();
    const eventId = await f.emit("commerce.subscription_past_due", { invoiceId: f.ids.invoiceId, attemptNumber: 4, maxAttempts: 4 });
    const email = await deliver(f, "onSubscriptionPastDue", eventId);
    expect(email.text).toContain("This was our last try, so please update your card to keep your subscription.");
  });

  test("a renewal is a receipt; a payment after a failure is 'you're all set'", async () => {
    const f = await fixture();
    const renewed = await deliver(f, "onSubscriptionRenewed", await f.emit("commerce.subscription_renewed", { invoiceId: f.ids.invoiceId, amount: 59_900 }));
    expect(renewed.slug).toBe("subscription-renewed");
    expect(renewed.subject).toBe("Receipt: Growth renewed");
    expect(renewed.text).toContain("We charged $599.00 to your card on file.");
    expect(renewed.text).toContain("Invoice INV-000042 · Next charge on October 24, 2026.");

    const recovered = await deliver(
      f,
      "onSubscriptionRenewed",
      await f.emit("commerce.subscription_renewed", { invoiceId: f.ids.invoiceId, amount: 59_900, recovered: true }),
    );
    expect(recovered.slug).toBe("subscription-payment-recovered");
    expect(recovered.subject).toBe("Your payment for Growth went through");
  });

  test("a scheduled cancellation says when access ends and how to keep it; the end says why", async () => {
    const f = await fixture();
    const scheduled = await deliver(f, "onSubscriptionCancelScheduled", await f.emit("commerce.subscription_cancel_scheduled", {}));
    expect(scheduled.subject).toBe("Your Growth subscription ends on October 24, 2026");
    expect(scheduled.text).toContain("You keep full access until then, and you won't be charged again.");

    const kept = await deliver(f, "onSubscriptionResumed", await f.emit("commerce.subscription_resumed", { fromStatus: "pending_cancel" }));
    expect(kept.text).toContain("You're staying with Growth. Nothing changes: your next charge of $599.00 is on October 24, 2026.");

    const ended = await deliver(f, "onSubscriptionCancelled", await f.emit("commerce.subscription_cancelled", { reason: "dunning_exhausted" }));
    expect(ended.subject).toBe("Your Growth subscription has ended");
    expect(ended.text).toContain("we couldn't collect payment after several tries");
  });

  test("the welcome states the price and the next charge", async () => {
    const f = await fixture();
    await f.t.run((ctx) => ctx.db.patch("commerce_subscriptions", f.ids.subscriptionId, { status: "active" }));
    const welcome = await deliver(f, "onSubscriptionCreated", await f.emit("commerce.subscription_created", {}));
    expect(welcome.subject).toBe("Welcome to Growth");
    expect(welcome.text).toContain("You pay $599.00 per month. Your next charge is on October 24, 2026.");
  });

  test("an edited template keeps its wording when the defaults change; an untouched one follows them", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      for (const slug of ["subscription-paused", "subscription-cancelled"]) {
        const row = await ctx.db.query("emailTemplates").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
        if (!row) throw new Error("template missing");
        await ctx.db.patch("emailTemplates", row._id, {
          subjectTemplate: "Old subject",
          defaultSubjectTemplate: "Old subject",
          isCustomized: slug === "subscription-cancelled",
        });
      }
    });
    await f.t.mutation(internal.emails.internals.bootstrapTemplates, {});
    const subjects = await f.t.run(async (ctx) => {
      const read = async (slug: string) =>
        (await ctx.db.query("emailTemplates").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())?.subjectTemplate;
      return { paused: await read("subscription-paused"), cancelled: await read("subscription-cancelled") };
    });
    expect(subjects).toEqual({ paused: "Your {offer_title} subscription is paused", cancelled: "Old subject" });
  });
});
