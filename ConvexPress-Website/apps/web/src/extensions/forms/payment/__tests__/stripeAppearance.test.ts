import { describe, expect, test } from "bun:test";

import { googleFontFamily, paymentErrorMessage, stripeAppearance, stripeFonts } from "../stripeAppearance";

describe("stripeAppearance", () => {
  test("carries the theme's colours, radius and font into Stripe's variables and input rules", () => {
    const appearance = stripeAppearance({
      primary: "#1e4262", background: "#ffffff", text: "#152e3f", mutedText: "#3f5666", danger: "#c0392b", border: "#d9e6ef",
      radius: "10px", fontFamily: "Inter",
    });
    expect(appearance.variables).toEqual({
      spacingUnit: "4px", colorPrimary: "#1e4262", colorBackground: "#ffffff", colorText: "#152e3f", colorTextSecondary: "#3f5666",
      colorDanger: "#c0392b", borderRadius: "10px", fontFamily: "Inter, system-ui, sans-serif",
    });
    expect(appearance.rules?.[".Input"]).toEqual({ boxShadow: "none", border: "1px solid #d9e6ef" });
    expect(appearance.rules?.[".Input:focus"]).toEqual({ borderColor: "#1e4262", boxShadow: "0 0 0 3px #1e426233" });
  });
  test("a token the page couldn't read is left to Stripe", () => {
    const appearance = stripeAppearance({ primary: "oklch(0.6 0.2 40)", border: undefined });
    expect(appearance.variables).toEqual({ spacingUnit: "4px" });
    expect(appearance.rules?.[".Input"]).toEqual({ boxShadow: "none" });
  });
});

describe("stripeFonts", () => {
  test("loads the body font from Google Fonts inside Stripe's frame", () => {
    expect(stripeFonts("Inter")).toEqual([{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" }]);
    expect(stripeFonts("Source Sans 3")).toEqual([{ cssSrc: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600&display=swap" }]);
  });
  test("nothing for a missing or unusual family name", () => {
    expect(stripeFonts(undefined)).toEqual([]);
    expect(stripeFonts("system-ui; color:red")).toEqual([]);
  });
});

describe("googleFontFamily", () => {
  test("a self-hosted variable face is asked of Google Fonts by its family name", () => {
    // The default body face: index.css self-hosts it as "Inter Variable".
    expect(googleFontFamily("Inter Variable")).toBe("Inter");
    expect(stripeFonts(googleFontFamily("Inter Variable"))).toEqual([
      { cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" },
    ]);
  });
  test("any other family is kept as it is", () => {
    expect(googleFontFamily("Inter")).toBe("Inter");
    expect(googleFontFamily("Source Sans 3")).toBe("Source Sans 3");
    expect(googleFontFamily("Roboto Flex")).toBe("Roboto Flex");
  });
});

describe("paymentErrorMessage", () => {
  const fallback = "Your payment didn't go through. Please try again.";
  test("declines and bank checks are explained in plain words", () => {
    expect(paymentErrorMessage({ type: "card_error", code: "card_declined", decline_code: "generic_decline" }, fallback)).toBe(
      "Your card was declined. Try another card, or ask your bank why.",
    );
    expect(paymentErrorMessage({ type: "card_error", code: "card_declined", decline_code: "insufficient_funds" }, fallback)).toBe(
      "Your card has insufficient funds. Try another card.",
    );
    expect(paymentErrorMessage({ type: "invalid_request_error", code: "payment_intent_authentication_failure" }, fallback)).toContain(
      "Your bank couldn't confirm the payment",
    );
    expect(paymentErrorMessage({ type: "card_error", code: "expired_card" }, fallback)).toContain("expired");
  });
  test("Stripe's own words for other card and field errors; the fallback otherwise", () => {
    expect(paymentErrorMessage({ type: "validation_error", message: "Your card number is incomplete." }, fallback)).toBe("Your card number is incomplete.");
    expect(paymentErrorMessage({ type: "api_error", message: "Internal details" }, fallback)).toBe(fallback);
  });
});
