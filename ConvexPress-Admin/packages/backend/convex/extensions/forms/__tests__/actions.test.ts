/**
 * Form Actions & Feeds — registry, run-status state machine, conditional
 * gating, commerce pricing→charge-shape mapping, and outbound-URL (SSRF) safety.
 * Run: `bun test convex/extensions/forms/__tests__/actions.test.ts`
 *
 * These cover the Convex-FREE / pure units the runner + action types depend on,
 * importing the REAL production exports wherever they load under bun:
 *   - actionRegistry.ts — register / get / list / overwrite / unknown lookup.
 *   - actionTypes.ts    — webhook config validator, body-template renderer, and
 *                         the `isSafeOutboundUrl` SSRF guard (real export).
 *   - conditionalLogic.ts — per-action conditional gating (real evaluator).
 *   - commerce.ts       — `resolveInputs` + `pricingToChargeShape` (real exports;
 *                         both load under bun:test).
 *   - the run-status state machine + run-claim idempotency are the decisions the
 *     runner internalMutation/internalAction make, re-declared locally as pure
 *     predicates (they live inside Convex functions that schedule/IO).
 *
 * Dialect: minimal bun:test — `.toBe` / `.toEqual` only; errors asserted via
 * try/catch flags (no `.toThrow`).
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
import {
  webhookConfigSchema,
  leadCaptureConfigSchema,
  emailMarketingConfigSchema,
  renderBodyTemplate,
  isSafeOutboundUrl,
  registerFirstPartyActionTypes,
} from "../actionTypes";
import { evaluateConditionalLogic } from "../conditionalLogic";
import {
  resolveInputs,
  pricingToChargeShape,
  subscriptionConfigSchema,
} from "../commerce";

// Snapshot the built-in registrations at MODULE-LOAD time (before any test body
// runs `__resetActionRegistryForTests`). The side-effect imports above register
// webhook / lead_capture / email_marketing / subscription / payment exactly
// once; capturing here proves that wiring independent of later registry resets.
const BUILTIN_TYPES_AT_LOAD = listActionTypes()
  .map((d) => d.type)
  .sort();

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

  test("the side-effect imports register the built-in types at load", () => {
    // Asserted against the module-load snapshot (later tests reset the live
    // registry, so we can't query it here). webhook / lead_capture /
    // email_marketing come from actionTypes; subscription / payment from commerce.
    for (const t of [
      "webhook",
      "lead_capture",
      "email_marketing",
      "subscription",
      "payment",
    ]) {
      expect(BUILTIN_TYPES_AT_LOAD.includes(t)).toBe(true);
    }
  });

  test("a registered type's validateConfig is reachable via the registry", () => {
    __resetActionRegistryForTests();
    registerActionType({
      type: "v",
      label: "V",
      validateConfig: (c: unknown) =>
        (c as { ok?: boolean })?.ok
          ? { valid: true as const }
          : { valid: false as const, error: "bad" },
      run: async (): Promise<ActionResult> => ({ ok: true }),
    });
    const def = getActionType("v");
    expect(def?.validateConfig({ ok: true })).toEqual({ valid: true });
    expect(def?.validateConfig({ ok: false })).toEqual({
      valid: false,
      error: "bad",
    });
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

// ─── SSRF guard: outbound URL safety (real `isSafeOutboundUrl` export) ────────
//
// SECURITY: the webhook URL + lead_capture / email_marketing endpoints are
// admin-configured but must NEVER be allowed to target the loopback interface,
// the cloud-metadata endpoint (169.254.169.254), or any RFC-1918 / link-local /
// unique-local address. The guard is enforced at config-validation time (a zod
// refine) AND re-checked right before each fetch (defense in depth).
//
// KNOWN LIMIT (documented, not a test gap): this is a literal-HOST check. It
// cannot block a *public* hostname whose DNS resolves to a private address
// (DNS-rebinding). Closing that needs pinned-DNS fetch / an egress proxy owned
// by the action runtime, which is out of this layer's scope.

describe("isSafeOutboundUrl (SSRF guard)", () => {
  test("allows a normal public https URL", () => {
    expect(isSafeOutboundUrl("https://hooks.example.com/abc")).toBe(true);
  });

  test("allows a public http URL (scheme is gated elsewhere for webhook)", () => {
    expect(isSafeOutboundUrl("http://api.example.com/x")).toBe(true);
  });

  test("blocks the cloud metadata IP 169.254.169.254", () => {
    expect(isSafeOutboundUrl("https://169.254.169.254/latest/meta-data/")).toBe(
      false,
    );
  });

  test("blocks localhost by name", () => {
    expect(isSafeOutboundUrl("https://localhost/x")).toBe(false);
  });

  test("blocks *.localhost and *.internal suffixes", () => {
    expect(isSafeOutboundUrl("https://foo.localhost/x")).toBe(false);
    expect(isSafeOutboundUrl("https://db.internal/x")).toBe(false);
  });

  test("blocks loopback 127.0.0.0/8", () => {
    expect(isSafeOutboundUrl("http://127.0.0.1:8080/x")).toBe(false);
    expect(isSafeOutboundUrl("http://127.5.5.5/x")).toBe(false);
  });

  test("blocks RFC-1918 ranges (10/8, 172.16/12, 192.168/16)", () => {
    expect(isSafeOutboundUrl("https://10.0.0.1/x")).toBe(false);
    expect(isSafeOutboundUrl("https://172.16.0.1/x")).toBe(false);
    expect(isSafeOutboundUrl("https://172.31.255.255/x")).toBe(false);
    expect(isSafeOutboundUrl("https://192.168.1.1/x")).toBe(false);
  });

  test("allows a public 172.x that is OUTSIDE 172.16/12", () => {
    expect(isSafeOutboundUrl("https://172.15.0.1/x")).toBe(true);
    expect(isSafeOutboundUrl("https://172.32.0.1/x")).toBe(true);
  });

  test("blocks 0.0.0.0/8 and CGNAT 100.64/10", () => {
    expect(isSafeOutboundUrl("http://0.0.0.0/x")).toBe(false);
    expect(isSafeOutboundUrl("https://100.64.0.1/x")).toBe(false);
  });

  test("blocks decimal/hex IPv4 that the URL parser normalizes to loopback", () => {
    // The WHATWG URL parser normalizes these to 127.0.0.1 before our check.
    expect(isSafeOutboundUrl("http://2130706433/x")).toBe(false);
    expect(isSafeOutboundUrl("http://0x7f000001/x")).toBe(false);
  });

  test("blocks IPv6 loopback and link/unique-local", () => {
    expect(isSafeOutboundUrl("https://[::1]/x")).toBe(false);
    expect(isSafeOutboundUrl("https://[fe80::1]/x")).toBe(false);
    expect(isSafeOutboundUrl("https://[fc00::1]/x")).toBe(false);
  });

  test("blocks IPv4-mapped IPv6 metadata (hex-compressed by the parser)", () => {
    // new URL() compresses ::ffff:169.254.169.254 → ::ffff:a9fe:a9fe.
    expect(isSafeOutboundUrl("https://[::ffff:169.254.169.254]/x")).toBe(false);
    expect(isSafeOutboundUrl("https://[::ffff:127.0.0.1]/x")).toBe(false);
  });

  test("rejects an unparseable URL", () => {
    expect(isSafeOutboundUrl("not a url")).toBe(false);
  });

  test("rejects non-http(s) schemes", () => {
    expect(isSafeOutboundUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeOutboundUrl("ftp://example.com/x")).toBe(false);
  });
});

describe("config schemas enforce the SSRF guard at validation time", () => {
  test("webhook config rejects an internal https target", () => {
    const r = webhookConfigSchema.safeParse({
      url: "https://169.254.169.254/x",
    });
    expect(r.success).toBe(false);
  });

  test("webhook config still accepts a public https target", () => {
    const r = webhookConfigSchema.safeParse({ url: "https://example.com/x" });
    expect(r.success).toBe(true);
  });

  test("lead_capture endpoint rejects loopback", () => {
    const r = leadCaptureConfigSchema.safeParse({
      endpoint: "http://127.0.0.1/x",
      fieldMap: { name: "first_name" },
    });
    expect(r.success).toBe(false);
  });

  test("lead_capture with no endpoint is still valid (provider-not-configured path)", () => {
    const r = leadCaptureConfigSchema.safeParse({
      fieldMap: { name: "first_name" },
    });
    expect(r.success).toBe(true);
  });

  test("email_marketing endpoint rejects an RFC-1918 target", () => {
    const r = emailMarketingConfigSchema.safeParse({
      endpoint: "https://10.1.2.3/x",
      listId: "L1",
      emailFieldKey: "email",
    });
    expect(r.success).toBe(false);
  });
});

// ─── Mocked provider/action contracts ────────────────────────────────────────

function actionCtx(values: Record<string, string> = {}): ActionRunContext {
  return {
    ctx: {
      runQuery: async () => null,
      runMutation: async () => null,
      runAction: async () => null,
    },
    formId: "forms:fixture",
    submissionId: "form_submissions:fixture",
    values,
    attempt: 1,
  };
}

async function withMockFetch<T>(
  fn: (calls: Array<{ url: string; init?: RequestInit }>) => Promise<T>,
  response: Response = new Response("ok", { status: 200 }),
): Promise<T> {
  const prior = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return response;
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = prior;
  }
}

describe("mocked provider action contracts", () => {
  test("webhook posts the rendered body and records a 2xx success", async () => {
    __resetActionRegistryForTests();
    registerFirstPartyActionTypes();
    const webhook = getActionType("webhook");
    let result: ActionResult | undefined;
    await withMockFetch(async (calls) => {
      result = await webhook!.run(
        actionCtx({ email: "ada@example.test" }),
        {
          url: "https://hooks.example.test/form",
          bodyTemplate: '{"email":"{email}"}',
          headers: { "x-test": "1" },
        },
      );
      expect(calls.length).toBe(1);
      expect(calls[0]!.url).toBe("https://hooks.example.test/form");
      expect(calls[0]!.init?.method).toBe("POST");
      expect(calls[0]!.init?.body).toBe('{"email":"ada@example.test"}');
      expect((calls[0]!.init?.headers as Record<string, string>)["x-test"]).toBe(
        "1",
      );
    });
    expect(result).toEqual({ ok: true, data: { status: 200 } });
  });

  test("webhook classifies 5xx as retryable and 4xx as permanent", async () => {
    __resetActionRegistryForTests();
    registerFirstPartyActionTypes();
    const webhook = getActionType("webhook")!;
    const retryable = await withMockFetch(
      async () =>
        webhook.run(actionCtx(), {
          url: "https://hooks.example.test/form",
        }),
      new Response("nope", { status: 503 }),
    );
    expect(retryable.ok).toBe(false);
    expect(retryable.retryable).toBe(true);

    const permanent = await withMockFetch(
      async () =>
        webhook.run(actionCtx(), {
          url: "https://hooks.example.test/form",
        }),
      new Response("bad", { status: 400 }),
    );
    expect(permanent.ok).toBe(false);
    expect(permanent.retryable).toBe(false);
  });

  test("lead_capture without endpoint fails cleanly without fetch", async () => {
    __resetActionRegistryForTests();
    registerFirstPartyActionTypes();
    const lead = getActionType("lead_capture")!;
    const result = await withMockFetch(async (calls) => {
      const r = await lead.run(actionCtx({ name: "Ada" }), {
        fieldMap: { name: "firstname" },
      });
      expect(calls.length).toBe(0);
      return r;
    });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
  });

  test("lead_capture posts mapped properties with bearer credentials", async () => {
    __resetActionRegistryForTests();
    registerFirstPartyActionTypes();
    const lead = getActionType("lead_capture")!;
    let result: ActionResult | undefined;
    await withMockFetch(async (calls) => {
      result = await lead.run(
        actionCtx({ name: "Ada", email: "ada@example.test" }),
        {
          endpoint: "https://crm.example.test/leads",
          apiKey: "secret-token",
          fieldMap: { name: "firstname", email: "email" },
        },
      );
      expect(calls.length).toBe(1);
      expect(calls[0]!.init?.body).toBe(
        JSON.stringify({
          properties: { firstname: "Ada", email: "ada@example.test" },
        }),
      );
      expect(
        (calls[0]!.init?.headers as Record<string, string>).authorization,
      ).toBe("Bearer secret-token");
    });
    expect(result).toEqual({ ok: true, data: { status: 200 } });
  });

  test("email_marketing rejects submissions without the mapped email", async () => {
    __resetActionRegistryForTests();
    registerFirstPartyActionTypes();
    const email = getActionType("email_marketing")!;
    const result = await email.run(actionCtx({}), {
      endpoint: "https://mail.example.test/subscribe",
      listId: "audience-1",
      emailFieldKey: "email",
    });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
  });

  test("email_marketing posts list, email, and merge fields", async () => {
    __resetActionRegistryForTests();
    registerFirstPartyActionTypes();
    const email = getActionType("email_marketing")!;
    let result: ActionResult | undefined;
    await withMockFetch(async (calls) => {
      result = await email.run(
        actionCtx({ email: "ada@example.test", name: "Ada" }),
        {
          endpoint: "https://mail.example.test/subscribe",
          apiKey: "mail-token",
          listId: "audience-1",
          emailFieldKey: "email",
          mergeFields: { name: "FNAME" },
        },
      );
      expect(calls.length).toBe(1);
      expect(calls[0]!.init?.body).toBe(
        JSON.stringify({
          listId: "audience-1",
          email: "ada@example.test",
          mergeFields: { FNAME: "Ada" },
        }),
      );
      expect(
        (calls[0]!.init?.headers as Record<string, string>).authorization,
      ).toBe("Bearer mail-token");
    });
    expect(result).toEqual({ ok: true, data: { status: 200 } });
  });
});

// ─── Run-status state machine (the runner's terminal/transition contract) ────
//
// The runner records exactly these statuses:
//   pending → running is implicit (the action executes between claim+finalize);
//   pending → completed | failed | awaiting_payment (finalizeRun);
//   pending → pending   (scheduleRetry, capped backoff);
//   awaiting_payment → completed (the Stripe webhook activates the intent).
// `completed` is TERMINAL: it must never transition anywhere (idempotency).
// This predicate mirrors those allowed edges so the contract is pinned.

type RunStatus = "pending" | "running" | "completed" | "failed" | "awaiting_payment";

function isValidTransition(from: RunStatus, to: RunStatus): boolean {
  switch (from) {
    case "pending":
      // claim→execute (running), retry (pending), or any terminal/non-terminal.
      return (
        to === "running" ||
        to === "pending" ||
        to === "completed" ||
        to === "failed" ||
        to === "awaiting_payment"
      );
    case "running":
      return to === "completed" || to === "failed" || to === "awaiting_payment";
    case "awaiting_payment":
      // Webhook settles a paid run to completed; a replay re-arms it to pending.
      // It is NOT allowed to silently fail (the webhook owns activation).
      return to === "completed" || to === "pending";
    case "failed":
      // Non-terminal here by design: a replay re-arms a failed run to pending.
      return to === "pending";
    case "completed":
      // Terminal — never transitions. This is the anti-double-fire guarantee.
      return false;
    default:
      return false;
  }
}

describe("run-status state machine", () => {
  test("pending advances to each legal next state", () => {
    expect(isValidTransition("pending", "running")).toBe(true);
    expect(isValidTransition("pending", "completed")).toBe(true);
    expect(isValidTransition("pending", "failed")).toBe(true);
    expect(isValidTransition("pending", "awaiting_payment")).toBe(true);
    expect(isValidTransition("pending", "pending")).toBe(true);
  });

  test("awaiting_payment → completed is allowed (payment success settles it)", () => {
    expect(isValidTransition("awaiting_payment", "completed")).toBe(true);
  });

  test("awaiting_payment → failed is rejected (webhook owns activation)", () => {
    expect(isValidTransition("awaiting_payment", "failed")).toBe(false);
  });

  test("completed is terminal — no transition out of it is legal", () => {
    expect(isValidTransition("completed", "pending")).toBe(false);
    expect(isValidTransition("completed", "running")).toBe(false);
    expect(isValidTransition("completed", "failed")).toBe(false);
    expect(isValidTransition("completed", "completed")).toBe(false);
    expect(isValidTransition("completed", "awaiting_payment")).toBe(false);
  });

  test("failed can be re-armed to pending (replay) but not jump to completed", () => {
    expect(isValidTransition("failed", "pending")).toBe(true);
    expect(isValidTransition("failed", "completed")).toBe(false);
  });

  test("running settles only to a terminal/non-terminal outcome", () => {
    expect(isValidTransition("running", "completed")).toBe(true);
    expect(isValidTransition("running", "awaiting_payment")).toBe(true);
    expect(isValidTransition("running", "pending")).toBe(false);
  });
});

// ─── Run-claim idempotency (the dedupe decision per submission+action) ───────
//
// The runner: a `completed` run (incl. skipped-as-completed) is NEVER re-fired;
// any other prior run (pending/failed/awaiting_payment) is re-claimed; absence
// of a prior run inserts a fresh one. A retry must therefore NEVER mint a second
// charge/webhook for an already-completed (submission, action).

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

  test("pending run is reused (in-flight; not duplicated)", () => {
    expect(claimDecision({ status: "pending" })).toBe("reuse");
  });

  test("no prior run inserts a fresh one", () => {
    expect(claimDecision(null)).toBe("insert");
  });

  test("a second dispatch of a completed run is a no-op (anti-double-fire)", () => {
    // dispatchAction returns early when run.status === "completed". Model that:
    const dispatchWouldRun = (status: RunStatus) => status !== "completed";
    expect(dispatchWouldRun("completed")).toBe(false);
    expect(dispatchWouldRun("pending")).toBe(true);
    expect(dispatchWouldRun("awaiting_payment")).toBe(true);
  });
});

// ─── Retry / backoff ladder (capped exponential, runner contract) ────────────
//
// MAX_ATTEMPTS=4; a retryable failure with attempt < MAX schedules another
// dispatch, else it is terminal-failed. Backoff is monotonic up to the cap.

const MAX_ATTEMPTS = 4;
function shouldRetry(retryable: boolean, attempt: number): boolean {
  return retryable && attempt < MAX_ATTEMPTS;
}
function backoffBaseMs(attempt: number): number {
  return Math.min(30_000 * 2 ** (attempt - 1), 600_000);
}

describe("retry decision + backoff ladder", () => {
  test("retryable failures retry until the attempt cap", () => {
    expect(shouldRetry(true, 1)).toBe(true);
    expect(shouldRetry(true, 3)).toBe(true);
    expect(shouldRetry(true, 4)).toBe(false); // cap reached → terminal fail
  });

  test("a non-retryable failure never retries (permanent)", () => {
    expect(shouldRetry(false, 1)).toBe(false);
  });

  test("backoff is monotonic non-decreasing and capped at 10 minutes", () => {
    expect(backoffBaseMs(1)).toBe(30_000);
    expect(backoffBaseMs(2)).toBe(60_000);
    expect(backoffBaseMs(3)).toBe(120_000);
    const big = backoffBaseMs(20);
    expect(big).toBe(600_000);
  });
});

// ─── Per-action conditional gating (real evaluateConditionalLogic) ───────────
//
// `runActions` calls evaluateConditionalLogic(action.conditionalLogic, valueMap)
// per enabled action to decide whether THIS action runs for THIS submission.
// Undefined/empty/malformed ⇒ fail-OPEN (run). Only `enabled:false` disables.

describe("per-action conditional gating", () => {
  test("absent conditional logic runs the action (always-run default)", () => {
    expect(evaluateConditionalLogic(undefined, { a: "1" })).toBe(true);
  });

  test("malformed JSON fails open (action runs)", () => {
    expect(evaluateConditionalLogic("{not json", { a: "1" })).toBe(true);
  });

  test("show-when-equals gates the action to a matching submission", () => {
    const logic = JSON.stringify({
      action: "show",
      logic: "and",
      rules: [{ field: "plan", operator: "==", value: "pro" }],
    });
    expect(evaluateConditionalLogic(logic, { plan: "pro" })).toBe(true);
    expect(evaluateConditionalLogic(logic, { plan: "free" })).toBe(false);
  });

  test("hide-when-equals inverts the gate", () => {
    const logic = JSON.stringify({
      action: "hide",
      logic: "and",
      rules: [{ field: "country", operator: "==", value: "US" }],
    });
    // hide when US → action does NOT run for a US submission.
    expect(evaluateConditionalLogic(logic, { country: "US" })).toBe(false);
    expect(evaluateConditionalLogic(logic, { country: "CA" })).toBe(true);
  });

  test("AND requires every rule; OR requires any", () => {
    const andLogic = JSON.stringify({
      action: "show",
      logic: "and",
      rules: [
        { field: "a", operator: "==", value: "1" },
        { field: "b", operator: "==", value: "2" },
      ],
    });
    expect(evaluateConditionalLogic(andLogic, { a: "1", b: "2" })).toBe(true);
    expect(evaluateConditionalLogic(andLogic, { a: "1", b: "x" })).toBe(false);

    const orLogic = JSON.stringify({
      action: "show",
      logic: "or",
      rules: [
        { field: "a", operator: "==", value: "1" },
        { field: "b", operator: "==", value: "2" },
      ],
    });
    expect(evaluateConditionalLogic(orLogic, { a: "1", b: "x" })).toBe(true);
    expect(evaluateConditionalLogic(orLogic, { a: "x", b: "x" })).toBe(false);
  });

  test("explicit enabled:false disables the gate (fail-open / runs)", () => {
    const logic = JSON.stringify({
      enabled: false,
      action: "show",
      rules: [{ field: "plan", operator: "==", value: "pro" }],
    });
    expect(evaluateConditionalLogic(logic, { plan: "free" })).toBe(true);
  });

  test("not_empty gates on the presence of a value", () => {
    const logic = JSON.stringify({
      action: "show",
      rules: [{ field: "email", operator: "not_empty", value: "" }],
    });
    expect(evaluateConditionalLogic(logic, { email: "a@b.co" })).toBe(true);
    expect(evaluateConditionalLogic(logic, { email: "" })).toBe(false);
  });
});

// ─── Commerce: pricing → charge-shape mapping (real `pricingToChargeShape`) ──
//
// SECURITY: the amounts are the SERVER-recomputed price (integer cents) from the
// checkout intent — NEVER a client value. This pure mapping decides the three
// mutually-exclusive Stripe shapes and must (a) never turn a non-positive price
// into a positive charge, (b) keep one-time vs recurring distinct, (c) clamp
// malformed inputs safely.

describe("pricingToChargeShape (server-trusted cents → Stripe shape)", () => {
  test("zero initial + zero recurring → free (no charge, no card)", () => {
    const s = pricingToChargeShape({ initialAmount: 0, recurringAmount: 0 });
    expect(s.mode).toBe("free");
    expect(s.amountNow).toBe(0);
    expect(s.needsPayment).toBe(false);
  });

  test("empty pricing (omitted recurring, zero initial) → free", () => {
    const s = pricingToChargeShape({ initialAmount: 0 });
    expect(s.mode).toBe("free");
    expect(s.recurringAmount).toBe(0);
  });

  test("positive one-time, zero recurring → payment (charge now), no interval", () => {
    const s = pricingToChargeShape({ initialAmount: 1999, recurringAmount: 0 });
    expect(s.mode).toBe("payment");
    expect(s.amountNow).toBe(1999);
    expect(s.recurringAmount).toBe(0);
    expect(s.recurringInterval).toBe(undefined);
    expect(s.needsPayment).toBe(true);
  });

  test("zero initial + positive recurring → setup ($0 now, collect card)", () => {
    const s = pricingToChargeShape({
      initialAmount: 0,
      recurringAmount: 1500,
      recurringInterval: "month",
    });
    expect(s.mode).toBe("setup");
    expect(s.amountNow).toBe(0);
    expect(s.recurringAmount).toBe(1500);
    expect(s.recurringInterval).toBe("month");
    expect(s.needsPayment).toBe(true);
  });

  test("positive initial + positive recurring → payment now + recurring cadence", () => {
    const s = pricingToChargeShape({
      initialAmount: 5000,
      recurringAmount: 2500,
      recurringInterval: "year",
    });
    expect(s.mode).toBe("payment");
    expect(s.amountNow).toBe(5000);
    expect(s.recurringAmount).toBe(2500);
    expect(s.recurringInterval).toBe("year");
  });

  test("currency is normalized to uppercase, defaulting to USD", () => {
    expect(pricingToChargeShape({ initialAmount: 100, currency: "eur" }).currency).toBe("EUR");
    expect(pricingToChargeShape({ initialAmount: 100 }).currency).toBe("USD");
    expect(pricingToChargeShape({ initialAmount: 100, currency: "  " }).currency).toBe("USD");
  });

  test("a NEGATIVE price can never become a charge (clamped to free)", () => {
    const s = pricingToChargeShape({ initialAmount: -999, recurringAmount: -1 });
    expect(s.mode).toBe("free");
    expect(s.amountNow).toBe(0);
    expect(s.needsPayment).toBe(false);
  });

  test("a NaN price is clamped (never a positive charge)", () => {
    const s = pricingToChargeShape({ initialAmount: NaN as unknown as number });
    expect(s.mode).toBe("free");
    expect(s.amountNow).toBe(0);
  });

  test("a fractional price is rounded to integer cents (no float charge)", () => {
    const s = pricingToChargeShape({ initialAmount: 199.6 });
    expect(s.amountNow).toBe(200);
    expect(Number.isInteger(s.amountNow)).toBe(true);
  });

  test("recurringInterval is dropped when there is no recurring amount", () => {
    const s = pricingToChargeShape({
      initialAmount: 1000,
      recurringAmount: 0,
      recurringInterval: "month",
    });
    expect(s.recurringInterval).toBe(undefined);
  });
});

// ─── Commerce: pricing INTEGRITY — server amount is the only source ──────────
//
// The charge MUST use the server-recomputed pricing, never a client-supplied
// amount. `resolveInputs` deliberately resolves ONLY offer / email / coupon from
// the submission — never an amount. These assert no client-controlled `amount`,
// `price`, or `total` field can leak into the pricing path.

describe("commerce pricing integrity (no client amount trusted)", () => {
  test("resolveInputs returns only offerId/customerEmail/couponCode (no amount)", () => {
    const r = resolveInputs(
      { offerMode: "fixed", offerId: "o1", emailFieldName: "email" } as never,
      // Adversarial: client tries to inject pricing fields into the answers.
      {
        email: "a@b.co",
        amount: "1",
        price: "0",
        total: "0",
        initialAmount: "1",
      },
    );
    expect(Object.keys(r).sort()).toEqual([
      "couponCode",
      "customerEmail",
      "offerId",
    ]);
    expect((r as Record<string, unknown>).amount).toBe(undefined);
    expect(r.offerId).toBe("o1");
    expect(r.customerEmail).toBe("a@b.co");
  });

  test("pricingToChargeShape ignores any client field — it takes explicit cents only", () => {
    // The mapping's signature accepts only server pricing; a client-shaped blob
    // with an `amount` does not influence the charge (TS would reject it; at
    // runtime only initialAmount/recurringAmount are read).
    const s = pricingToChargeShape({
      initialAmount: 0,
      recurringAmount: 0,
      // @ts-expect-error client cannot inject an amount override into the shape
      amount: 9999,
      // @ts-expect-error nor a total
      total: 9999,
    } as never);
    expect(s.mode).toBe("free");
    expect(s.amountNow).toBe(0);
  });
});

// ─── Commerce resolveInputs (real export) ────────────────────────────────────
//
// fixed → offerId; fromField → map[value] ?? value; email trimmed; coupon by mode.

describe("commerce resolveInputs", () => {
  test("fixed mode uses offerId directly", () => {
    const r = resolveInputs(
      { offerMode: "fixed", offerId: "offer_1", emailFieldName: "email" } as never,
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
      } as never,
      { plan: "gold", email: "x@y.co" },
    );
    expect(r.offerId).toBe("offer_gold");
  });

  test("fromField falls back to the field value as the offer id", () => {
    const r = resolveInputs(
      { offerMode: "fromField", offerFieldName: "plan", emailFieldName: "email" } as never,
      { plan: "offer_raw", email: "x@y.co" },
    );
    expect(r.offerId).toBe("offer_raw");
  });

  test("no resolvable offer yields undefined", () => {
    const r = resolveInputs(
      { offerMode: "fromField", offerFieldName: "plan", emailFieldName: "email" } as never,
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
      } as never,
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
      } as never,
      { email: "x@y.co", promo: "FALL" },
    );
    expect(r.couponCode).toBe("FALL");
  });

  test("coupon none yields undefined", () => {
    const r = resolveInputs(
      { offerMode: "fixed", offerId: "o", emailFieldName: "email" } as never,
      { email: "x@y.co" },
    );
    expect(r.couponCode).toBe(undefined);
  });
});

// ─── Commerce config validation (real subscriptionConfigSchema) ──────────────

describe("subscriptionConfigSchema", () => {
  test("accepts a valid fixed-offer config", () => {
    const r = subscriptionConfigSchema.safeParse({
      offerMode: "fixed",
      offerId: "o1",
      emailFieldName: "email",
      accountPolicy: "require_existing",
    });
    expect(r.success).toBe(true);
  });

  test("rejects a fixed-offer config missing offerId", () => {
    const r = subscriptionConfigSchema.safeParse({
      offerMode: "fixed",
      emailFieldName: "email",
      accountPolicy: "require_existing",
    });
    expect(r.success).toBe(false);
  });

  test("rejects a from-field config missing offerFieldName", () => {
    const r = subscriptionConfigSchema.safeParse({
      offerMode: "fromField",
      emailFieldName: "email",
      accountPolicy: "create_on_website",
    });
    expect(r.success).toBe(false);
  });

  test("maxInitialAmount must be a non-negative integer (cents ceiling)", () => {
    const neg = subscriptionConfigSchema.safeParse({
      offerMode: "fixed",
      offerId: "o1",
      emailFieldName: "email",
      accountPolicy: "require_existing",
      maxInitialAmount: -1,
    });
    expect(neg.success).toBe(false);
    const frac = subscriptionConfigSchema.safeParse({
      offerMode: "fixed",
      offerId: "o1",
      emailFieldName: "email",
      accountPolicy: "require_existing",
      maxInitialAmount: 10.5,
    });
    expect(frac.success).toBe(false);
  });
});

// Mark ActionRunContext referenced (type-only import lint guard).
const _typeGuard: ActionRunContext | undefined = undefined;
void _typeGuard;
