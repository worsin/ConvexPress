import { expect, test } from "bun:test";
import { completeReferencePage } from "../../media/referenceScan";
import { requireCompletePolicyPage } from "../../membership/policyReads";

// Observed on cloud: three products / 3.5 KiB, isDone=true, pageStatus=null,
// with a splitCursor. A potential split boundary is not a split status.
const page = { page: [{ label: "one" }, { label: "two" }], isDone: true, continueCursor: "end", splitCursor: "midpoint" };

test("media completeness accepts an inert split cursor on a complete bounded page", () => {
  for (const pageStatus of [null, undefined]) {
    expect(completeReferencePage({ ...page, pageStatus }).rows).toBe(2);
  }
});

test("membership completeness accepts the same actual cloud page metadata", () => {
  for (const pageStatus of [null, undefined]) {
    expect(requireCompletePolicyPage({ ...page, pageStatus })).toEqual(page.page);
  }
});

test("split statuses, unfinished scans, and over-budget pages still refuse", () => {
  for (const check of [completeReferencePage, requireCompletePolicyPage]) {
    for (const pageStatus of ["SplitRequired", "SplitRecommended"] as const) {
      expect(() => check({ ...page, pageStatus })).toThrow();
    }
    expect(() => check({ ...page, isDone: false })).toThrow();
    expect(() => check({ ...page, page: Array.from({ length: 257 }, () => ({ label: "row" })) })).toThrow();
    expect(() => check({ ...page, page: [{ label: "é".repeat(300000) }] })).toThrow();
  }
});
