import { describe, expect, test } from "bun:test";

import {
  parseConfig,
  readSubscriptionConfig,
  subscriptionConfigProblems,
  withConfig,
  writeSubscriptionConfig,
} from "./actionConfig";

describe("subscription action config", () => {
  test("reads stored values at their types; wrong types read as absent", () => {
    const config = readSubscriptionConfig(
      parseConfig(JSON.stringify({ offerMode: "fromField", offerFieldName: "plan", offerFieldMap: { a: "o1", b: 7 }, maxInitialAmount: "50", accountPolicy: "x" })),
    );
    expect(config).toMatchObject({
      offerMode: "fromField",
      offerFieldName: "plan",
      offerFieldMap: { a: "o1" },
      maxInitialAmount: undefined,
      accountPolicy: "require_existing",
      couponMode: "none",
    });
    expect(parseConfig("not json")).toEqual({});
    expect(parseConfig("[1]")).toEqual({});
  });

  test("writes only what the chosen modes use", () => {
    const base = readSubscriptionConfig({});
    const written = writeSubscriptionConfig({
      ...base,
      offerMode: "fixed",
      offerId: "offer_1",
      offerFieldName: "plan",
      offerFieldMap: { a: "o1" },
      couponMode: "fixed",
      couponCode: " save20 ",
      couponFieldName: "promo",
      returnUrl: "  ",
      maxInitialAmount: 50_000,
    });
    expect(written).toEqual({
      offerMode: "fixed",
      offerId: "offer_1",
      accountPolicy: "require_existing",
      couponMode: "fixed",
      couponCode: "save20",
      maxInitialAmount: 50_000,
    });
    const fromField = writeSubscriptionConfig({ ...base, offerMode: "fromField", offerId: "stale", offerFieldName: "plan", offerFieldMap: { a: "o1", b: "" } });
    expect(fromField).toEqual({ offerMode: "fromField", offerFieldName: "plan", offerFieldMap: { a: "o1" }, accountPolicy: "require_existing", couponMode: "none" });
  });

  test("names what stops a save, per section", () => {
    const base = readSubscriptionConfig({});
    expect(subscriptionConfigProblems(base, 0)).toEqual({ offer: "Choose the plan this form sells." });
    expect(subscriptionConfigProblems({ ...base, offerMode: "fromField", offerFieldName: "plan" }, 2).offerField).toBe(
      "Choose a plan for at least one choice.",
    );
    expect(subscriptionConfigProblems({ ...base, offerId: "o1", accountPolicy: "create_on_website" }, 0).email).toContain("Choose the email field");
    expect(subscriptionConfigProblems({ ...base, offerId: "o1", couponMode: "fromField" }, 0).coupon).toBe("Choose the field that holds the coupon code.");
    expect(subscriptionConfigProblems({ ...base, offerId: "o1" }, 0)).toEqual({});
  });

  test("withConfig removes emptied keys", () => {
    expect(withConfig({ url: "https://a", secret: "s" }, { secret: "", listId: "l" })).toEqual({ url: "https://a", listId: "l" });
  });
});
