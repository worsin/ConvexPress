/**
 * Commerce Subscriptions — customer emails for the subscription lifecycle.
 *
 * Each handler takes `{ eventId }` (the event registry wires one per event
 * code), builds the variables for its template and queues the email
 * (`emails.internals.queueEmail`), like every other event-driven email.
 *
 * What a customer is told, by event:
 *   created          welcome: what they bought, what it costs, when it charges
 *   renewed          receipt (invoice, amount, next charge); after a failed
 *                    payment, "your payment went through" instead
 *   past_due         the charge failed: why, when we try again, how long
 *                    access lasts, and a link to update the card
 *   trial_ending     the trial ends on a date and the first charge follows
 *   cancel_scheduled it ends at the period end; access until then; keep link
 *   cancelled        it has ended (and why, when payments stopped it)
 *   paused/resumed   confirmation
 *
 * Templates interpolate `{variables}` with no conditionals, so sentences that
 * depend on state (a retry date or "this was our last try") are written here.
 * Links are absolute (site URL + the customer dashboard path) so they work in
 * every mail client. Money is formatted in the contract's currency and dates
 * in the site's time zone.
 */

import { v } from "convex/values";

import { internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { readMergedSettingsSection } from "../settings/read";
import { asSnapshotBag, snapshotString, type SnapshotBag } from "./snapshot";

type SubscriptionDoc = Doc<"commerce_subscriptions">;

export function formatEmailMoney(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currencyCode}`;
  }
}

export function formatEmailDate(timestamp: number | undefined, timeZone: string): string {
  if (timestamp === undefined) return "";
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(timestamp);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(timestamp);
  }
}

/** "per month", "every 3 months", "per year". */
export function cadenceText(interval: SubscriptionDoc["billingInterval"], count: number | undefined): string {
  const unit = interval ?? "month";
  const n = count && count > 1 ? count : 1;
  return n === 1 ? `per ${unit}` : `every ${n} ${unit}s`;
}

/** Why a card payment failed, in words a customer understands. */
export function cardFailureText(reason: string | undefined): string {
  switch (reason) {
    case "insufficient_funds":
      return "Your card has insufficient funds.";
    case "expired_card":
      return "Your card has expired.";
    case "authentication_required":
      return "Your bank asked you to approve the payment.";
    case "no_payment_method_on_file":
      return "There is no card on file.";
    case "incorrect_cvc":
    case "incorrect_number":
      return "Your card details were not accepted.";
    default:
      return "Your card was declined.";
  }
}

function joinUrl(base: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base.replace(/\/+$/, "")}${cleanPath}` : cleanPath;
}

interface EmailContext {
  to: string;
  name?: string;
  userId: string;
  subscription: SubscriptionDoc;
  payload: SnapshotBag;
  timeZone: string;
  variables: Record<string, string>;
}

async function currentPlanTitle(ctx: MutationCtx, subscription: SubscriptionDoc): Promise<string> {
  const items = await ctx.db
    .query("commerce_subscription_items")
    .withIndex("by_subscription", (q) => q.eq("subscriptionId", subscription._id))
    .collect();
  const item =
    items.find((row) => row.status === "active" || row.status === "pending_cancel") ?? items[items.length - 1];
  const offer = item?.sourceOfferId ? await ctx.db.get(item.sourceOfferId) : null;
  return offer?.title ?? item?.titleSnapshot ?? "your subscription";
}

/** The subscription, its customer, and the variables every subscription email shares. */
async function loadContext(ctx: MutationCtx, eventId: Id<"events">): Promise<EmailContext | null> {
  const event = await ctx.db.get("events", eventId);
  if (!event) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.payload || "{}");
  } catch {
    return null;
  }
  const payload = asSnapshotBag(parsed);
  const rawSubscriptionId = snapshotString(payload, "subscriptionId");
  const subscriptionId = rawSubscriptionId ? ctx.db.normalizeId("commerce_subscriptions", rawSubscriptionId) : null;
  const subscription = subscriptionId ? await ctx.db.get(subscriptionId) : null;
  if (!subscription?.userId) return null;
  const user = await ctx.db.get(subscription.userId);
  if (!user?.email) return null;

  const general = await readMergedSettingsSection(ctx, "general");
  const dashboard = await readMergedSettingsSection(ctx, "dashboard");
  const siteUrl = typeof general.siteUrl === "string" ? general.siteUrl : "";
  const timeZone = typeof general.timezone === "string" && general.timezone ? general.timezone : "UTC";
  const dashboardBase = typeof dashboard.basePath === "string" && dashboard.basePath ? dashboard.basePath : "/dashboard";
  const currency = subscription.currencyCode || "USD";

  return {
    to: user.email,
    name: user.displayName,
    userId: String(user._id),
    subscription,
    payload,
    timeZone,
    variables: {
      recipient_name: user.firstName || user.displayName || "there",
      offer_title: await currentPlanTitle(ctx, subscription),
      amount: formatEmailMoney(subscription.recurringAmount, currency),
      cadence: cadenceText(subscription.billingInterval, subscription.billingIntervalCount),
      next_billing_at: formatEmailDate(subscription.nextBillingAt, timeZone),
      current_period_end: formatEmailDate(subscription.currentPeriodEndAt, timeZone),
      trial_ends_at: formatEmailDate(subscription.trialEndsAt, timeZone),
      portal_url: joinUrl(siteUrl, joinUrl(dashboardBase, "/subscriptions")),
    },
  };
}

async function queue(ctx: MutationCtx, eventId: Id<"events">, templateSlug: string, context: EmailContext): Promise<void> {
  await ctx.runMutation(internal.emails.internals.queueEmail, {
    templateSlug,
    variables: JSON.stringify(context.variables),
    recipientEmail: context.to,
    recipientName: context.name,
    recipientUserId: context.userId,
    eventId,
  });
}

function payloadNumber(payload: SnapshotBag, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function invoiceFromPayload(ctx: MutationCtx, payload: SnapshotBag) {
  const raw = snapshotString(payload, "invoiceId");
  const invoiceId = raw ? ctx.db.normalizeId("commerce_subscription_invoices", raw) : null;
  return invoiceId ? ctx.db.get(invoiceId) : null;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const onSubscriptionCreated = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadContext(ctx, args.eventId);
    if (!context) return null;
    const { subscription, variables } = context;
    variables.billing_note =
      subscription.status === "trialing" && variables.trial_ends_at
        ? `Your free trial runs until ${variables.trial_ends_at}. Your first charge of ${variables.amount} is on that day, and then ${variables.amount} ${variables.cadence}.`
        : variables.next_billing_at
          ? `You pay ${variables.amount} ${variables.cadence}. Your next charge is on ${variables.next_billing_at}.`
          : `You pay ${variables.amount} ${variables.cadence}.`;
    await queue(ctx, args.eventId, "subscription-welcome", context);
    return null;
  },
});

export const onSubscriptionRenewed = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadContext(ctx, args.eventId);
    if (!context) return null;
    const invoice = await invoiceFromPayload(ctx, context.payload);
    const charged = payloadNumber(context.payload, "amount") ?? invoice?.totalAmount ?? context.subscription.recurringAmount;
    context.variables.amount_charged = formatEmailMoney(charged, invoice?.currencyCode ?? context.subscription.currencyCode);
    context.variables.invoice_number = invoice?.invoiceNumber ?? "";
    const recovered = context.payload.recovered === true;
    await queue(ctx, args.eventId, recovered ? "subscription-payment-recovered" : "subscription-renewed", context);
    return null;
  },
});

export const onSubscriptionPastDue = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadContext(ctx, args.eventId);
    if (!context) return null;
    const { subscription, variables, timeZone, payload } = context;
    const invoice = await invoiceFromPayload(ctx, payload);
    const attempts = invoice
      ? await ctx.db
          .query("commerce_subscription_dunning_attempts")
          .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
          .collect()
      : [];
    const lastFailure = attempts
      .filter((attempt) => attempt.status === "failed")
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const nextRetryAt = payloadNumber(payload, "nextRetryAt");
    const graceEnds = (
      await ctx.db
        .query("commerce_subscription_entitlements")
        .withIndex("by_subscription", (q) => q.eq("subscriptionId", subscription._id))
        .collect()
    )
      .map((entitlement) => entitlement.graceEndsAt)
      .filter((value): value is number => value !== undefined);

    variables.amount_due = formatEmailMoney(invoice?.totalAmount ?? subscription.recurringAmount, invoice?.currencyCode ?? subscription.currencyCode);
    variables.failure_reason = cardFailureText(lastFailure?.errorMessage);
    variables.retry_note = nextRetryAt
      ? `We'll try your card again on ${formatEmailDate(nextRetryAt, timeZone)}.`
      : "This was our last try, so please update your card to keep your subscription.";
    variables.access_note =
      graceEnds.length > 0 ? `Your access continues until ${formatEmailDate(Math.max(...graceEnds), timeZone)}.` : "";
    variables.attempt_number = String(payloadNumber(payload, "attemptNumber") ?? 1);
    variables.max_attempts = String(payloadNumber(payload, "maxAttempts") ?? 4);
    await queue(ctx, args.eventId, "subscription-payment-failed", context);
    return null;
  },
});

export const onSubscriptionTrialEnding = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadContext(ctx, args.eventId);
    if (!context) return null;
    await queue(ctx, args.eventId, "subscription-trial-ending", context);
    return null;
  },
});

export const onSubscriptionCancelScheduled = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadContext(ctx, args.eventId);
    if (!context) return null;
    context.variables.access_until = context.variables.current_period_end;
    await queue(ctx, args.eventId, "subscription-cancel-scheduled", context);
    return null;
  },
});

export const onSubscriptionCancelled = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadContext(ctx, args.eventId);
    if (!context) return null;
    const reason = snapshotString(context.payload, "reason");
    context.variables.cancel_note =
      reason === "dunning_exhausted"
        ? "It was cancelled because we couldn't collect payment after several tries. You're welcome back any time."
        : "Your access has ended. You're welcome back any time.";
    await queue(ctx, args.eventId, "subscription-cancelled", context);
    return null;
  },
});

export const onSubscriptionPaused = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadContext(ctx, args.eventId);
    if (!context) return null;
    await queue(ctx, args.eventId, "subscription-paused", context);
    return null;
  },
});

export const onSubscriptionResumed = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await loadContext(ctx, args.eventId);
    if (!context) return null;
    const from = snapshotString(context.payload, "fromStatus");
    context.variables.resume_note =
      from === "pending_cancel"
        ? `You're staying with ${context.variables.offer_title}. Nothing changes: your next charge of ${context.variables.amount} is on ${context.variables.next_billing_at}.`
        : `${context.variables.offer_title} is active again. Your next charge of ${context.variables.amount} is on ${context.variables.next_billing_at}.`;
    await queue(ctx, args.eventId, "subscription-resumed", context);
    return null;
  },
});
