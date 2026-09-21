import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PromotionApplyConfirmationBody } from "./PromotionApplyConfirmation";
import { fixture } from "./promotionReviewFixture";
import type { Confirmation } from "./promotionApplyModel";
function render(acknowledged: boolean, valid: boolean, mode: Confirmation["mode"] = "apply") {
  const review = { ...fixture(), canApply: true, reviewReady: true, mediaReady: true, status: "reviewed" as const, issues: [] };
  return renderToStaticMarkup(<PromotionApplyConfirmationBody confirmation={{ review, scopeKey: "scope", mode }} acknowledged={acknowledged} valid={valid} now={100} busy={false} unknownOutcome={false} onAcknowledge={() => {}} onConfirm={() => {}} onCancel={() => {}} />);
}
test("production confirmation opens readable incoming fields and requires acknowledgement before its explicit final action", () => {
  const unchecked = render(false, true);
  expect(unchecked).toContain("Production destination: https://example.test");
  expect(unchecked).toContain("I reviewed these incoming values");
  expect(unchecked).toContain("<dt class=\"font-medium text-ink-2\">Slug</dt>");
  expect(unchecked).toContain("Raw authored data");
  expect(unchecked).toContain("disabled=\"\"");
  expect(unchecked).not.toContain("<script>");
  expect(render(true, true)).not.toContain("disabled=\"\"");
  expect(render(true, false)).toContain("disabled=\"\"");
  expect(render(true, false)).toContain("confirmation is no longer current");
});
test("recovery names the same receipt retry explicitly rather than presenting a new apply", () => {
  const html = render(false, true, "recover");
  expect(html).toContain("checks the same original production receipt");
  expect(html).toContain("Check outcome and retry if eligible");
  expect(html).not.toContain(">Apply reviewed content to production<");
});
