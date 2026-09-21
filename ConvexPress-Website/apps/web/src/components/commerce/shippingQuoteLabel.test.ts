import { expect, test } from "bun:test";
import { shippingQuoteLabel } from "./shippingQuoteLabel";
import { computeAddressKey, computeCartKey } from "@convexpress-website/backend/generated/checkoutShippingGuards";
test("standalone Website uses canonical address and cart fingerprints", () => {
 expect(computeAddressKey({line1:" 123 Example Test Lane ",city:"Salt Lake City",state:"ut",postalCode:"84101",countryCode:"us"})).toBe("123 EXAMPLE TEST LANE||SALT LAKE CITY|UT|84101|US");
 expect(computeAddressKey(null)).toBe("");
 expect(computeCartKey([{productId:"mug",quantity:1}])).toBe("mug::1");
});
test("shipping names remove duplicate labels while retaining distinct carrier and service", () => {
 expect(shippingQuoteLabel({carrierName:"Utah delivery",serviceName:"Utah delivery"})).toBe("Utah delivery");
 expect(shippingQuoteLabel({carrierName:"UPS",serviceName:"Ground"})).toBe("UPS Ground");
});
