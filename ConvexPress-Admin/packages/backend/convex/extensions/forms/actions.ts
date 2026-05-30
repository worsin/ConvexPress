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
 * SURFACED capability: form.manage_actions (registered by the Role expert).
 * The `form.*` caps are not yet in the closed `Capability` union, so we cast at
 * every requireCan call site via `formCap(...)`, exactly like mutations.ts.
 */

import {
  mutation,
  query,
  internalQuery,
  internalMutation,
  internalAction,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { requireCan } from "../../helpers/permissions";
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
import "./commerce";

// ─── Local helpers ───────────────────────────────────────────────────────────

/**
 * Cast a `form.*` capability string to `Capability`. See file header — these
 * are surfaced here but registered by the Role expert, so they aren't in the
 * union yet. Centralizing the cast keeps the intent explicit and greppable.
 */
function formCap(cap: string): Capability {
  return cap as Capability;
}

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

// ─── Admin queries (gated) ───────────────────────────────────────────────────

/** All action types available to the editor's type picker. */
export const availableActionTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, formCap("form.manage_actions"));
    return listActionTypes().map((d) => ({ type: d.type, label: d.label }));
  },
});

/** Ordered actions for a form (ascending `order`). */
export const listActions = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, { formId }) => {
    await requireCan(ctx, formCap("form.manage_actions"));
    return await ctx.db
      .query("form_actions")
      .withIndex("by_form_order", (q) => q.eq("formId", formId))
      .collect();
  },
});

/** Run history for one submission. */
export const listRunsForSubmission = query({
  args: { submissionId: v.id("form_submissions") },
  handler: async (ctx, { submissionId }) => {
    await requireCan(ctx, formCap("form.manage_actions"));
    return await ctx.db
      .query("form_action_runs")
      .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
      .order("desc")
      .collect();
  },
});

/**
 * PUBLIC: the pending-payment descriptor for a submission, if any. Returns the
 * `needsPayment` data stored on an `awaiting_payment` commerce run so the
 * Website renderer can mount Stripe Elements after submit (the commerce action
 * runs async, so the descriptor is not in the submit() return value). NO auth:
 * the submissionId is an unguessable Convex id known only to the submitter's
 * client, and the descriptor exposes only the single-use clientSecret + the
 * PUBLISHABLE key — never a secret key. Returns null when no payment is pending.
 */
export const getPendingPayment = query({
  args: { submissionId: v.id("form_submissions") },
  handler: async (ctx, { submissionId }) => {
    const runs = await ctx.db
      .query("form_action_runs")
      .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
      .order("desc")
      .collect();
    for (const run of runs) {
      if (run.status !== "awaiting_payment" || !run.result) continue;
      try {
        const data = JSON.parse(run.result) as Record<string, unknown>;
        if (data && data.needsPayment === true) {
          return {
            runId: run._id,
            formActionId: run.formActionId,
            intentId: data.intentId ?? null,
            clientSecret: data.clientSecret ?? null,
            publishableKey: data.publishableKey ?? null,
            mode: (data.mode as string) ?? "payment",
            amount: (data.amount as number) ?? 0,
            recurringAmount: (data.recurringAmount as number) ?? 0,
            currency: (data.currency as string) ?? "USD",
            accountPolicy: (data.accountPolicy as string) ?? "require_existing",
            returnUrl: (data.returnUrl as string | undefined) ?? undefined,
          };
        }
      } catch {
        // skip malformed
      }
    }
    return null;
  },
});

/** Recent run history for a form (optionally filtered by status). */
export const listRecentRuns = query({
  args: {
    formId: v.id("forms"),
    status: v.optional(runStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { formId, status, limit }) => {
    await requireCan(ctx, formCap("form.manage_actions"));
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
  handler: async (ctx, args) => {
    await requireCan(ctx, formCap("form.manage_actions"));

    const label = args.label.trim();
    if (!label) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Action label cannot be empty.",
      });
    }
    validateConfigOrThrow(args.type, args.config);
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
    conditionalLogic: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, formCap("form.manage_actions"));

    const action = await ctx.db.get(args.actionId);
    if (!action) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Action not found." });
    }

    const patch: Record<string, unknown> = {};
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
      patch.config = args.config;
    }
    if (args.conditionalLogic !== undefined) {
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
    await ctx.db.patch(args.actionId, patch);
    return await ctx.db.get(args.actionId);
  },
});

export const reorderActions = mutation({
  args: {
    formId: v.id("forms"),
    orderedIds: v.array(v.id("form_actions")),
  },
  handler: async (ctx, { formId, orderedIds }) => {
    await requireCan(ctx, formCap("form.manage_actions"));
    for (let i = 0; i < orderedIds.length; i++) {
      const row = await ctx.db.get(orderedIds[i]!);
      // Only reorder rows that belong to this form (defensive).
      if (row && row.formId === formId && row.order !== i) {
        await ctx.db.patch(orderedIds[i]!, { order: i });
      }
    }
    return { success: true };
  },
});

export const deleteAction = mutation({
  args: { actionId: v.id("form_actions") },
  handler: async (ctx, { actionId }) => {
    await requireCan(ctx, formCap("form.manage_actions"));
    const action = await ctx.db.get(actionId);
    if (!action) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Action not found." });
    }
    // Delete the config row only; run history (form_action_runs) is retained.
    await ctx.db.delete(actionId);
    return { success: true };
  },
});

/**
 * Replay a run: re-enqueue a non-completed run. No-op for `completed` (the
 * idempotency guarantee). Resets attempts so the backoff ladder restarts.
 */
export const replayRun = mutation({
  args: { runId: v.id("form_action_runs") },
  handler: async (ctx, { runId }) => {
    await requireCan(ctx, formCap("form.manage_actions"));
    const run = await ctx.db.get(runId);
    if (!run) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Run not found." });
    }
    if (run.status === "completed") {
      // Terminal success (including skipped-as-completed) — never re-fire.
      return { replayed: false };
    }
    const now = Date.now();
    await ctx.db.patch(runId, {
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
  ctx: { db: { query: any } },
  submissionId: Id<"form_submissions">,
): Promise<Record<string, string>> {
  const rows = await ctx.db
    .query("fieldValues")
    .withIndex("by_entity", (q: any) =>
      q
        .eq("entityType", "form_submission")
        .eq("entityId", submissionId as string),
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
  handler: async (ctx, { submissionId }) => {
    return await readSubmissionValues(ctx, submissionId);
  },
});

/** internalQuery: re-read an action mid-flight (enabled/config may have changed). */
export const getActionInternal = internalQuery({
  args: { actionId: v.id("form_actions") },
  handler: async (ctx, { actionId }) => {
    return await ctx.db.get(actionId);
  },
});

/** internalQuery: read a run row. */
export const getRun = internalQuery({
  args: { runId: v.id("form_action_runs") },
  handler: async (ctx, { runId }) => {
    return await ctx.db.get(runId);
  },
});

/** internalMutation: bump the attempt counter for a run. */
export const markAttempt = internalMutation({
  args: { runId: v.id("form_action_runs"), attempts: v.number() },
  handler: async (ctx, { runId, attempts }) => {
    await ctx.db.patch(runId, { attempts, updatedAt: Date.now() });
  },
});

/** internalMutation: schedule a retry (status back to pending). */
export const scheduleRetry = internalMutation({
  args: {
    runId: v.id("form_action_runs"),
    error: v.optional(v.string()),
    nextAttemptAt: v.number(),
  },
  handler: async (ctx, { runId, error, nextAttemptAt }) => {
    await ctx.db.patch(runId, {
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
  handler: async (ctx, { runId, status, result, error }) => {
    await ctx.db.patch(runId, {
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
  handler: async (ctx, args) => {
    const { emitEvent } = await import("../../helpers/events");
    const { FORM_EVENTS, SYSTEM } = await import("../../events/constants");
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
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(event.payload) as Record<string, unknown>;
    } catch {
      return;
    }

    const formId = payload.formId as Id<"forms"> | undefined;
    const submissionId = payload.submissionId as
      | Id<"form_submissions">
      | undefined;
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
        await ctx.db.patch(existing._id, {
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
  handler: async (ctx, { runId }) => {
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
          formId: String(run.formId ?? ""),
          submissionId: String(run.submissionId),
          values,
          attempt,
        },
        parsedConfig as Record<string, unknown>,
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
      // No retry, no failed event — the webhook settles this run later.
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
