/**
 * ConvexPress Forms — Form Actions & Feeds System (config CRUD + event-driven
 * runner). API path: api.extensions.forms.actions.* (client CRUD)
 *                   internal.extensions.forms.actions.* (runner + helpers)
 *
 * This file owns the Actions system end-to-end so it never touches the shared
 * mutations.ts / queries.ts:
 *   - Admin CRUD over `form_actions` (all gated by `form.manage_actions`).
 *   - `runActions` — an internalMutation subscribed to `form.submitted`. The
 *     event dispatcher invokes every handler with `{ eventId }` ONLY, so this
 *     loads the event, JSON.parses the payload, re-reads the committed answers
 *     from `fieldValues` (the form.submitted payload omits values), evaluates
 *     conditional logic, and enqueues ONE isolated `dispatchAction` job per
 *     enabled action (idempotency keyed on submissionId+formActionId).
 *   - `dispatchAction` — an internalAction that executes one claimed run via the
 *     registry, with capped-backoff retry, and emits `form.action_completed` /
 *     `form.action_failed` through the `emitActionEvent` internal-mutation
 *     wrapper (a Convex action ctx CANNOT call `emitEvent`; only a mutation
 *     ctx can — mirrors media/internals.ts:emitMediaEditedEvent).
 *
 * A mutation CANNOT `ctx.runAction`, which is exactly why the runner is split:
 * `runActions` (mutation) only schedules; `dispatchAction` (action) does I/O.
 *
 * The action-type registry is populated by side-effect imports of
 * `./actionTypes` (P1: webhook / lead_capture / email_marketing) and
 * `./commerce` (subscription). Importing them here guarantees both the CRUD
 * validator and the runner see a fully populated registry.
 *
 * Capability: form.manage_actions (`MANAGE_ACTIONS`) on every query and mutation.
 */

import {
  mutation,
  query,
  internalQuery,
  internalMutation,
  internalAction,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { FORM_EVENTS, SYSTEM } from "../../events/constants";
import { isPluginEnabled, requirePluginEnabled } from "../../helpers/plugins";
import type { Capability } from "../../types/capabilities";
import { evaluateConditionalLogic } from "./conditionalLogic";
import {
  getActionType,
  listActionTypes,
  type ActionResult,
} from "./actionRegistry";
// Side-effect imports: populate the action-type registry. Both the CRUD
// validator and the runner depend on these having run at module load.
import "./actionTypes";
// Also registers the commerce action types (module side effect).
import { SIGN_IN_REQUIRED_ERROR, subscriptionConfigSchema } from "./commerce";
import { normalizeFormReturnUrl } from "./redirects";
import { formRequiresAccountToSubmit, formRequiresLogin, parseFormSettings } from "./builderCore";
import { choiceOptions } from "./planLinks";
import { settingsRecord } from "../../helpers/settingsReader";
import { getCurrentUser } from "../../helpers/auth";

import { formsExtensionDocs } from "./schema.docs.generated";
import { ALREADY_SUBSCRIBED_MESSAGE } from "../../commerceSubscriptions/ownership";
import { addBillingPeriod, addDays } from "../../commerceSubscriptions/lifecycle";
import { snapshotNumber, snapshotString } from "../../commerceSubscriptions/snapshot";
// ─── Local helpers ───────────────────────────────────────────────────────────

/** The capability every action screen and mutation requires. */
const MANAGE_ACTIONS: Capability = "form.manage_actions";

const runStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("awaiting_payment"),
);

/** Capped exponential backoff with jitter (ms). Attempt is 1-based. */
const MAX_ATTEMPTS = 4;
function backoffMs(attempt: number): number {
  const base = Math.min(30_000 * 2 ** (attempt - 1), 600_000);
  return base + Math.floor(Math.random() * 5_000);
}

/** Parse a config string; throw a typed ConvexError on malformed JSON. */
function parseConfigOrThrow(config: string): unknown {
  try {
    return JSON.parse(config);
  } catch {
    throw new ConvexError({
      code: "INVALID_CONFIG",
      message: "Action config must be valid JSON.",
    });
  }
}

/**
 * Validate a config string against a registered action type. Throws a typed
 * ConvexError when the type is unknown or the config fails validation.
 */
function validateConfigOrThrow(type: string, config: string): void {
  const def = getActionType(type);
  if (!def) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: `Unknown action type "${type}".`,
    });
  }
  const parsed = parseConfigOrThrow(config);
  const result = def.validateConfig(parsed);
  if (!result.valid) {
    throw new ConvexError({
      code: "INVALID_CONFIG",
      message: result.error,
    });
  }
}

/**
 * A checkout action must name things that exist for this form: plans that
 * exist and aren't archived, and plan, email and coupon fields that are on the
 * form. Checked on save, so a broken action is refused in the editor instead
 * of failing at a customer's checkout.
 */
async function assertCheckoutActionFits(
  ctx: MutationCtx,
  formId: Id<"forms">,
  type: string,
  configJson: string,
): Promise<void> {
  if (!CHECKOUT_ACTION_TYPES.has(type)) return;
  const parsed = subscriptionConfigSchema.safeParse(parseConfigOrThrow(configJson));
  if (!parsed.success) return; // validateConfigOrThrow has already refused it
  const config = parsed.data;
  const refuse = (message: string): never => {
    throw new ConvexError({ code: "INVALID_CONFIG", message });
  };

  const form = await ctx.db.get(formId);
  const groupId = form?.fieldGroupId;
  const fieldKeys = new Set(
    groupId
      ? (
          await ctx.db
            .query("fieldDefinitions")
            .withIndex("by_group", (q) => q.eq("groupId", groupId))
            .collect()
        ).map((field) => field.key)
      : [],
  );
  const usableOffer = async (raw: string | undefined) => {
    const offerId = raw ? ctx.db.normalizeId("commerce_subscription_offers", raw) : null;
    const offer = offerId ? await ctx.db.get(offerId) : null;
    return offer !== null && offer.status !== "archived";
  };

  if (config.offerMode === "fixed") {
    if (!(await usableOffer(config.offerId))) refuse("Choose a plan that exists and isn't archived.");
  } else {
    if (!config.offerFieldName || !fieldKeys.has(config.offerFieldName)) refuse("The plan field isn't on this form.");
    for (const [choice, offerId] of Object.entries(config.offerFieldMap ?? {})) {
      if (!(await usableOffer(offerId))) refuse(`The choice "${choice}" leads to a plan that doesn't exist or is archived.`);
    }
  }
  if (config.emailFieldName && !fieldKeys.has(config.emailFieldName)) refuse("The email field isn't on this form.");
  if (config.couponMode === "fromField" && config.couponFieldName && !fieldKeys.has(config.couponFieldName)) {
    refuse("The coupon field isn't on this form.");
  }
}

// ─── Admin queries (gated) ───────────────────────────────────────────────────

/** All action types available to the editor's type picker. */
export const availableActionTypes = query({
  args: {},
  returns: v.array(v.object({ type: v.string(), label: v.string() })),
  handler: async (ctx) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");
    return listActionTypes().map((d) => ({ type: d.type, label: d.label }));
  },
});

const actionSetupFieldValidator = v.object({
  _id: v.id("fieldDefinitions"),
  key: v.string(),
  name: v.string(),
  label: v.string(),
  type: v.string(),
  choices: v.array(v.object({ value: v.string(), label: v.string() })),
});

/**
 * What the action editor offers to choose from, for one form: its fields (with
 * the choices of choice fields, for the plan mapping), the subscription offers
 * a form can sell (with their prices), and how the form handles accounts.
 */
export const actionEditorSetup = query({
  args: { formId: v.id("forms") },
  returns: v.union(
    v.null(),
    v.object({
      account: v.union(v.literal("none"), v.literal("at_end"), v.literal("required")),
      fields: v.array(actionSetupFieldValidator),
      offers: v.array(
        v.object({
          _id: v.id("commerce_subscription_offers"),
          title: v.string(),
          status: v.string(),
          availableInDirectForms: v.boolean(),
          currencyCode: v.string(),
          recurringAmount: v.number(),
          setupFeeAmount: v.number(),
          billingInterval: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year")),
          billingIntervalCount: v.number(),
          trialDays: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { formId }) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");
    const form = await ctx.db.get(formId);
    if (!form) return null;

    const settings = parseFormSettings(form.settings);
    const account: "none" | "at_end" | "required" = formRequiresLogin(settings)
      ? "required"
      : formRequiresAccountToSubmit(settings)
        ? "at_end"
        : "none";

    const groupId = form.fieldGroupId;
    const definitions = groupId
      ? await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q) => q.eq("groupId", groupId))
          .collect()
      : [];
    const fields = definitions
      .sort((a, b) => a.menuOrder - b.menuOrder)
      .map((field) => ({
        _id: field._id,
        key: field.key,
        name: field.name,
        label: field.label,
        type: field.type,
        choices: choiceOptions(field.settings ?? ""),
      }));

    const offers = [];
    if (await isPluginEnabled(ctx, "commerceSubscriptions")) {
      for (const offer of await ctx.db.query("commerce_subscription_offers").collect()) {
        if (offer.status === "archived") continue;
        const template = await ctx.db.get(offer.templateId);
        if (!template) continue;
        offers.push({
          _id: offer._id,
          title: offer.title,
          status: offer.status,
          availableInDirectForms: offer.availableInDirectForms,
          currencyCode: offer.currencyCode,
          recurringAmount: offer.recurringAmount,
          setupFeeAmount: offer.setupFeeAmount ?? 0,
          billingInterval: template.billingInterval,
          billingIntervalCount: template.billingIntervalCount,
          trialDays: offer.trialDaysOverride ?? template.trialDays ?? 0,
        });
      }
    }
    offers.sort((a, b) => a.recurringAmount - b.recurringAmount || a.title.localeCompare(b.title));
    return { account, fields, offers };
  },
});

/** Ordered actions for a form (ascending `order`). */
export const listActions = query({
  args: { formId: v.id("forms") },
  returns: v.array(formsExtensionDocs.form_actions),
  handler: async (ctx, { formId }) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");
    return await ctx.db
      .query("form_actions")
      .withIndex("by_form_order", (q) => q.eq("formId", formId))
      .collect();
  },
});

/** Run history for one submission. */
export const listRunsForSubmission = query({
  args: { submissionId: v.id("form_submissions") },
  returns: v.array(formsExtensionDocs.form_action_runs),
  handler: async (ctx, { submissionId }) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");
    return await ctx.db
      .query("form_action_runs")
      .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
      .order("desc")
      .collect();
  },
});

/** The action types that start a checkout (see `commerce.ts`). */
const CHECKOUT_ACTION_TYPES = new Set(["subscription", "payment"]);

/**
 * Whether the caller may read a submission's checkout state. A submission made
 * signed-in is readable only by that account; a signed-out submission is
 * addressed by its unguessable id, known only to the submitter's client.
 */
async function callerOwnsSubmissionCheckout(
  ctx: QueryCtx,
  submission: Doc<"form_submissions">,
): Promise<boolean> {
  if (!submission.userId) return true;
  const user = await getCurrentUser(ctx);
  return user !== null && user._id === submission.userId;
}

const checkoutSummaryValidator = v.object({
  planTitle: v.string(),
  billingInterval: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year")),
  billingIntervalCount: v.number(),
  recurringAmount: v.number(),
  setupFeeAmount: v.number(),
  trialDays: v.number(),
  couponCode: v.optional(v.string()),
  /** Taken off the first charge. */
  firstChargeDiscount: v.number(),
  /** When the next charge after today's runs (the end of the trial or the first period). */
  nextChargeAt: v.number(),
});

/** The plan, its terms and the coupon of a checkout intent, from its pricing snapshot. */
export async function checkoutSummary(ctx: QueryCtx, rawIntentId: string) {
  const intentId = ctx.db.normalizeId("commerce_subscription_checkout_intents", rawIntentId);
  const intent = intentId ? await ctx.db.get(intentId) : null;
  if (!intent) return null;
  const snapshot = intent.pricingSnapshot;
  const offerId = intent.selectedOfferIds[0];
  const offer = offerId ? await ctx.db.get(offerId) : null;
  const template = offer ? await ctx.db.get(offer.templateId) : null;
  const interval = template?.billingInterval ?? "month";
  const count = template?.billingIntervalCount ?? 1;
  const trialDays = snapshotNumber(snapshot, "trialDays") ?? 0;
  return {
    planTitle: snapshotString(snapshot, "offerTitle") ?? offer?.title ?? "Subscription",
    billingInterval: interval,
    billingIntervalCount: count,
    recurringAmount: intent.recurringAmount,
    setupFeeAmount: intent.setupFeeAmount,
    trialDays,
    couponCode: snapshotString(snapshot, "couponCode"),
    firstChargeDiscount: snapshotNumber(snapshot, "firstChargeDiscount") ?? 0,
    nextChargeAt: trialDays > 0 ? addDays(intent.createdAt, trialDays) : addBillingPeriod(intent.createdAt, interval, count),
  };
}

/**
 * PUBLIC: the pending-payment descriptor for a submission, if any. Returns the
 * `needsPayment` data stored on an `awaiting_payment` commerce run so the
 * Website renderer can mount Stripe Elements after submit (the commerce action
 * runs async, so the descriptor is not in the submit() return value). The
 * submissionId is an unguessable Convex id known only to the submitter's
 * client, and a submission made signed-in is readable only by that account.
 * The descriptor exposes only the single-use clientSecret + the PUBLISHABLE
 * key — never a secret key. Returns null when no payment is pending.
 */
export const getPendingPayment = query({
  args: { submissionId: v.id("form_submissions") },
  returns: v.union(v.null(), v.object({
    runId: v.id("form_action_runs"),
    formActionId: v.id("form_actions"),
    intentId: v.union(v.null(), v.string()),
    clientSecret: v.union(v.null(), v.string()),
    publishableKey: v.union(v.null(), v.string()),
    mode: v.union(v.literal("payment"), v.literal("setup")),
    amount: v.number(),
    recurringAmount: v.number(),
    currency: v.string(),
    accountPolicy: v.string(),
    returnUrl: v.optional(v.string()),
    /** What the customer is buying, for the order summary beside the card form. */
    summary: v.union(v.null(), checkoutSummaryValidator),
  })),
  handler: async (ctx, { submissionId }) => {
    if (!(await isPluginEnabled(ctx, "forms"))) return null;
    const submission = await ctx.db.get(submissionId);
    if (!submission || !(await callerOwnsSubmissionCheckout(ctx, submission))) {
      return null;
    }

    const runs = await ctx.db
      .query("form_action_runs")
      .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
      .order("desc")
      .collect();
    for (const run of runs) {
      if (run.status !== "awaiting_payment" || !run.result) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(run.result);
      } catch {
        continue; // skip malformed
      }
      if (!parsed || typeof parsed !== "object" || Reflect.get(parsed, "needsPayment") !== true) continue;
      // The stored run result is untyped JSON: read each field by its runtime type.
      const field = (key: string): unknown => Reflect.get(parsed, key);
      const text = (value: unknown) => (typeof value === "string" && value ? value : null);
      const amount = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
      const intentId = text(field("intentId"));
      return {
        runId: run._id,
        formActionId: run.formActionId,
        intentId,
        clientSecret: text(field("clientSecret")),
        publishableKey: text(field("publishableKey")),
        mode: field("mode") === "setup" ? "setup" as const : "payment" as const,
        amount: amount(field("amount")),
        recurringAmount: amount(field("recurringAmount")),
        currency: text(field("currency")) ?? "USD",
        accountPolicy: text(field("accountPolicy")) ?? "require_existing",
        returnUrl: normalizeFormReturnUrl(text(field("returnUrl")) ?? undefined),
        summary: intentId ? await checkoutSummary(ctx, intentId) : null,
      };
    }
    return null;
  },
});

/**
 * PUBLIC: where a submission's checkout stands, so the Website can decide what
 * to show after submit without guessing from timing:
 *
 *   - `none`             — the form starts no checkout (or the submission is
 *                          not complete).
 *   - `preparing`        — a checkout action is queued or running.
 *   - `awaiting_payment` — the card step is ready (`getPendingPayment`).
 *   - `completed`        — every checkout action finished; `paid` when one was
 *                          a paid checkout that has been activated.
 *   - `failed`           — a checkout action failed; `sign_in_required` when the
 *                          form needs a signed-in submitter, or when the
 *                          caller is not the account that submitted;
 *                          `already_subscribed` when the buyer already holds a
 *                          one-per-customer offer's access.
 *
 * Same access rule as `getPendingPayment`. Exposes no amounts or secrets.
 */
export const getCheckoutStatus = query({
  args: { submissionId: v.id("form_submissions") },
  returns: v.union(
    v.object({ state: v.literal("none") }),
    v.object({ state: v.literal("preparing") }),
    v.object({ state: v.literal("awaiting_payment") }),
    v.object({ state: v.literal("completed"), paid: v.boolean() }),
    v.object({
      state: v.literal("failed"),
      reason: v.union(v.literal("sign_in_required"), v.literal("already_subscribed"), v.literal("unavailable")),
    }),
  ),
  handler: async (ctx, { submissionId }) => {
    const none = { state: "none" as const };
    if (!(await isPluginEnabled(ctx, "forms"))) return none;
    const submission = await ctx.db.get(submissionId);
    if (!submission || submission.status !== "complete") return none;

    const actions = await ctx.db
      .query("form_actions")
      .withIndex("by_form_enabled", (q) =>
        q.eq("formId", submission.formId).eq("enabled", true),
      )
      .collect();
    const checkoutActions = actions.filter((action) => CHECKOUT_ACTION_TYPES.has(action.type));
    if (checkoutActions.length === 0) return none;
    // A checkout started signed-in continues only for that account.
    if (!(await callerOwnsSubmissionCheckout(ctx, submission))) {
      return { state: "failed" as const, reason: "sign_in_required" as const };
    }

    let preparing = false;
    let awaitingPayment = false;
    let paid = false;
    for (const action of checkoutActions) {
      const run = await ctx.db
        .query("form_action_runs")
        .withIndex("by_submission_action", (q) =>
          q.eq("submissionId", submissionId).eq("formActionId", action._id),
        )
        .first();
      if (!run || run.status === "pending") {
        preparing = true;
      } else if (run.status === "awaiting_payment") {
        awaitingPayment = true;
      } else if (run.status === "failed") {
        return {
          state: "failed" as const,
          reason:
            run.error === SIGN_IN_REQUIRED_ERROR
              ? ("sign_in_required" as const)
              : run.error === ALREADY_SUBSCRIBED_MESSAGE
                ? ("already_subscribed" as const)
                : ("unavailable" as const),
        };
      } else if (runResultPaid(run.result)) {
        paid = true;
      }
    }
    if (awaitingPayment) return { state: "awaiting_payment" as const };
    if (preparing) return { state: "preparing" as const };
    return { state: "completed" as const, paid };
  },
});

/** Whether a completed checkout run recorded a paid activation. */
function runResultPaid(result: string | undefined): boolean {
  if (!result) return false;
  try {
    const parsed: unknown = JSON.parse(result);
    return typeof parsed === "object" && parsed !== null && "paid" in parsed && parsed.paid === true;
  } catch {
    return false;
  }
}

/** Recent run history for a form (optionally filtered by status). */
export const listRecentRuns = query({
  args: {
    formId: v.id("forms"),
    status: v.optional(runStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(formsExtensionDocs.form_action_runs),
  handler: async (ctx, { formId, status, limit }) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");
    const take = Math.min(limit ?? 50, 200);
    if (status) {
      return await ctx.db
        .query("form_action_runs")
        .withIndex("by_form_status", (q) =>
          q.eq("formId", formId).eq("status", status),
        )
        .order("desc")
        .take(take);
    }
    return await ctx.db
      .query("form_action_runs")
      .withIndex("by_form_status", (q) => q.eq("formId", formId))
      .order("desc")
      .take(take);
  },
});

// ─── Config mutations (all gated) ────────────────────────────────────────────

export const createAction = mutation({
  args: {
    formId: v.id("forms"),
    type: v.string(),
    label: v.string(),
    config: v.string(),
    conditionalLogic: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), formsExtensionDocs.form_actions),
  handler: async (ctx, args) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");

    const label = args.label.trim();
    if (!label) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Action label cannot be empty.",
      });
    }
    validateConfigOrThrow(args.type, args.config);
    await assertCheckoutActionFits(ctx, args.formId, args.type, args.config);
    if (args.conditionalLogic !== undefined) {
      try {
        JSON.parse(args.conditionalLogic);
      } catch {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Conditional logic must be valid JSON.",
        });
      }
    }

    // order = max(existing) + 1 (append to the end).
    const siblings = await ctx.db
      .query("form_actions")
      .withIndex("by_form_order", (q) => q.eq("formId", args.formId))
      .collect();
    const maxOrder = siblings.reduce((m, r) => Math.max(m, r.order), -1);

    const actionId = await ctx.db.insert("form_actions", {
      formId: args.formId,
      type: args.type,
      label,
      config: args.config,
      conditionalLogic: args.conditionalLogic,
      enabled: args.enabled ?? true,
      order: maxOrder + 1,
    });
    return await ctx.db.get(actionId);
  },
});

export const updateAction = mutation({
  args: {
    actionId: v.id("form_actions"),
    label: v.optional(v.string()),
    config: v.optional(v.string()),
    /** A JSON rule set; null removes the condition so the action always runs. */
    conditionalLogic: v.optional(v.union(v.string(), v.null())),
    enabled: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), formsExtensionDocs.form_actions),
  handler: async (ctx, args) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");

    const action = await ctx.db.get(args.actionId);
    if (!action) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Action not found." });
    }

    const patch: Partial<Doc<"form_actions">> = {};
    if (args.label !== undefined) {
      const label = args.label.trim();
      if (!label) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Action label cannot be empty.",
        });
      }
      patch.label = label;
    }
    if (args.config !== undefined) {
      validateConfigOrThrow(action.type, args.config);
      await assertCheckoutActionFits(ctx, action.formId, action.type, args.config);
      patch.config = args.config;
    }
    if (args.conditionalLogic === null) {
      patch.conditionalLogic = undefined;
    } else if (args.conditionalLogic !== undefined) {
      try {
        JSON.parse(args.conditionalLogic);
      } catch {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Conditional logic must be valid JSON.",
        });
      }
      patch.conditionalLogic = args.conditionalLogic;
    }
    if (args.enabled !== undefined) {
      patch.enabled = args.enabled;
    }

    if (Object.keys(patch).length === 0) return action;
    await ctx.db.patch("form_actions", args.actionId, patch);
    return await ctx.db.get(args.actionId);
  },
});

export const reorderActions = mutation({
  args: {
    formId: v.id("forms"),
    orderedIds: v.array(v.id("form_actions")),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, { formId, orderedIds }) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");
    for (const [order, actionId] of orderedIds.entries()) {
      const row = await ctx.db.get(actionId);
      // Only reorder rows that belong to this form (defensive).
      if (row && row.formId === formId && row.order !== order) {
        await ctx.db.patch("form_actions", actionId, { order });
      }
    }
    return { success: true };
  },
});

export const deleteAction = mutation({
  args: { actionId: v.id("form_actions") },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, { actionId }) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");
    const action = await ctx.db.get(actionId);
    if (!action) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Action not found." });
    }
    // Delete the config row only; run history (form_action_runs) is retained.
    await ctx.db.delete("form_actions", actionId);
    return { success: true };
  },
});

/**
 * Replay a run: re-enqueue a non-completed run. No-op for `completed` (the
 * idempotency guarantee). Resets attempts so the backoff ladder restarts.
 */
export const replayRun = mutation({
  args: { runId: v.id("form_action_runs") },
  returns: v.object({ replayed: v.boolean() }),
  handler: async (ctx, { runId }) => {
    await requireCan(ctx, MANAGE_ACTIONS);
    await requirePluginEnabled(ctx, "forms");
    const run = await ctx.db.get(runId);
    if (!run) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Run not found." });
    }
    if (run.status === "completed") {
      // Terminal success (including skipped-as-completed) — never re-fire.
      return { replayed: false };
    }
    const now = Date.now();
    await ctx.db.patch("form_action_runs", runId, {
      status: "pending",
      attempts: 0,
      error: undefined,
      nextAttemptAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.extensions.forms.actions.dispatchAction,
      { runId },
    );
    return { replayed: true };
  },
});

// ─── Internal helpers used by the runner ─────────────────────────────────────

/** Re-read the committed answer map (`fieldKey -> value`) for a submission. */
async function readSubmissionValues(
  ctx: { db: QueryCtx["db"] },
  submissionId: Id<"form_submissions">,
): Promise<Record<string, string>> {
  const rows = await ctx.db
    .query("fieldValues")
    .withIndex("by_entity", (q) =>
      q
        .eq("entityType", "form_submission")
        .eq("entityId", submissionId),
    )
    .collect();
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.fieldKey] = row.value;
  }
  return map;
}

/** internalQuery wrapper so the Node action can read the value map. */
export const getSubmissionValues = internalQuery({
  args: { submissionId: v.id("form_submissions") },
  returns: v.record(v.string(), v.string()),
  handler: async (ctx, { submissionId }) => {
    return await readSubmissionValues(ctx, submissionId);
  },
});

/** internalQuery: re-read an action mid-flight (enabled/config may have changed). */
export const getActionInternal = internalQuery({
  args: { actionId: v.id("form_actions") },
  returns: v.union(v.null(), formsExtensionDocs.form_actions),
  handler: async (ctx, { actionId }) => {
    return await ctx.db.get(actionId);
  },
});

/** internalQuery: read a run row. */
export const getRun = internalQuery({
  args: { runId: v.id("form_action_runs") },
  returns: v.union(v.null(), formsExtensionDocs.form_action_runs),
  handler: async (ctx, { runId }) => {
    return await ctx.db.get(runId);
  },
});

/** internalMutation: bump the attempt counter for a run. */
export const markAttempt = internalMutation({
  args: { runId: v.id("form_action_runs"), attempts: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, attempts }) => {
    await ctx.db.patch("form_action_runs", runId, { attempts, updatedAt: Date.now() });
  },
});

/** internalMutation: schedule a retry (status back to pending). */
export const scheduleRetry = internalMutation({
  args: {
    runId: v.id("form_action_runs"),
    error: v.optional(v.string()),
    nextAttemptAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, error, nextAttemptAt }) => {
    await ctx.db.patch("form_action_runs", runId, {
      status: "pending",
      error,
      nextAttemptAt,
      updatedAt: Date.now(),
    });
  },
});

/** internalMutation: finalize a run to a terminal/non-terminal status. */
export const finalizeRun = internalMutation({
  args: {
    runId: v.id("form_action_runs"),
    status: runStatusValidator,
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, status, result, error }) => {
    await ctx.db.patch("form_action_runs", runId, {
      status,
      result,
      error,
      updatedAt: Date.now(),
    });
  },
});

/**
 * internalMutation event wrapper. A Convex ACTION ctx cannot call `emitEvent`
 * (it needs a MutationCtx); a mutation can. The runner action calls this via
 * `ctx.runMutation(...)` to emit terminal action events. Lazily imports the
 * event helpers to avoid load-order coupling (mirrors media/internals.ts).
 */
export const emitActionEvent = internalMutation({
  args: {
    kind: v.union(v.literal("completed"), v.literal("failed")),
    formId: v.id("forms"),
    submissionId: v.id("form_submissions"),
    formActionId: v.id("form_actions"),
    actionType: v.string(),
    error: v.optional(v.string()),
    result: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
        const code =
      args.kind === "completed"
        ? FORM_EVENTS.ACTION_COMPLETED
        : FORM_EVENTS.ACTION_FAILED;
    await emitEvent(ctx, code, SYSTEM.FORMS, {
      formId: args.formId,
      submissionId: args.submissionId,
      formActionId: args.formActionId,
      actionType: args.actionType,
      error: args.error,
      result: args.result,
    });
  },
});

// ─── runActions (internalMutation — subscribed to form.submitted) ────────────

/**
 * Event handler for `form.submitted`. The dispatcher invokes every handler with
 * `{ eventId }` ONLY, so we load the event + parse its payload ourselves, re-read
 * the committed answers (the form.submitted payload omits values), evaluate each
 * enabled action's conditional logic, and enqueue ONE isolated dispatch job per
 * action. Idempotency: a prior `completed` run for (submission, action) skips
 * re-firing; otherwise we reuse a pending/failed row or insert a fresh one.
 *
 * This is a MUTATION (it only reads + schedules). A mutation cannot `runAction`,
 * so the actual execution happens in the scheduled `dispatchAction` internalAction.
 */
export const runActions = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    if (!(await isPluginEnabled(ctx, "forms"))) return;

    const event = await ctx.db.get(eventId);
    if (!event) return;

    let payload: Record<string, unknown>;
    try {
      payload = settingsRecord(JSON.parse(event.payload));
    } catch {
      return;
    }

    const formId = typeof payload.formId === "string" ? ctx.db.normalizeId("forms", payload.formId) : null;
    const submissionId =
      typeof payload.submissionId === "string" ? ctx.db.normalizeId("form_submissions", payload.submissionId) : null;
    const isComplete = payload.isComplete === true;
    if (!formId || !submissionId) return;
    // Only completed submissions run actions; partial saves are skipped.
    if (!isComplete) return;

    // Re-read the committed answers (used for conditional gating + run()).
    const valueMap = await readSubmissionValues(ctx, submissionId);

    // Enabled actions for this form, ordered.
    const enabled = await ctx.db
      .query("form_actions")
      .withIndex("by_form_enabled", (q) =>
        q.eq("formId", formId).eq("enabled", true),
      )
      .collect();
    enabled.sort((a, b) => a.order - b.order);

    const now = Date.now();
    for (const action of enabled) {
      // Idempotency: look up an existing run for (submission, action).
      const existing = await ctx.db
        .query("form_action_runs")
        .withIndex("by_submission_action", (q) =>
          q.eq("submissionId", submissionId).eq("formActionId", action._id),
        )
        .first();
      if (existing && existing.status === "completed") {
        // Already terminal (including skipped-as-completed) — never re-fire.
        continue;
      }

      // Conditional gating (string-in, fail-open). Undefined ⇒ always run.
      const shouldRun = evaluateConditionalLogic(
        action.conditionalLogic,
        valueMap,
      );
      if (!shouldRun) {
        if (!existing) {
          // Record a terminal skipped run (tagged in result JSON).
          await ctx.db.insert("form_action_runs", {
            submissionId,
            formActionId: action._id,
            type: action.type,
            status: "completed",
            attempts: 0,
            result: JSON.stringify({ skipped: true }),
            formId,
            createdAt: now,
            updatedAt: now,
          });
        }
        continue;
      }

      // Claim: reuse a prior pending/failed/awaiting_payment row, else insert.
      let runId: Id<"form_action_runs">;
      if (existing) {
        await ctx.db.patch("form_action_runs", existing._id, {
          status: "pending",
          nextAttemptAt: now,
          updatedAt: now,
        });
        runId = existing._id;
      } else {
        runId = await ctx.db.insert("form_action_runs", {
          submissionId,
          formActionId: action._id,
          type: action.type,
          status: "pending",
          attempts: 0,
          formId,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Per-action isolation: one scheduled dispatch job each.
      await ctx.scheduler.runAfter(
        0,
        internal.extensions.forms.actions.dispatchAction,
        { runId },
      );
    }
  },
});

// ─── dispatchAction (internalAction — executes one run) ──────────────────────

/**
 * Execute one claimed run through the action registry, with capped-backoff
 * retry. Emits a terminal `form.action_completed` / `form.action_failed` event
 * via the `emitActionEvent` mutation wrapper (an action ctx cannot emitEvent).
 * The non-terminal `awaiting_payment` outcome (Commerce paid path) is recorded
 * WITHOUT retry and WITHOUT a failed event.
 */
export const dispatchAction = internalAction({
  args: { runId: v.id("form_action_runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    if (!(await isPluginEnabled(ctx, "forms"))) return;

    const run = await ctx.runQuery(
      internal.extensions.forms.actions.getRun,
      { runId },
    );
    if (!run) return;
    // Completed (incl. skipped-as-completed) → nothing to do.
    if (run.status === "completed") return;

    // Re-read the action; if removed/disabled, leave the run non-completed.
    const action = await ctx.runQuery(
      internal.extensions.forms.actions.getActionInternal,
      { actionId: run.formActionId },
    );
    if (!action || !action.enabled) return;

    const def = getActionType(run.type);
    if (!def) {
      await ctx.runMutation(internal.extensions.forms.actions.finalizeRun, {
        runId,
        status: "failed",
        error: `Unknown action type "${run.type}".`,
      });
      if (run.formId) {
        await ctx.runMutation(
          internal.extensions.forms.actions.emitActionEvent,
          {
            kind: "failed",
            formId: run.formId,
            submissionId: run.submissionId,
            formActionId: run.formActionId,
            actionType: run.type,
            error: `Unknown action type "${run.type}".`,
          },
        );
      }
      return;
    }

    const attempt = run.attempts + 1;
    await ctx.runMutation(internal.extensions.forms.actions.markAttempt, {
      runId,
      attempts: attempt,
    });

    // Re-read values (server-trusted committed answers).
    const values = await ctx.runQuery(
      internal.extensions.forms.actions.getSubmissionValues,
      { submissionId: run.submissionId },
    );

    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(action.config);
    } catch {
      await ctx.runMutation(internal.extensions.forms.actions.finalizeRun, {
        runId,
        status: "failed",
        error: "Action config is not valid JSON.",
      });
      if (run.formId) {
        await ctx.runMutation(
          internal.extensions.forms.actions.emitActionEvent,
          {
            kind: "failed",
            formId: run.formId,
            submissionId: run.submissionId,
            formActionId: run.formActionId,
            actionType: run.type,
            error: "Action config is not valid JSON.",
          },
        );
      }
      return;
    }

    let result: ActionResult;
    try {
      result = await def.run(
        {
          ctx,
          formId: run.formId,
          submissionId: run.submissionId,
          values,
          attempt,
        },
        settingsRecord(parsedConfig),
      );
    } catch (err) {
      // A thrown error is transient by default (network/unknown).
      result = {
        ok: false,
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // ── Non-terminal awaiting_payment (Commerce paid path) ──────────────────
    if (result.awaitingPayment) {
      await ctx.runMutation(internal.extensions.forms.actions.finalizeRun, {
        runId,
        status: "awaiting_payment",
        result: result.data ? JSON.stringify(result.data) : undefined,
        error: undefined,
      });
      // No retry, no failed event — the verified activation (webhook or
    // confirmFirstCharge) completes this run later.
      return;
    }

    // ── Success ─────────────────────────────────────────────────────────────
    if (result.ok) {
      await ctx.runMutation(internal.extensions.forms.actions.finalizeRun, {
        runId,
        status: "completed",
        result: result.data ? JSON.stringify(result.data) : undefined,
        error: undefined,
      });
      if (run.formId) {
        await ctx.runMutation(
          internal.extensions.forms.actions.emitActionEvent,
          {
            kind: "completed",
            formId: run.formId,
            submissionId: run.submissionId,
            formActionId: run.formActionId,
            actionType: run.type,
            result: result.data,
          },
        );
      }
      return;
    }

    // ── Transient failure → retry with capped backoff ──────────────────────
    const retryable = result.retryable ?? true;
    if (retryable && attempt < MAX_ATTEMPTS) {
      const delay = backoffMs(attempt);
      await ctx.runMutation(internal.extensions.forms.actions.scheduleRetry, {
        runId,
        error: result.error,
        nextAttemptAt: Date.now() + delay,
      });
      await ctx.scheduler.runAfter(
        delay,
        internal.extensions.forms.actions.dispatchAction,
        { runId },
      );
      // No event on a non-terminal retry.
      return;
    }

    // ── Terminal failure ────────────────────────────────────────────────────
    await ctx.runMutation(internal.extensions.forms.actions.finalizeRun, {
      runId,
      status: "failed",
      error: result.error,
    });
    if (run.formId) {
      await ctx.runMutation(
        internal.extensions.forms.actions.emitActionEvent,
        {
          kind: "failed",
          formId: run.formId,
          submissionId: run.submissionId,
          formActionId: run.formActionId,
          actionType: run.type,
          error: result.error,
        },
      );
    }
  },
});
