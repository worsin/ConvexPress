/**
 * ConvexPress Forms — public submit-pipeline security tests (pure functions).
 * Run: `bun test convex/extensions/forms/__tests__/submitSecurity.test.ts`
 *
 * Covers the pure decision-logic the PUBLIC, UNAUTHENTICATED `submit` mutation
 * trusts, extracted so it can be tested without a Convex harness:
 *
 *   spam.ts (extracted from guardSubmission):
 *     - honeypotTripped     — bot filled the hidden field vs clean/blank/disabled
 *     - timeTrapReason      — too_fast / too_slow / skip semantics, forged stamps
 *     - rateWindowStart     — fixed-window flooring
 *     - rateLimitDecision   — within vs over window, per-ip vs per-form ceiling
 *
 *   submitGuards.ts (DoS payload bounds):
 *     - checkSubmissionPayload — entry count, value length, total length,
 *       field-key length, JSON depth + node bounds (repeater/array blobs)
 *     - measureJson            — iterative depth/node measurement (no stack blow)
 *
 *   formLogic.ts (server-trust, the submit contract — adversarial re-assertions):
 *     - required-field BYPASS: a field hidden by AUTHORED conditional logic must
 *       NOT be required even when the client omits it; a spoofed value for a
 *       server-hidden field is dropped and never validated.
 *     - submission-status determination (partial / complete) parity with the
 *       mutation's `isComplete ? "complete" : "partial"` rule.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  honeypotTripped,
  timeTrapReason,
  rateWindowStart,
  rateLimitDecision,
} from "../spam";
import {
  checkSubmissionPayload,
  measureJson,
  SUBMIT_PAYLOAD_LIMITS,
} from "../submitGuards";
import {
  recomputeVisibility,
  validateSubmission,
  type LogicFieldDef,
} from "../formLogic";

// ─── Shared helpers (mirrors formLogic.test.ts dialect) ─────────────────────

// Minimal validateFieldValue stub matching helpers/customFieldValidation.ts:
// required + empty => invalid; everything else valid.
const validate = (
  _type: string,
  value: string,
  _settings: Record<string, unknown>,
  required: boolean,
) => {
  const empty = !value || value === "" || value === "[]" || value === "{}";
  if (empty && required) return { valid: false, error: "This field is required." };
  return { valid: true };
};

const cl = (data: unknown) => JSON.stringify(data);

function field(partial: Partial<LogicFieldDef> & { key: string }): LogicFieldDef {
  return {
    type: "text",
    required: false,
    conditionalLogic: undefined,
    settings: undefined,
    parentFieldId: undefined,
    ...partial,
  };
}

// Submission-status determination: the mutation persists
//   status = isComplete ? "complete" : "partial"
// (a guard-blocked attempt never reaches a write, so "spam" is by-rejection, not
// a status returned here). This tiny pure mirror locks that contract.
function determineStatus(isComplete: boolean | undefined): "complete" | "partial" {
  return (isComplete ?? false) ? "complete" : "partial";
}

// ─── Honeypot ───────────────────────────────────────────────────────────────

describe("honeypotTripped (Stage 1a)", () => {
  test("clean: absent or empty honeypot passes", () => {
    expect(honeypotTripped(true, undefined)).toBe(null);
    expect(honeypotTripped(true, "")).toBe(null);
  });

  test("whitespace-only honeypot is treated as empty (no false positive)", () => {
    expect(honeypotTripped(true, "   ")).toBe(null);
    expect(honeypotTripped(true, "\t\n")).toBe(null);
  });

  test("tripped: a bot-filled honeypot blocks", () => {
    expect(honeypotTripped(true, "http://spam.example")).toBe("honeypot");
    expect(honeypotTripped(true, "x")).toBe("honeypot");
  });

  test("disabled honeypot never trips, even with a value present", () => {
    expect(honeypotTripped(false, "definitely-a-bot")).toBe(null);
  });
});

// ─── Time-trap ────────────────────────────────────────────────────────────────

describe("timeTrapReason (Stage 1b)", () => {
  const minFill = 2000;
  const maxAge = 24 * 60 * 60 * 1000;
  const now = 1_000_000_000;

  test("within window passes (filled fast enough but not stale)", () => {
    // started 5s ago: > minFill (2s), < maxAge (24h)
    expect(timeTrapReason(true, now - 5000, now, minFill, maxAge)).toBe(null);
  });

  test("too_fast: elapsed below minFillMs (bot auto-fill)", () => {
    expect(timeTrapReason(true, now - 500, now, minFill, maxAge)).toBe("too_fast");
  });

  test("too_slow: elapsed beyond maxFormAgeMs (stale / replayed page)", () => {
    expect(timeTrapReason(true, now - (maxAge + 1), now, minFill, maxAge)).toBe(
      "too_slow",
    );
  });

  test("absent startedAt => skip (degrade gracefully, not a block)", () => {
    expect(timeTrapReason(true, undefined, now, minFill, maxAge)).toBe(null);
  });

  test("honeypot disabled => time-trap skipped entirely", () => {
    expect(timeTrapReason(false, now - 1, now, minFill, maxAge)).toBe(null);
  });

  test("forged FUTURE startedAt yields too_fast (negative elapsed < minFill)", () => {
    // A tampered stamp set in the future can't buy a pass.
    expect(timeTrapReason(true, now + 10_000, now, minFill, maxAge)).toBe(
      "too_fast",
    );
  });

  test("exact boundary: elapsed == minFillMs is NOT too_fast (strict <)", () => {
    expect(timeTrapReason(true, now - minFill, now, minFill, maxAge)).toBe(null);
  });
});

// ─── Rate-limit window + decision ─────────────────────────────────────────────

describe("rateWindowStart", () => {
  test("floors now to the windowMs boundary", () => {
    expect(rateWindowStart(1234, 1000)).toBe(1000);
    expect(rateWindowStart(1999, 1000)).toBe(1000);
    expect(rateWindowStart(2000, 1000)).toBe(2000);
  });

  test("two timestamps in the same window share a start; next window differs", () => {
    const w = 60_000;
    expect(rateWindowStart(5_000, w)).toBe(rateWindowStart(55_000, w));
    expect(rateWindowStart(5_000, w)).toBe(0);
    expect(rateWindowStart(60_001, w)).toBe(60_000);
  });
});

describe("rateLimitDecision (Stage 2)", () => {
  test("within the window limit: not blocked", () => {
    // limit 5, this is attempt #1 (prior 0 -> next 1)
    const d = rateLimitDecision({
      priorIpCount: 0,
      perIpPerFormLimit: 5,
      priorFormTotal: 0,
      perFormLimit: undefined,
    });
    expect(d.reason).toBe(null);
    expect(d.blocked).toBe(false);
    expect(d.nextIpCount).toBe(1);
  });

  test("at the limit (Nth attempt) still passes; N+1 over the limit blocks", () => {
    // prior 4 -> next 5, limit 5: 5 > 5 is false => allowed
    const at = rateLimitDecision({
      priorIpCount: 4,
      perIpPerFormLimit: 5,
      priorFormTotal: 0,
      perFormLimit: undefined,
    });
    expect(at.reason).toBe(null);
    // prior 5 -> next 6, limit 5: 6 > 5 => rate_ip
    const over = rateLimitDecision({
      priorIpCount: 5,
      perIpPerFormLimit: 5,
      priorFormTotal: 0,
      perFormLimit: undefined,
    });
    expect(over.reason).toBe("rate_ip");
    expect(over.blocked).toBe(true);
  });

  test("per-form ceiling trips when the global total exceeds perFormLimit", () => {
    // ip well under its own limit, but the form-wide total goes over.
    const d = rateLimitDecision({
      priorIpCount: 0,
      perIpPerFormLimit: 100,
      priorFormTotal: 50,
      perFormLimit: 50,
    });
    expect(d.reason).toBe("rate_form");
    expect(d.blocked).toBe(true);
    expect(d.nextFormTotal).toBe(51);
  });

  test("per-ip is checked BEFORE per-form (rate_ip wins when both over)", () => {
    const d = rateLimitDecision({
      priorIpCount: 9,
      perIpPerFormLimit: 5,
      priorFormTotal: 9,
      perFormLimit: 5,
    });
    expect(d.reason).toBe("rate_ip");
  });

  test("perFormLimit null/undefined => per-form ceiling never trips", () => {
    const d = rateLimitDecision({
      priorIpCount: 0,
      perIpPerFormLimit: 5,
      priorFormTotal: 9_999,
      perFormLimit: null,
    });
    expect(d.reason).toBe(null);
    expect(d.blocked).toBe(false);
  });
});

// ─── Payload bounds (DoS) ─────────────────────────────────────────────────────

describe("checkSubmissionPayload (DoS bounds)", () => {
  const v = (fieldKey: string, value: string) => ({ fieldKey, value });

  test("a normal small payload passes", () => {
    const res = checkSubmissionPayload([
      v("name", "Ada"),
      v("email", "ada@example.com"),
    ]);
    expect(res.ok).toBe(true);
  });

  test("too many entries is rejected", () => {
    const many = Array.from(
      { length: SUBMIT_PAYLOAD_LIMITS.maxValueEntries + 1 },
      (_, i) => v("f" + i, "x"),
    );
    const res = checkSubmissionPayload(many);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("too_many_entries");
  });

  test("entry count exactly at the cap is allowed (boundary)", () => {
    const exact = Array.from(
      { length: SUBMIT_PAYLOAD_LIMITS.maxValueEntries },
      (_, i) => v("f" + i, "x"),
    );
    expect(checkSubmissionPayload(exact).ok).toBe(true);
  });

  test("a single oversized value is rejected", () => {
    const huge = "a".repeat(SUBMIT_PAYLOAD_LIMITS.maxValueLength + 1);
    const res = checkSubmissionPayload([v("blob", huge)]);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("value_too_long");
  });

  test("many medium values that exceed the TOTAL budget are rejected", () => {
    // Each value is under the per-value cap but together exceed maxTotalLength.
    const chunk = "a".repeat(100 * 1024); // 100KB each, under 256KB per-value cap
    const rows = Array.from({ length: 20 }, (_, i) => v("f" + i, chunk)); // ~2MB > 1MB
    const res = checkSubmissionPayload(rows);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("total_too_long");
  });

  test("an abusively long field key is rejected", () => {
    const res = checkSubmissionPayload([
      v("k".repeat(SUBMIT_PAYLOAD_LIMITS.maxFieldKeyLength + 1), "x"),
    ]);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("field_key_too_long");
  });

  test("a deeply-nested repeater JSON blob is rejected (json_too_deep)", () => {
    // Build a value that parses to depth > maxJsonDepth.
    let nested = "1";
    for (let i = 0; i < SUBMIT_PAYLOAD_LIMITS.maxJsonDepth + 5; i++) {
      nested = "[" + nested + "]";
    }
    const res = checkSubmissionPayload([v("rows", nested)]);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("json_too_deep");
  });

  test("a wide-but-shallow array exceeding the node budget is rejected", () => {
    // [ {}, {}, {}, ... ] with more than maxJsonNodes object nodes.
    const items = Array.from(
      { length: SUBMIT_PAYLOAD_LIMITS.maxJsonNodes + 5 },
      () => ({}),
    );
    const res = checkSubmissionPayload([v("rows", JSON.stringify(items))]);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("json_too_many_nodes");
  });

  test("a normal repeater (a few rows of fields) passes", () => {
    const rows = JSON.stringify([
      { product: "A", qty: "2" },
      { product: "B", qty: "1" },
      { product: "C", qty: "3" },
    ]);
    expect(checkSubmissionPayload([v("line_items", rows)]).ok).toBe(true);
  });

  test("a scalar that merely looks like a number is not JSON-bounded", () => {
    // "42" / "true" parse to primitives — only length-bounded, never depth.
    expect(checkSubmissionPayload([v("n", "42")]).ok).toBe(true);
    expect(checkSubmissionPayload([v("b", "true")]).ok).toBe(true);
  });

  test("malformed JSON-looking value is treated as a scalar (length-only)", () => {
    // Starts with '[' but is not valid JSON: must NOT throw, just length-bounded.
    expect(checkSubmissionPayload([v("x", "[not json")]).ok).toBe(true);
  });

  test("an empty values array passes", () => {
    expect(checkSubmissionPayload([]).ok).toBe(true);
  });
});

describe("measureJson (iterative, no stack overflow)", () => {
  test("a primitive has depth 0 and 0 nodes", () => {
    const m = measureJson(42, 32, 1000);
    expect(m.depth).toBe(0);
    expect(m.nodes).toBe(0);
    expect(m.exceeded).toBe(null);
  });

  test("a flat array of primitives is depth 1, 1 node (the array itself)", () => {
    const m = measureJson([1, 2, 3], 32, 1000);
    expect(m.depth).toBe(1);
    expect(m.nodes).toBe(1);
  });

  test("nested object depth is counted correctly", () => {
    const m = measureJson({ a: { b: { c: 1 } } }, 32, 1000);
    expect(m.depth).toBe(3);
  });

  test("exceeds depth flag fires past maxDepth", () => {
    const m = measureJson([[[[1]]]], 2, 1000);
    expect(m.exceeded).toBe("depth");
  });

  test("a very deep structure does not throw (iterative walk)", () => {
    // 50k-deep nested array would overflow a recursive walker; this must not.
    let deep: unknown = 1;
    for (let i = 0; i < 50_000; i++) deep = [deep];
    let threw = false;
    let result: ReturnType<typeof measureJson> | null = null;
    try {
      result = measureJson(deep, 32, 10_000);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result!.exceeded).toBe("depth"); // bounded out early, safely
  });
});

// ─── Required-field bypass (server-trust) — adversarial re-assertion ──────────

describe("required-field bypass is prevented (visibility from authored rules)", () => {
  test("field hidden by conditional logic is NOT required when client omits it", () => {
    // `reason` is required, but only shown when status == "other". The attacker
    // submits status == "open" and omits `reason`. Server recomputes visibility
    // from the AUTHORED rule → reason hidden → not required → submission valid.
    const reason = field({
      key: "reason",
      required: true,
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "status", operator: "==", value: "other" }],
      }),
    });
    const status = field({ key: "status" });
    const valueMap = { status: "open" }; // reason omitted
    const vis = recomputeVisibility([status, reason], valueMap);
    expect(vis.hiddenFieldKeys.has("reason")).toBe(true);
    const res = validateSubmission([status, reason], valueMap, vis, validate);
    expect(res.ok).toBe(true);
  });

  test("required field VISIBLE by authored rule, omitted => blocked (no bypass)", () => {
    // Same form, but now the trigger IS met (status == "other"): reason becomes
    // required and its omission must fail. The client cannot dodge this because
    // visibility is server-recomputed, not client-supplied.
    const reason = field({
      key: "reason",
      required: true,
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "status", operator: "==", value: "other" }],
      }),
    });
    const status = field({ key: "status" });
    const valueMap = { status: "other" }; // reason still omitted
    const vis = recomputeVisibility([status, reason], valueMap);
    expect(vis.visibleFieldKeys.has("reason")).toBe(true);
    const res = validateSubmission([status, reason], valueMap, vis, validate);
    expect(res.ok).toBe(false);
    expect(res.errors.reason !== undefined).toBe(true);
  });

  test("spoofed value for a server-hidden field is dropped (not validated, not trusted)", () => {
    // The client sends a value for a field the server computes as hidden. It must
    // be excluded from the visible set (=> dropped from persistence downstream)
    // and never run through validation.
    const secret = field({
      key: "internal_flag",
      required: true,
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "toggle", operator: "==", value: "on" }],
      }),
    });
    const valueMap = { toggle: "off", internal_flag: "spoofed" };
    const vis = recomputeVisibility([secret], valueMap);
    expect(vis.visibleFieldKeys.has("internal_flag")).toBe(false);
    expect(vis.hiddenFieldKeys.has("internal_flag")).toBe(true);
    const res = validateSubmission([secret], valueMap, vis, validate);
    expect(res.ok).toBe(true);
  });
});

// ─── Submission-status determination ──────────────────────────────────────────

describe("submission-status determination (partial / complete)", () => {
  test("isComplete true => complete", () => {
    expect(determineStatus(true)).toBe("complete");
  });
  test("isComplete false => partial", () => {
    expect(determineStatus(false)).toBe("partial");
  });
  test("isComplete omitted (undefined) => partial (the mutation's ?? false default)", () => {
    expect(determineStatus(undefined)).toBe("partial");
  });
});
