import { describe, expect, test } from "bun:test";

import {
  SECRET_SENTINEL,
  buildSetupChecklistCards,
  cardStatus,
  connectedProviderCount,
  hasSettingValue,
  hasShipFromAddress,
  providerSecretCount,
} from "./setup-checklist";

function buildCards() {
  return buildSetupChecklistCards({
    email: {
      resendApiKey: SECRET_SENTINEL,
      webhookSecret: SECRET_SENTINEL,
      fromAddress: "noreply@example.com",
    },
    clerk: {
      clerkSecretKey: SECRET_SENTINEL,
      clerkWebhookSecret: SECRET_SENTINEL,
      clerkJwtIssuerDomain: "https://clerk.example.test",
    },
    searchSettings: {
      meilisearchHost: "https://search.example.test",
      meilisearchApiKey: SECRET_SENTINEL,
    },
    ai: {
      provider: "openrouter",
      apiKey: SECRET_SENTINEL,
      tavilyApiKey: SECRET_SENTINEL,
      imageApiKey: "",
    },
    payments: {
      stripePublishableKey: "pk_test",
      stripeSecretKey: SECRET_SENTINEL,
      stripeWebhookSecret: SECRET_SENTINEL,
      paypalClientId: "paypal-client",
      paypalClientSecret: SECRET_SENTINEL,
      paypalWebhookId: SECRET_SENTINEL,
    },
    google: {
      placesApiKey: SECRET_SENTINEL,
      geocodeApiKey: SECRET_SENTINEL,
    },
    ga4: {
      ga4ServiceAccountJson: SECRET_SENTINEL,
      ga4PropertyId: "properties/123",
    },
    shipping: {
      integrationSettings: {
        shipFromLine1: "1 Admin Way",
        shipFromCity: "Bend",
        shipFromState: "OR",
        shipFromPostalCode: "97701",
        shipFromCountryCode: "US",
      },
      providers: [
        {
          provider: "shipstation",
          secretStored: true,
          connection: { status: "connected" },
        },
        {
          provider: "ups",
          secretStored: false,
          connection: { status: "disconnected" },
        },
      ],
    },
  });
}

describe("setup checklist", () => {
  test("includes every first-run provider surface and route", () => {
    const cards = buildCards();

    expect(cards.map((card) => card.id)).toEqual([
      "email",
      "clerk",
      "search",
      "ai",
      "stripe",
      "paypal",
      "google",
      "ga4",
      "shipping",
    ]);

    expect(cards.map((card) => card.route)).toEqual([
      "/settings/email",
      "/settings/integrations/clerk",
      "/settings/search",
      "/settings/ai",
      "/settings/integrations/stripe",
      "/settings/integrations/paypal",
      "/settings/integrations/google",
      "/settings/analytics/ga4",
      "/settings/integrations/shipping",
    ]);
  });

  test("tracks all required setup keys for full functionality", () => {
    const labelsByCard = Object.fromEntries(
      buildCards().map((card) => [
        card.id,
        card.requirements.map((requirement) => requirement.label),
      ]),
    );

    expect(labelsByCard).toEqual({
      email: ["resendApiKey", "webhookSecret", "fromAddress"],
      clerk: [
        "clerkSecretKey",
        "clerkWebhookSecret",
        "clerkJwtIssuerDomain",
      ],
      search: ["meilisearchHost", "meilisearchApiKey"],
      ai: ["apiKey", "tavilyApiKey", "imageApiKey"],
      stripe: [
        "stripePublishableKey",
        "stripeSecretKey",
        "stripeWebhookSecret",
      ],
      paypal: ["paypalClientId", "paypalClientSecret", "paypalWebhookId"],
      google: ["placesApiKey", "geocodeApiKey", "ga4ServiceAccountJson"],
      ga4: ["ga4ServiceAccountJson", "ga4PropertyId"],
      shipping: ["carrier credentials", "ship-from address", "verified provider"],
    });
  });

  test("treats redacted secret sentinels as configured values", () => {
    expect(hasSettingValue({ apiKey: SECRET_SENTINEL }, "apiKey")).toBe(true);
    expect(hasSettingValue({ apiKey: "   " }, "apiKey")).toBe(false);
    expect(hasSettingValue({ enabled: false }, "enabled")).toBe(false);
  });

  test("computes shipping setup status from secrets, connections, and origin", () => {
    const shipping = {
      integrationSettings: {
        shipFromLine1: "1 Admin Way",
        shipFromCity: "Bend",
        shipFromState: "OR",
        shipFromPostalCode: "97701",
        shipFromCountryCode: "US",
      },
      providers: [
        {
          provider: "shipstation",
          secretStored: true,
          connection: { status: "connected" },
        },
        {
          provider: "ups",
          secretStored: true,
          connection: { status: "error" },
        },
      ],
    };

    expect(providerSecretCount(shipping)).toBe(2);
    expect(connectedProviderCount(shipping)).toBe(1);
    expect(hasShipFromAddress(shipping)).toBe(true);

    const shippingCard = buildSetupChecklistCards({
      email: {},
      clerk: {},
      searchSettings: {},
      ai: {},
      payments: {},
      google: {},
      ga4: {},
      shipping,
    }).find((card) => card.id === "shipping");

    expect(shippingCard?.requirements[0]?.detail).toBe(
      "2 of 5 provider secrets stored",
    );
    expect(cardStatus(shippingCard!)).toBe("ready");
  });
});
