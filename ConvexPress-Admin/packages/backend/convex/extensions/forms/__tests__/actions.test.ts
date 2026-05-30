/**
 * Form Actions & Feeds — registry + idempotency + config-validation tests.
 * Run: `bun test convex/extensions/forms/__tests__/actions.test.ts`
 *
 * These cover the Convex-FREE units the runner depends on:
 *   - the action-type registry (register / get / list / idempotent overwrite);
 *   - the P1 webhook config validator + body-template renderer (real exports);
 *   - the run-claim idempotency decision (re-declared locally, like the
 *     addBillingPeriod precedent, since it lives inside a Convex mutation);
 *   - the commerce `resolveInputs` offer/email/coupon resolution (re-declared
 *     locally — commerce.ts imports _generated/server and can't load under bun).
 *
 * `.toBe` / `.toEqual` only.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  registerActionType,
  getActionType,
  listActionTypes,
  __resetActionRegistryForTests,
  type ActionResult,
  type ActionRunContext,
} from "../actionRegistry";
import { webhookConfigSchema, renderBodyTemplate } from "../actionTypes";

// ─── Registry ────────────────────────────────────────────────────────────────

describe("action registry", () => {
  test("register + get round-trips a definition", () => {
    __resetActionRegistryForTests();
    const def = {
      type: "test_a",
      label: "Test A",
      validateConfig: () => ({ valid: true as const }),
      run: async (): Promise<ActionResult> => ({ ok: true }),
    };
    registerActionType(def);
    expect(getActionType("test_a")?.label).toBe("Test A");
  });

  test("get returns undefined for an unknown type", () => {
    __resetActionRegistryForTests();
    expect(getActionType("nope")).toBe(undefined);
  });

  test("re-register overwrites by type (HMR-safe)", () => {
    __resetActionRegistryForTests();
    registerActionType({
      type: "dup",
      label: "First",
      validateConfig: () => ({ valid: true as const }),
      run: async (): Promise<ActionResult> => ({ ok: true }),
    });
    registerActionType({
      type: "dup",
      label: "Second",
      validateConfig: () => ({ valid: true as const }),
      run: async (): Promise<ActionResult> => ({ ok: true }),
    });
    expect(getActionType("dup")?.label).toBe("Second");
    expect(listActionTypes().length).toBe(1);
  });

  test("listActionTypes preserves insertion order", () => {
    __resetActionRegistryForTests();
    registerActionType({
      type: "one",
      label: "One",
      validateConfig: () => ({ valid: true as const }),
      run: async (): Promise<ActionResult> => ({ ok: true }),
    });
    registerActionType({
      type: "two",
      label: "Two",
      validateConfig: () => ({ valid: true as const }),
      run: async (): Promise<ActionResult> => ({ ok: true }),
    });
    expect(listActionTypes().map((d) => d.type)).toEqual(["one", "two"]);
  });
});

// ─── Webhook config validation + body templating ─────────────────────────────

describe("webhook config", () => {
  test("accepts a valid https config", () => {
    const r = webhookConfigSchema.safeParse({ url: "https://example.com/h" });
    expect(r.success).toBe(true);
  });

  test("rejects an http (non-https) URL", () => {
    const r = webhookConfigSchema.safeParse({ url: "http://example.com/h" });
    expect(r.success).toBe(false);
  });

  test("rejects a non-URL", () => {
    const r = webhookConfigSchema.safeParse({ url: "not a url" });
    expect(r.success).toBe(false);
  });
});

describe("renderBodyTemplate", () => {
  test("absent template renders all values as JSON", () => {
    const out = renderBodyTemplate(undefined, { a: "1", b: "2" });
    expect(out).toEqual(JSON.stringify({ a: "1", b: "2" }));
  });

  test("substitutes {key} tokens; unknown tokens render empty", () => {
    const out = renderBodyTemplate('{"email":"{email}","x":"{missing}"}', {
      email: "a@b.co",
    });
    expect(out).toEqual('{"email":"a@b.co","x":""}');
  });
});

// ─── Run-claim idempotency (contract re-declared locally) ────────────────────
//
// The runner: a `completed` run (incl. skipped-as-completed) is NEVER re-fired;
// any other prior run (pending/failed/awaiting_payment) is re-claimed; absence
// of a prior run inserts a fresh one. This predicate is the decision the
// internalMutation makes per (submission, action).

type RunStatus = "pending" | "completed" | "failed" | "awaiting_payment";

function claimDecision(
  existing: { status: RunStatus } | null,
): "skip" | "reuse" | "insert" {
  if (existing && existing.status === "completed") return "skip";
  if (existing) return "reuse";
  return "insert";
}

describe("run-claim idempotency", () => {
  test("completed run is skipped (never re-fired)", () => {
    expect(claimDecision({ status: "completed" })).toBe("skip");
  });

  test("failed run is reused (re-claimed)", () => {
    expect(claimDecision({ status: "failed" })).toBe("reuse");
  });

  test("awaiting_payment run is reused (not re-inserted)", () => {
    expect(claimDecision({ status: "awaiting_payment" })).toBe("reuse");
  });

  test("no prior run inserts a fresh one", () => {
    expect(claimDecision(null)).toBe("insert");
  });
});

// ─── Commerce resolveInputs (contract re-declared locally) ───────────────────
//
// commerce.ts imports _generated/server, so it cannot load under bun:test. This
// re-declares the pure resolution the action performs, asserting the contract:
// fixed → offerId; fromField → map[value] ?? value; email trimmed; coupon by mode.

interface SubConfig {
  offerMode: "fixed" | "fromField";
  offerId?: string;
  offerFieldName?: string;
  offerFieldMap?: Record<string, string>;
  emailFieldName: string;
  couponMode?: "none" | "fixed" | "fromField";
  couponFieldName?: string;
  couponCode?: string;
}

function resolveInputs(config: SubConfig, values: Record<string, string>) {
  let offerId: string | undefined;
  if (config.offerMode === "fixed") {
    offerId = config.offerId;
  } else if (config.offerFieldName) {
    const raw = (values[config.offerFieldName] ?? "").trim();
    if (raw) {
      offerId =
        config.offerFieldMap && config.offerFieldMap[raw] !== undefined
          ? config.offerFieldMap[raw]
          : raw;
    }
  }
  const customerEmail =
    (values[config.emailFieldName] ?? "").trim() || undefined;
  let couponCode: string | undefined;
  const mode = config.couponMode ?? "none";
  if (mode === "fixed") {
    couponCode = config.couponCode?.trim() || undefined;
  } else if (mode === "fromField" && config.couponFieldName) {
    couponCode = (values[config.couponFieldName] ?? "").trim() || undefined;
  }
  return { offerId, customerEmail, couponCode };
}

describe("commerce resolveInputs", () => {
  test("fixed mode uses offerId directly", () => {
    const r = resolveInputs(
      { offerMode: "fixed", offerId: "offer_1", emailFieldName: "email" },
      { email: " a@b.co " },
    );
    expect(r.offerId).toBe("offer_1");
    expect(r.customerEmail).toBe("a@b.co");
  });

  test("fromField maps the option value to an offer id", () => {
    const r = resolveInputs(
      {
        offerMode: "fromField",
        offerFieldName: "plan",
        offerFieldMap: { gold: "offer_gold" },
        emailFieldName: "email",
      },
      { plan: "gold", email: "x@y.co" },
    );
    expect(r.offerId).toBe("offer_gold");
  });

  test("fromField falls back to the field value as the offer id", () => {
    const r = resolveInputs(
      { offerMode: "fromField", offerFieldName: "plan", emailFieldName: "email" },
      { plan: "offer_raw", email: "x@y.co" },
    );
    expect(r.offerId).toBe("offer_raw");
  });

  test("no resolvable offer yields undefined", () => {
    const r = resolveInputs(
      { offerMode: "fromField", offerFieldName: "plan", emailFieldName: "email" },
      { email: "x@y.co" },
    );
    expect(r.offerId).toBe(undefined);
  });

  test("coupon fixed mode trims the configured code", () => {
    const r = resolveInputs(
      {
        offerMode: "fixed",
        offerId: "o",
        emailFieldName: "email",
        couponMode: "fixed",
        couponCode: " SAVE10 ",
      },
      { email: "x@y.co" },
    );
    expect(r.couponCode).toBe("SAVE10");
  });

  test("coupon fromField reads the field value", () => {
    const r = resolveInputs(
      {
        offerMode: "fixed",
        offerId: "o",
        emailFieldName: "email",
        couponMode: "fromField",
        couponFieldName: "promo",
      },
      { email: "x@y.co", promo: "FALL" },
    );
    expect(r.couponCode).toBe("FALL");
  });

  test("coupon none yields undefined", () => {
    const r = resolveInputs(
      { offerMode: "fixed", offerId: "o", emailFieldName: "email" },
      { email: "x@y.co" },
    );
    expect(r.couponCode).toBe(undefined);
  });
});

// Mark ActionRunContext referenced (type-only import lint guard).
const _typeGuard: ActionRunContext | undefined = undefined;
void _typeGuard;
