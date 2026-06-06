import { describe, expect, test } from "bun:test";

import { validateSectionValues } from "../validation";

const SECRET_SENTINEL = "__set__";

describe("settings validation", () => {
  test("accepts setup-critical provider sections and redacted sentinels", () => {
    expect(
      validateSectionValues("email", {
        enabled: true,
        resendApiKey: SECRET_SENTINEL,
        webhookSecret: SECRET_SENTINEL,
        fromAddress: "noreply@example.com",
        fromName: "ConvexPress",
        replyTo: "support@example.com",
        rateLimit: 50,
        dailyLimit: 1000,
        batchWindow: 15,
        maxRetries: 3,
        retryDelay: 5,
        queueRetentionDays: 30,
        trackingEnabled: false,
        digestEnabled: true,
        includeUnsubscribeLink: true,
        digestDay: 1,
        digestHour: 8,
      }),
    ).toEqual([]);

    expect(
      validateSectionValues("integrations.clerk", {
        clerkSecretKey: SECRET_SENTINEL,
        clerkWebhookSecret: SECRET_SENTINEL,
        clerkJwtIssuerDomain: "https://clerk.example.test",
      }),
    ).toEqual([]);

    expect(
      validateSectionValues("commerce.payments", {
        stripePublishableKey: "pk_test_public",
        stripeSecretKey: SECRET_SENTINEL,
        stripeWebhookSecret: SECRET_SENTINEL,
        stripeMode: "sandbox",
        paypalClientId: "paypal-client-id",
        paypalClientSecret: SECRET_SENTINEL,
        paypalWebhookId: "paypal-webhook-id",
        paypalMode: "sandbox",
        subscriptionChargingEnabled: false,
        taxProviderMode: "rules",
        shippingTaxClass: "",
      }),
    ).toEqual([]);

    expect(
      validateSectionValues("integrations.google", {
        placesApiKey: SECRET_SENTINEL,
        geocodeApiKey: SECRET_SENTINEL,
      }),
    ).toEqual([]);

    expect(
      validateSectionValues("analytics.ga4", {
        ga4ServiceAccountJson:
          '{"type":"service_account","client_email":"ga4@example.test"}',
        ga4PropertyId: "properties/123456789",
      }),
    ).toEqual([]);

    expect(
      validateSectionValues("integrations.shipping", {
        preferredProvider: "shipstation",
        liveRatesEnabled: true,
        fallbackToManualRates: true,
        fallbackMessage: "Manual rates are available.",
        recommendationStrategy: "best_value_weighted",
        quoteCacheTtlSeconds: 300,
        defaultPackageWeightOz: 16,
        shipFromLine1: "1 Admin Way",
        shipFromCity: "Bend",
        shipFromState: "OR",
        shipFromPostalCode: "97701",
        shipFromCountryCode: "US",
      }),
    ).toEqual([]);
  });

  test("rejects malformed setup-critical provider values", () => {
    const tooLong = "x".repeat(501);

    expect(
      validateSectionValues("email", {
        resendApiKey: tooLong,
        webhookSecret: 123,
      }).map((error) => error.field),
    ).toEqual(["resendApiKey", "webhookSecret"]);

    expect(
      validateSectionValues("integrations.clerk", {
        clerkJwtIssuerDomain: "not-a-url",
      }).map((error) => error.field),
    ).toEqual(["clerkJwtIssuerDomain"]);

    expect(
      validateSectionValues("commerce.payments", {
        stripeMode: "live",
        paypalMode: "test",
        subscriptionChargingEnabled: "yes",
        taxProviderMode: "manual",
      }).map((error) => error.field),
    ).toEqual([
      "stripeMode",
      "paypalMode",
      "subscriptionChargingEnabled",
      "taxProviderMode",
    ]);

    expect(
      validateSectionValues("analytics.ga4", {
        ga4ServiceAccountJson: "{not json}",
      }).map((error) => error.field),
    ).toEqual(["ga4ServiceAccountJson"]);

    expect(
      validateSectionValues("integrations.shipping", {
        preferredProvider: "unknown",
        liveRatesEnabled: "true",
        quoteCacheTtlSeconds: 90000,
        defaultPackageWeightOz: -1,
      }).map((error) => error.field),
    ).toEqual([
      "preferredProvider",
      "liveRatesEnabled",
      "quoteCacheTtlSeconds",
      "defaultPackageWeightOz",
    ]);
  });
});
