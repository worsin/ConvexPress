import { expect, test } from "bun:test";
import { orderAmountRows, recordedOrderMoney, carrierServiceLabel } from "./order-summary";
test("saved amounts explain shipping, discount and tax without recomputing total", () => {
  const rows = orderAmountRows({ subtotalAmount: 3800, discountAmount: 0, shippingAmount: 700, taxAmount: 0, totalAmount: 4500, currencyCode: "USD" });
  expect(rows.map(row => [row.label, row.value])).toEqual([["Subtotal", "$38.00"], ["Discount", "$0.00"], ["Shipping", "$7.00"], ["Tax", "$0.00"], ["Total", "$45.00"]]);
  const adjusted = orderAmountRows({ subtotalAmount: 3800, discountAmount: 300, shippingAmount: 700, taxAmount: 150, totalAmount: 999, currencyCode: "EUR", appliedDiscountCode: "FIELD" });
  expect(adjusted[1]).toMatchObject({ label: "Discount (FIELD)", value: "−€3.00" });
  expect(adjusted[4].value).toBe("€9.99");
});
test("missing historic fields never invent zero or a currency", () => {
  expect(orderAmountRows({ totalAmount: 4500, currencyCode: "USD" }).map(row => row.value)).toEqual(["Not recorded", "Not recorded", "Not recorded", "Not recorded", "$45.00"]);
  expect(recordedOrderMoney(null, "USD")).toBe("Not recorded");
  expect(recordedOrderMoney(0, "USD", true)).toBe("$0.00");
  expect(recordedOrderMoney(100, undefined)).toBe("Currency not recorded");
  expect(recordedOrderMoney(100, "bad currency")).toBe("Currency unavailable");
  for (const amount of [NaN, Infinity, "100", 1.5]) expect(recordedOrderMoney(amount, "USD")).toBe("Unavailable");
});
test("carrier/service labels remove duplicates without discarding distinct service", () => {
  expect(carrierServiceLabel("Utah delivery", "Utah delivery")).toBe("Utah delivery");
  expect(carrierServiceLabel(" Utah  delivery ", "UTAH DELIVERY")).toBe("Utah delivery");
  expect(carrierServiceLabel("USPS", "Priority Mail")).toBe("USPS • Priority Mail");
  expect(carrierServiceLabel(null, "Collection")).toBe("Collection");
  expect(carrierServiceLabel(" ", undefined)).toBeNull();
});
