/**
 * ConvexPress Forms — Action-Type Registry (Form Actions & Feeds System).
 *
 * The host contract every post-submit action type implements. An action type
 * is a `{ type, label, validateConfig, run }` definition registered once at
 * module load via `registerActionType`. The CRUD layer (`actions.ts`) uses
 * `getActionType` to validate a row's `config` before persisting; the runner
 * (`actionRunner.ts`) uses it to execute a claimed run inside an internalAction.
 *
 * NO Convex imports here — this module is a pure in-memory registry so the
 * action types (and their unit tests) can register/resolve without a Convex
 * context. The runner provides the `ActionRunContext` (action ctx + the trusted
 * committed submission) at call time.
 *
 * Idempotent re-register: registering the same `type` twice overwrites the
 * prior definition, so HMR / repeated side-effect imports are safe.
 */

/** The outcome an action's `run` returns. */
export interface ActionResult {
  /** Terminal success when true. */
  ok: boolean;
  /** Opaque success payload, persisted (JSON) on the run's `result`. */
  data?: Record<string, unknown>;
  /** Failure reason, persisted on the run's `error`. */
  error?: string;
  /**
   * On failure, whether the runner should retry (capped backoff) rather than
   * mark the run terminally `failed`. Absent ⇒ treated as retryable (transient)
   * by the runner, matching the framework default.
   */
  retryable?: boolean;
  /**
   * Non-terminal "pending external settlement" signal. When true the runner
   * records the run as `awaiting_payment` (NO retry, NO `form.action_failed`).
   * The Commerce subscription action returns this for the paid path, where the
   * Stripe webhook owns activation. `ok` is false and `error` carries the
   * sentinel ("AWAITING_PAYMENT") in that case.
   */
  awaitingPayment?: boolean;
}

/**
 * The trusted execution context handed to an action's `run`. `values` is the
 * COMMITTED submission's answer map (`fieldKey -> value`), re-read server-side
 * from `fieldValues` — never a fresh client payload. The Convex action ctx
 * (`runQuery`/`runMutation`/`runAction`/`scheduler`) is spread in so action
 * types that orchestrate other Convex functions (e.g. commerce) can call them.
 */
export interface ActionRunContext {
  /** Convex action ctx — runQuery / runMutation / runAction / scheduler / etc. */
  ctx: ActionConvexCtx;
  formId: string;
  submissionId: string;
  /** Committed answers, `fieldKey -> string value`. Server-trusted. */
  values: Record<string, string>;
  /** 1-based attempt number for this run. */
  attempt: number;
}

/**
 * The slice of a Convex `ActionCtx` the action types use. Kept structural (not
 * the generated `ActionCtx`) so this pure module never imports `_generated`.
 */
export interface ActionConvexCtx {
  runQuery: (reference: any, args?: any) => Promise<any>;
  runMutation: (reference: any, args?: any) => Promise<any>;
  runAction: (reference: any, args?: any) => Promise<any>;
}

/** Result of validating a raw (parsed) config object. */
export type ValidateConfigResult =
  | { valid: true }
  | { valid: false; error: string };

/** A registered post-submit action type. */
export interface ActionTypeDefinition<TConfig = Record<string, unknown>> {
  /** Stable key persisted on `form_actions.type` (e.g. "webhook"). */
  type: string;
  /** Human label for the admin type picker. */
  label: string;
  /**
   * Validate a parsed config object. Called by the CRUD layer before persist
   * and (defensively) by the runner. Must be pure + synchronous.
   */
  validateConfig(config: unknown): ValidateConfigResult;
  /**
   * Execute the action for one claimed run. `rawConfig` is the parsed config
   * (already JSON.parse'd from `form_actions.config`). Resolves to an
   * `ActionResult`. A thrown error is treated by the runner as a transient
   * failure (retryable) unless the type returns an explicit result.
   */
  run(ctx: ActionRunContext, rawConfig: TConfig): Promise<ActionResult>;
}

// ─── Module-level registry ───────────────────────────────────────────────────

const REGISTRY = new Map<string, ActionTypeDefinition>();

/**
 * Register (or overwrite) an action type. Overwrite-by-`type` keeps repeated
 * side-effect imports / HMR safe.
 */
export function registerActionType<TConfig = Record<string, unknown>>(
  def: ActionTypeDefinition<TConfig>,
): void {
  REGISTRY.set(def.type, def as unknown as ActionTypeDefinition);
}

/** Resolve a registered action type by key, or `undefined` if unknown. */
export function getActionType(
  type: string,
): ActionTypeDefinition | undefined {
  return REGISTRY.get(type);
}

/** All registered action types (insertion order). */
export function listActionTypes(): ActionTypeDefinition[] {
  return Array.from(REGISTRY.values());
}

/** Test-only: clear the registry. Not used by production code. */
export function __resetActionRegistryForTests(): void {
  REGISTRY.clear();
}
