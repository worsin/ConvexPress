import { describe, expect, test } from "bun:test";

import {
  SECRET_SENTINEL,
  SERVER_ENVIRONMENT_KEYS,
  SETUP_ENVIRONMENT_GROUPS,
  buildSetupChecklistCards,
  cardStatus,
  connectedProviderCount,
  hasSettingValue,
  hasShipFromAddress,
  providerSecretCount,
  shippingProviderCredentialRequirements,
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
          descriptor: {
            title: "ShipStation",
            credentialFields: [
              { label: "API Base URL", required: true },
              { label: "API Key", required: true },
            ],
          },
          secretStored: true,
          connection: { status: "connected" },
        },
        {
          provider: "ups",
          descriptor: {
            title: "UPS",
            credentialFields: [
              { label: "API Base URL", required: false },
              { label: "Client ID", required: true },
              { label: "Client Secret", required: true },
              { label: "UPS Account Number", required: true },
            ],
          },
          secretStored: false,
          connection: { status: "disconnected" },
        },
        {
          provider: "usps",
          descriptor: {
            title: "USPS",
            credentialFields: [
              { label: "API Base URL", required: false },
              { label: "Client ID", required: true },
              { label: "Client Secret", required: true },
              { label: "USPS Account Number", required: true },
            ],
          },
          secretStored: false,
          connection: { status: "disconnected" },
        },
        {
          provider: "fedex",
          descriptor: {
            title: "FedEx",
            credentialFields: [
              { label: "API Base URL", required: false },
              { label: "Client ID", required: true },
              { label: "Client Secret", required: true },
              { label: "FedEx Account Number", required: true },
            ],
          },
          secretStored: false,
          connection: { status: "disconnected" },
        },
        {
          provider: "dhl",
          descriptor: {
            title: "DHL",
            credentialFields: [
              { label: "API Base URL", required: true },
              { label: "API Username", required: true },
              { label: "API Password", required: true },
              { label: "DHL Account Number", required: true },
            ],
          },
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
      search: ["meilisearchHost", "meilisearchApiKey", "website search key"],
      ai: ["apiKey", "tavilyApiKey", "imageApiKey"],
      stripe: [
        "stripePublishableKey",
        "stripeSecretKey",
        "stripeWebhookSecret",
      ],
      paypal: [
        "paypalClientId",
        "paypalClientSecret",
        "paypalWebhookId",
        "paypalMode",
      ],
      google: ["placesApiKey", "geocodeApiKey", "ga4ServiceAccountJson"],
      ga4: ["ga4ServiceAccountJson", "ga4PropertyId"],
      shipping: [
        "carrier credentials",
        "ship-from address",
        "verified provider",
        "carrier webhook secrets",
        "ShipStation credentials",
        "UPS credentials",
        "USPS credentials",
        "FedEx credentials",
        "DHL credentials",
      ],
    });
  });

  test("shows concrete env fallback names for provider keys", () => {
    const detailByKey = Object.fromEntries(
      buildCards().flatMap((card) =>
        card.requirements.map((requirement) => [
          `${card.id}.${requirement.label}`,
          requirement.detail ?? "",
        ]),
      ),
    );

    expect(detailByKey["email.resendApiKey"]?.includes("RESEND_API_KEY")).toBe(true);
    expect(detailByKey["email.webhookSecret"]?.includes("RESEND_WEBHOOK_SECRET")).toBe(true);
    expect(detailByKey["clerk.clerkSecretKey"]?.includes("CLERK_SECRET_KEY")).toBe(true);
    expect(detailByKey["clerk.clerkWebhookSecret"]?.includes("CLERK_WEBHOOK_SECRET")).toBe(true);
    expect(
      detailByKey["clerk.clerkJwtIssuerDomain"]?.includes(
        "CLERK_JWT_ISSUER_DOMAIN",
      ),
    ).toBe(true);
    expect(detailByKey["search.meilisearchHost"]?.includes("MEILISEARCH_HOST")).toBe(true);
    expect(detailByKey["search.meilisearchApiKey"]?.includes("MEILISEARCH_API_KEY")).toBe(true);
    expect(detailByKey["search.website search key"]?.includes("VITE_MEILISEARCH_KEY")).toBe(true);
    expect(detailByKey["ai.apiKey"]?.includes("OPENROUTER_API_KEY")).toBe(true);
    expect(detailByKey["ai.apiKey"]?.includes("OPENAI_API_KEY")).toBe(true);
    expect(detailByKey["ai.apiKey"]?.includes("ANTHROPIC_API_KEY")).toBe(true);
    expect(detailByKey["ai.tavilyApiKey"]?.includes("TAVILY_API_KEY")).toBe(true);
    expect(detailByKey["ai.imageApiKey"]?.includes("OPENAI_IMAGE_API_KEY")).toBe(true);
    expect(detailByKey["stripe.stripeSecretKey"]?.includes("STRIPE_SECRET_KEY")).toBe(true);
    expect(
      detailByKey["stripe.stripeWebhookSecret"]?.includes(
        "STRIPE_WEBHOOK_SECRET",
      ),
    ).toBe(true);
    expect(detailByKey["paypal.paypalClientId"]?.includes("PAYPAL_CLIENT_ID")).toBe(true);
    expect(detailByKey["paypal.paypalClientSecret"]?.includes("PAYPAL_CLIENT_SECRET")).toBe(true);
    expect(detailByKey["paypal.paypalWebhookId"]?.includes("PAYPAL_WEBHOOK_ID")).toBe(true);
    expect(detailByKey["paypal.paypalMode"]?.includes("PAYPAL_MODE")).toBe(true);
    expect(detailByKey["google.placesApiKey"]?.includes("GOOGLE_PLACES_API_KEY")).toBe(true);
    expect(detailByKey["google.geocodeApiKey"]?.includes("geocoding")).toBe(true);
    expect(detailByKey["ga4.ga4ServiceAccountJson"]?.includes("GA4_SERVICE_ACCOUNT_JSON")).toBe(true);
    expect(detailByKey["ga4.ga4PropertyId"]?.includes("GA4_PROPERTY_ID")).toBe(true);
    expect(
      detailByKey["shipping.carrier webhook secrets"]?.includes(
        "SHIPSTATION_WEBHOOK_SECRET",
      ),
    ).toBe(true);
  });

  test("lists every setup environment group needed for install and full feature setup", () => {
    expect(SETUP_ENVIRONMENT_GROUPS.map((group) => group.id)).toEqual([
      "deployment",
      "admin-app",
      "backend",
      "website-app",
    ]);

    const keysByGroup = Object.fromEntries(
      SETUP_ENVIRONMENT_GROUPS.map((group) => [
        group.id,
        group.keys.map((key) => key.name),
      ]),
    );

    expect(keysByGroup).toEqual({
      deployment: [
        "CONVEX_DEPLOYMENT",
        "CONVEX_DEPLOY_KEY",
        "CONVEX_URL",
        "CONVEX_SITE_URL",
      ],
      "admin-app": [
        "VITE_CONVEX_URL",
        "VITE_CONVEX_SITE_URL",
        "VITE_CONSUMER_SITE_URL",
      ],
      backend: [
        "AUTH_PRIVATE_KEY",
        "AUTH_ISSUER_URL",
        "AUTH_ALLOWED_ORIGINS",
        "AUTH_ADMIN_ORIGIN",
        "AUTH_ALLOW_LOCALHOST_ORIGINS",
        "AUTH_ALLOW_NULL_ORIGIN",
        "FIRST_ADMIN_SETUP_SECRET",
        "SHIPPING_PROVIDER_ENCRYPTION_KEY",
        "WEBHOOK_SECRET_ENCRYPTION_KEY",
        "WP_SYNC_ENCRYPTION_KEY",
        "AIRTABLE_API_KEY",
        "AIRTABLE_BASE_ID",
        "SITE_URL",
        "FORMS_TURNSTILE_SECRET_KEY",
        "FORMS_HCAPTCHA_SECRET_KEY",
        "FORMS_RECAPTCHA_SECRET_KEY",
        "SHIPSTATION_WEBHOOK_SECRET",
        "FEDEX_WEBHOOK_SECRET",
        "UPS_WEBHOOK_SECRET",
        "MEDIA_URL_ONLY_MODE",
      ],
      "website-app": [
        "VITE_CONVEX_URL",
        "VITE_CONVEX_SITE_URL",
        "VITE_CLERK_PUBLISHABLE_KEY",
        "VITE_ADMIN_APP_URL",
        "VITE_MEILISEARCH_HOST",
        "VITE_MEILISEARCH_KEY",
        "VITE_APP_URL",
        "VITE_PUBLIC_APP_URL",
        "VITE_ALLOWED_REDIRECT_HOSTS",
      ],
    });

    expect(SERVER_ENVIRONMENT_KEYS.map((key) => key.name)).toEqual([
      "AUTH_PRIVATE_KEY",
      "AUTH_ISSUER_URL",
      "AUTH_ALLOWED_ORIGINS",
      "AUTH_ADMIN_ORIGIN",
      "AUTH_ALLOW_LOCALHOST_ORIGINS",
      "AUTH_ALLOW_NULL_ORIGIN",
      "FIRST_ADMIN_SETUP_SECRET",
      "SHIPPING_PROVIDER_ENCRYPTION_KEY",
      "WEBHOOK_SECRET_ENCRYPTION_KEY",
      "WP_SYNC_ENCRYPTION_KEY",
      "AIRTABLE_API_KEY",
      "AIRTABLE_BASE_ID",
      "SITE_URL",
      "FORMS_TURNSTILE_SECRET_KEY",
      "FORMS_HCAPTCHA_SECRET_KEY",
      "FORMS_RECAPTCHA_SECRET_KEY",
      "SHIPSTATION_WEBHOOK_SECRET",
      "FEDEX_WEBHOOK_SECRET",
      "UPS_WEBHOOK_SECRET",
      "MEDIA_URL_ONLY_MODE",
    ]);

    expect(
      SERVER_ENVIRONMENT_KEYS.find((key) => key.name === "AUTH_ALLOW_NULL_ORIGIN")
        ?.detail?.includes("file://"),
    ).toBe(true);
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

  test("lists provider-specific shipping credential fields", () => {
    const requirements = shippingProviderCredentialRequirements({
      providers: [
        {
          provider: "shipstation",
          descriptor: {
            title: "ShipStation",
            credentialFields: [
              { label: "API Base URL", required: true },
              { label: "API Key", required: true },
            ],
          },
          secretStored: true,
        },
        {
          provider: "ups",
          descriptor: {
            title: "UPS",
            credentialFields: [
              { label: "API Base URL", required: false },
              { label: "Client ID", required: true },
              { label: "Client Secret", required: true },
              { label: "UPS Account Number", required: true },
            ],
          },
          secretStored: false,
        },
      ],
    });

    expect(requirements).toEqual([
      {
        label: "ShipStation credentials",
        configured: true,
        detail: "API Base URL, API Key",
        optional: true,
      },
      {
        label: "UPS credentials",
        configured: false,
        detail: "Client ID, Client Secret, UPS Account Number",
        optional: true,
      },
    ]);
  });
});
