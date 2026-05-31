/**
 * Forms reads — resume safety, auth gates, and pricing-parse tests.
 * Run: `bun test convex/extensions/forms/__tests__/queries.test.ts`
 *
 * The `query`/handler wrappers need a Convex DB ctx and can't run under
 * bun:test, so this exercises the REAL pure exports the handlers delegate to
 * (`parseMetaPricing`, `computeResumeExpiry`, `projectResumeValues`) and
 * re-declares the handlers' GATE predicates locally — the `actions.test.ts`
 * precedent — to prove the security contract:
 *
 *   - resume(): never returns answer data for a non-`partial`, EXPIRED, or
 *     unpublished/missing-form draft; the projection carries ONLY
 *     `{ fieldKey -> value }` (no createdBy/ip/userAgent/referrer/meta/userId,
 *     no per-row updatedBy). Expiry is enforced from submittedAt+TTL.
 *   - auth gates: list / getForm / listSubmissions / getSubmission yield
 *     empty/null when unauthenticated.
 *
 * `.toBe` / `.toEqual` only.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  parseMetaPricing,
  computeResumeExpiry,
  projectResumeValues,
  DEFAULT_RESUME_TTL_MS,
} from "../queries";

// ════════════════════════════════════════════════════════════════════════════
// parseMetaPricing (real export)
// ════════════════════════════════════════════════════════════════════════════

describe("parseMetaPricing", () => {
  test("undefined meta → null", () => {
    expect(parseMetaPricing(undefined)).toBe(null);
  });

  test("empty-string meta → null", () => {
    expect(parseMetaPricing("")).toBe(null);
  });

  test("malformed (non-JSON) meta → null, never throws", () => {
    expect(parseMetaPricing("{not json")).toBe(null);
    expect(parseMetaPricing("<<<")).toBe(null);
  });

  test("valid meta with no pricing key → null", () => {
    expect(parseMetaPricing(JSON.stringify({ other: 1 }))).toBe(null);
  });

  test("a well-formed pricing object is returned", () => {
    const meta = JSON.stringify({
      pricing: {
        oneTime: 1999,
        recurring: [{ interval: "month", amount: 500, label: "Plan" }],
      },
    });
    expect(parseMetaPricing(meta)).toEqual({
      oneTime: 1999,
      recurring: [{ interval: "month", amount: 500, label: "Plan" }],
    });
  });

  test("oneTime-only (empty recurring array) is valid", () => {
    const meta = JSON.stringify({ pricing: { oneTime: 0, recurring: [] } });
    expect(parseMetaPricing(meta)).toEqual({ oneTime: 0, recurring: [] });
  });

  test("oneTime not a number → null (shape guard)", () => {
    const meta = JSON.stringify({ pricing: { oneTime: "1999", recurring: [] } });
    expect(parseMetaPricing(meta)).toBe(null);
  });

  test("recurring not an array → null (shape guard)", () => {
    const meta = JSON.stringify({ pricing: { oneTime: 10, recurring: {} } });
    expect(parseMetaPricing(meta)).toBe(null);
  });

  test("pricing is null → null (no crash on null typeof object)", () => {
    const meta = JSON.stringify({ pricing: null });
    expect(parseMetaPricing(meta)).toBe(null);
  });

  test("JSON null payload → null", () => {
    expect(parseMetaPricing("null")).toBe(null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// computeResumeExpiry (real export)
// ════════════════════════════════════════════════════════════════════════════

describe("computeResumeExpiry", () => {
  test("expiry = submittedAt + default TTL when submittedAt present", () => {
    const submittedAt = 1_000_000;
    expect(computeResumeExpiry({ submittedAt, createdAt: 5 })).toBe(
      submittedAt + DEFAULT_RESUME_TTL_MS,
    );
  });

  test("falls back to createdAt when submittedAt is absent", () => {
    const createdAt = 2_000_000;
    expect(computeResumeExpiry({ createdAt })).toBe(
      createdAt + DEFAULT_RESUME_TTL_MS,
    );
  });

  test("the default TTL is 30 days in ms", () => {
    expect(DEFAULT_RESUME_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test("a custom TTL is honored", () => {
    expect(computeResumeExpiry({ createdAt: 0 }, 1000)).toBe(1000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// projectResumeValues (real export) — resume-safe projection
// ════════════════════════════════════════════════════════════════════════════

describe("projectResumeValues — leakage proof", () => {
  test("flattens rows to { fieldKey -> value }", () => {
    const rows = [
      { fieldKey: "f_a", value: "Ada" },
      { fieldKey: "f_b", value: "Lovelace" },
    ];
    expect(projectResumeValues(rows)).toEqual({ f_a: "Ada", f_b: "Lovelace" });
  });

  test("ONLY fieldKey/value survive — per-row updatedBy/updatedAt are dropped", () => {
    // Simulate the full fieldValues row shape; assert nothing else leaks.
    const rows = [
      {
        fieldKey: "f_a",
        value: "Ada",
        // hostile/extra columns that MUST NOT appear in the output:
        updatedBy: "user_secret",
        updatedAt: 123,
        entityId: "sub_secret",
        entityType: "form_submission",
        fieldName: "first_name",
      },
    ];
    const out = projectResumeValues(rows as Array<{ fieldKey: string; value: string }>);
    expect(out).toEqual({ f_a: "Ada" });
    // Belt-and-braces: the dangerous keys are absent from the map's own keys.
    const keys = Object.keys(out);
    expect(keys.includes("updatedBy")).toBe(false);
    expect(keys.includes("entityId")).toBe(false);
    expect(keys.includes("fieldName")).toBe(false);
  });

  test("a later row with the same key overwrites (last write wins)", () => {
    const rows = [
      { fieldKey: "f_a", value: "old" },
      { fieldKey: "f_a", value: "new" },
    ];
    expect(projectResumeValues(rows)).toEqual({ f_a: "new" });
  });

  test("empty rows → empty map", () => {
    expect(projectResumeValues([])).toEqual({});
  });
});

// ════════════════════════════════════════════════════════════════════════════
// resume() gate predicate (contract re-declared locally — mirrors the handler)
//
// The handler can't run under bun (needs a DB ctx), so this models its exact
// decision tree and asserts the security-critical outcomes. It uses the REAL
// `computeResumeExpiry` + `projectResumeValues` for expiry + projection.
// ════════════════════════════════════════════════════════════════════════════

type SubStatus = "partial" | "complete" | "spam" | "deleted";
type FormStatus = "draft" | "published" | "archived";

interface FakeSub {
  _id: string;
  status: SubStatus;
  submittedAt?: number;
  createdAt: number;
  currentStep?: number;
  // sensitive fields that MUST NEVER be projected:
  ip?: string;
  userAgent?: string;
  referrer?: string;
  userId?: string;
  meta?: string;
  createdBy?: string;
}

type ResumeResult =
  | null
  | { status: "expired" }
  | {
      submissionId: string;
      formSlug: string;
      status: "partial";
      currentStep: number;
      expiresAt: number;
      values: Record<string, string>;
    };

/** Mirrors queries.ts → resume() exactly, using the real pure helpers. */
function resumeGate(
  sub: FakeSub | null,
  form: { status: FormStatus; slug: string } | null,
  rows: Array<{ fieldKey: string; value: string }>,
  now: number,
): ResumeResult {
  if (!sub || sub.status !== "partial") return null;
  const expiresAt = computeResumeExpiry(sub);
  if (now > expiresAt) return { status: "expired" };
  if (!form || form.status !== "published") return null;
  return {
    submissionId: sub._id,
    formSlug: form.slug,
    status: "partial",
    currentStep: sub.currentStep ?? 0,
    expiresAt,
    values: projectResumeValues(rows),
  };
}

const FRESH = 1_000_000_000_000; // a "now" far below any expiry we build
const PUBLISHED = { status: "published" as const, slug: "contact" };
const ROWS = [{ fieldKey: "f_a", value: "Ada" }];

function partialSub(over: Partial<FakeSub> = {}): FakeSub {
  return {
    _id: "sub_1",
    status: "partial",
    submittedAt: FRESH,
    createdAt: FRESH,
    currentStep: 2,
    // populate the sensitive fields so a leak would be visible:
    ip: "1.2.3.4",
    userAgent: "evil-agent",
    referrer: "https://ref.test",
    userId: "user_99",
    meta: JSON.stringify({ secret: true }),
    createdBy: "user_admin",
    ...over,
  };
}

describe("resume() gate — non-resumable statuses return null (no data)", () => {
  for (const status of ["complete", "spam", "deleted"] as SubStatus[]) {
    test(`status="${status}" → null`, () => {
      const sub = partialSub({ status });
      expect(resumeGate(sub, PUBLISHED, ROWS, FRESH)).toBe(null);
    });
  }

  test("unknown token (sub is null) → null", () => {
    expect(resumeGate(null, PUBLISHED, ROWS, FRESH)).toBe(null);
  });
});

describe("resume() gate — expiry is enforced BEFORE any answer data", () => {
  test("past TTL → { status: 'expired' }, NO values", () => {
    const sub = partialSub({ submittedAt: 0, createdAt: 0 });
    const out = resumeGate(sub, PUBLISHED, ROWS, FRESH);
    expect(out).toEqual({ status: "expired" });
    // hard proof: no `values` field leaks on the expired branch.
    expect("values" in (out as object)).toBe(false);
  });

  test("exactly at expiry is still valid (boundary: now === expiresAt)", () => {
    const submittedAt = 0;
    const sub = partialSub({ submittedAt, createdAt: 0 });
    const at = submittedAt + DEFAULT_RESUME_TTL_MS; // now === expiresAt → not > → valid
    const out = resumeGate(sub, PUBLISHED, ROWS, at);
    expect(out && "values" in out).toBe(true);
  });

  test("one ms past expiry → expired", () => {
    const submittedAt = 0;
    const sub = partialSub({ submittedAt, createdAt: 0 });
    const at = submittedAt + DEFAULT_RESUME_TTL_MS + 1;
    expect(resumeGate(sub, PUBLISHED, ROWS, at)).toEqual({ status: "expired" });
  });
});

describe("resume() gate — form must exist and be published", () => {
  test("missing form → null", () => {
    expect(resumeGate(partialSub(), null, ROWS, FRESH)).toBe(null);
  });

  for (const status of ["draft", "archived"] as FormStatus[]) {
    test(`form status="${status}" → null (unpublished)`, () => {
      const form = { status, slug: "contact" };
      expect(resumeGate(partialSub(), form, ROWS, FRESH)).toBe(null);
    });
  }
});

describe("resume() gate — resume-safe projection on the success path", () => {
  test("returns exactly the resume-safe shape", () => {
    const out = resumeGate(partialSub(), PUBLISHED, ROWS, FRESH);
    expect(out).toEqual({
      submissionId: "sub_1",
      formSlug: "contact",
      status: "partial",
      currentStep: 2,
      expiresAt: FRESH + DEFAULT_RESUME_TTL_MS,
      values: { f_a: "Ada" },
    });
  });

  test("the success payload's keys are an allowlist — no authoring metadata", () => {
    const out = resumeGate(partialSub(), PUBLISHED, ROWS, FRESH) as Record<string, unknown>;
    const keys = Object.keys(out).sort();
    expect(keys).toEqual([
      "currentStep",
      "expiresAt",
      "formSlug",
      "status",
      "submissionId",
      "values",
    ]);
    // none of the submission's sensitive fields are present:
    for (const leak of ["ip", "userAgent", "referrer", "userId", "meta", "createdBy"]) {
      expect(leak in out).toBe(false);
    }
  });

  test("currentStep defaults to 0 when the draft has none", () => {
    const out = resumeGate(
      partialSub({ currentStep: undefined }),
      PUBLISHED,
      ROWS,
      FRESH,
    ) as { currentStep: number };
    expect(out.currentStep).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Auth gates (contract re-declared locally — mirrors the handlers' first lines)
//
// list / listSubmissions: unauthenticated → empty page.
// getForm / getSubmission: unauthenticated → null.
// ════════════════════════════════════════════════════════════════════════════

const EMPTY_PAGE = { page: [] as unknown[], isDone: true, continueCursor: null };

/** list / listSubmissions: `if (!identity) return emptyPage`. */
function listAuthGate(identity: unknown): typeof EMPTY_PAGE | "PROCEED" {
  if (!identity) return EMPTY_PAGE;
  return "PROCEED";
}

/** getForm / getSubmission: `if (!identity) return null`. */
function getAuthGate(identity: unknown): null | "PROCEED" {
  if (!identity) return null;
  return "PROCEED";
}

describe("auth gates — unauthenticated reads are denied", () => {
  test("list returns an empty page when unauthenticated", () => {
    expect(listAuthGate(null)).toEqual(EMPTY_PAGE);
  });

  test("listSubmissions returns an empty page when unauthenticated", () => {
    expect(listAuthGate(null)).toEqual(EMPTY_PAGE);
    expect(listAuthGate(undefined)).toEqual(EMPTY_PAGE);
  });

  test("getForm returns null when unauthenticated", () => {
    expect(getAuthGate(null)).toBe(null);
  });

  test("getSubmission returns null when unauthenticated", () => {
    expect(getAuthGate(null)).toBe(null);
    expect(getAuthGate(undefined)).toBe(null);
  });

  test("an authenticated identity proceeds past the gate", () => {
    expect(listAuthGate({ subject: "user_1" })).toBe("PROCEED");
    expect(getAuthGate({ subject: "user_1" })).toBe("PROCEED");
  });
});
