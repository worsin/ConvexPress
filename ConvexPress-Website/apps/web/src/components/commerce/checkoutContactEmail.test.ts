import { expect, test } from "bun:test";
import { checkoutContactEmail } from "./checkoutContactEmail";

test("prefills an authenticated customer's email when a new checkout has none", () => {
  expect(checkoutContactEmail(undefined, undefined, "river@example.test")).toBe("river@example.test");
  expect(checkoutContactEmail(undefined, "", "river@example.test")).toBe("river@example.test");
  expect(checkoutContactEmail(undefined, undefined, undefined)).toBe("");
});
test("a saved checkout contact takes precedence over the account default", () => {
  expect(checkoutContactEmail(undefined, "delivery@example.test", "river@example.test")).toBe("delivery@example.test");
});
test("hydration and reactive updates never overwrite a typed or deliberately cleared input", () => {
  expect(checkoutContactEmail("chosen@example.test", "saved@example.test", "river@example.test")).toBe("chosen@example.test");
  expect(checkoutContactEmail("", "saved@example.test", "river@example.test")).toBe("");
});
