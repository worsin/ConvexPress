export type SettingsData = Record<string, unknown> | null | undefined;

export type Requirement = {
  label: string;
  configured: boolean;
  detail?: string;
  optional?: boolean;
};

export type SetupStatus = "ready" | "partial" | "needed" | "manual";

export type SetupChecklistCard = {
  id: string;
  title: string;
  description: string;
  route?: string;
  providerHref?: string;
  requirements: Requirement[];
};

export type ServerEnvironmentKey = {
  name: string;
  detail?: string;
  optional?: boolean;
};

export type ShippingOverview =
  | {
      integrationSettings?: Record<string, unknown>;
      providers?: Array<{
        provider: string;
        secretStored?: boolean;
        connection?: { status?: string } | null;
      }>;
    }
  | null
  | undefined;

export const SECRET_SENTINEL = "__set__";

export const SERVER_ENVIRONMENT_KEYS: ServerEnvironmentKey[] = [
  {
    name: "AUTH_PRIVATE_KEY",
    detail: "Signs local admin login tokens.",
  },
  {
    name: "AUTH_ISSUER_URL",
    detail: "Convex site URL used by the JWT issuer and JWKS endpoint.",
  },
  {
    name: "AUTH_ALLOWED_ORIGINS",
    detail: "Comma-separated admin web origins that can call /auth endpoints.",
  },
  {
    name: "AUTH_ADMIN_ORIGIN",
    detail: "Optional single-origin alias for hosted admin installs.",
    optional: true,
  },
  {
    name: "AUTH_ALLOW_LOCALHOST_ORIGINS",
    detail: "Set intentionally when local browser origins should be allowed.",
    optional: true,
  },
  {
    name: "AUTH_ALLOW_NULL_ORIGIN",
    detail: "Required for packaged desktop apps that load from file://.",
  },
  {
    name: "SHIPPING_PROVIDER_ENCRYPTION_KEY",
    detail: "Encrypts stored shipping carrier credentials.",
  },
];

export function hasSettingValue(section: SettingsData, key: string): boolean {
  const value = section?.[key];
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined && value !== false;
}

export function requiredProgress(requirements: Requirement[]) {
  const required = requirements.filter((requirement) => !requirement.optional);
  const configured = required.filter((requirement) => requirement.configured);
  return { total: required.length, configured: configured.length };
}

export function cardStatus(card: { requirements: Requirement[] }): SetupStatus {
  const { total, configured } = requiredProgress(card.requirements);
  if (total === 0) return "manual";
  if (configured === total) return "ready";
  if (configured > 0) return "partial";
  return "needed";
}

export function providerSecretCount(shipping: ShippingOverview) {
  return (shipping?.providers ?? []).filter((provider) => provider.secretStored)
    .length;
}

export function connectedProviderCount(shipping: ShippingOverview) {
  return (shipping?.providers ?? []).filter(
    (provider) => provider.connection?.status === "connected",
  ).length;
}

export function hasShipFromAddress(shipping: ShippingOverview) {
  const values = shipping?.integrationSettings ?? {};
  return [
    "shipFromLine1",
    "shipFromCity",
    "shipFromState",
    "shipFromPostalCode",
    "shipFromCountryCode",
  ].every((key) => typeof values[key] === "string" && String(values[key]).trim());
}

export function buildSetupChecklistCards({
  email,
  clerk,
  searchSettings,
  ai,
  payments,
  google,
  ga4,
  shipping,
}: {
  email: SettingsData;
  clerk: SettingsData;
  searchSettings: SettingsData;
  ai: SettingsData;
  payments: SettingsData;
  google: SettingsData;
  ga4: SettingsData;
  shipping: ShippingOverview;
}): SetupChecklistCard[] {
  const shippingSecrets = providerSecretCount(shipping);
  const shippingConnected = connectedProviderCount(shipping);

  return [
    {
      id: "email",
      title: "Resend email delivery",
      description: "Transactional mail, invites, notifications, receipts, and digest delivery.",
      route: "/settings/email",
      providerHref: "https://resend.com/api-keys",
      requirements: [
        {
          label: "resendApiKey",
          configured: hasSettingValue(email, "resendApiKey"),
        },
        {
          label: "webhookSecret",
          configured: hasSettingValue(email, "webhookSecret"),
        },
        {
          label: "fromAddress",
          configured: hasSettingValue(email, "fromAddress"),
        },
      ],
    },
    {
      id: "clerk",
      title: "Clerk website auth",
      description: "Public website sign-up, sign-in, Clerk JWT validation, and user webhooks.",
      route: "/settings/integrations/clerk",
      providerHref: "https://dashboard.clerk.com/",
      requirements: [
        {
          label: "clerkSecretKey",
          configured: hasSettingValue(clerk, "clerkSecretKey"),
        },
        {
          label: "clerkWebhookSecret",
          configured: hasSettingValue(clerk, "clerkWebhookSecret"),
        },
        {
          label: "clerkJwtIssuerDomain",
          configured: hasSettingValue(clerk, "clerkJwtIssuerDomain"),
        },
      ],
    },
    {
      id: "search",
      title: "Meilisearch",
      description: "Full-text search, indexing, analytics, and support/search experiences.",
      route: "/settings/search",
      providerHref: "https://cloud.meilisearch.com/",
      requirements: [
        {
          label: "meilisearchHost",
          configured: hasSettingValue(searchSettings, "meilisearchHost"),
        },
        {
          label: "meilisearchApiKey",
          configured: hasSettingValue(searchSettings, "meilisearchApiKey"),
        },
      ],
    },
    {
      id: "ai",
      title: "AI providers",
      description: "Content generation, block editing, image generation, and research tools.",
      route: "/settings/ai",
      providerHref: "https://openrouter.ai/settings/keys",
      requirements: [
        {
          label: "apiKey",
          configured: hasSettingValue(ai, "apiKey"),
          detail: String(ai?.provider ?? "openrouter"),
        },
        {
          label: "tavilyApiKey",
          configured: hasSettingValue(ai, "tavilyApiKey"),
        },
        {
          label: "imageApiKey",
          configured: hasSettingValue(ai, "imageApiKey"),
          optional: true,
        },
      ],
    },
    {
      id: "stripe",
      title: "Stripe payments",
      description: "Card payments, subscription renewals, refunds, and Stripe webhook handling.",
      route: "/settings/integrations/stripe",
      providerHref: "https://dashboard.stripe.com/apikeys",
      requirements: [
        {
          label: "stripePublishableKey",
          configured: hasSettingValue(payments, "stripePublishableKey"),
        },
        {
          label: "stripeSecretKey",
          configured: hasSettingValue(payments, "stripeSecretKey"),
        },
        {
          label: "stripeWebhookSecret",
          configured: hasSettingValue(payments, "stripeWebhookSecret"),
        },
      ],
    },
    {
      id: "paypal",
      title: "PayPal checkout",
      description: "PayPal payments, capture events, refunds, and webhook verification.",
      route: "/settings/integrations/paypal",
      providerHref: "https://developer.paypal.com/dashboard/applications/sandbox",
      requirements: [
        {
          label: "paypalClientId",
          configured: hasSettingValue(payments, "paypalClientId"),
        },
        {
          label: "paypalClientSecret",
          configured: hasSettingValue(payments, "paypalClientSecret"),
        },
        {
          label: "paypalWebhookId",
          configured: hasSettingValue(payments, "paypalWebhookId"),
        },
      ],
    },
    {
      id: "google",
      title: "Google services",
      description: "Places autocomplete, geocoding, GA4 reporting, and traffic dashboards.",
      route: "/settings/integrations/google",
      providerHref: "https://console.cloud.google.com/apis/credentials",
      requirements: [
        {
          label: "placesApiKey",
          configured: hasSettingValue(google, "placesApiKey"),
        },
        {
          label: "geocodeApiKey",
          configured: hasSettingValue(google, "geocodeApiKey"),
        },
        {
          label: "ga4ServiceAccountJson",
          configured: hasSettingValue(ga4, "ga4ServiceAccountJson"),
          detail: "Configure in GA4 settings.",
          optional: true,
        },
      ],
    },
    {
      id: "ga4",
      title: "Google Analytics 4",
      description: "GA4 property connection for engagement and traffic dashboards.",
      route: "/settings/analytics/ga4",
      providerHref: "https://analytics.google.com/",
      requirements: [
        {
          label: "ga4ServiceAccountJson",
          configured: hasSettingValue(ga4, "ga4ServiceAccountJson"),
        },
        {
          label: "ga4PropertyId",
          configured: hasSettingValue(ga4, "ga4PropertyId"),
        },
      ],
    },
    {
      id: "shipping",
      title: "Shipping carriers",
      description: "ShipStation, UPS, USPS, FedEx, and DHL rates, labels, tracking, and manifests.",
      route: "/settings/integrations/shipping",
      providerHref: "https://www.shipstation.com/",
      requirements: [
        {
          label: "carrier credentials",
          configured: shippingSecrets > 0,
          detail: `${shippingSecrets} of 5 provider secrets stored`,
        },
        {
          label: "ship-from address",
          configured: hasShipFromAddress(shipping),
        },
        {
          label: "verified provider",
          configured: shippingConnected > 0,
          detail: `${shippingConnected} provider connection verified`,
          optional: true,
        },
      ],
    },
  ];
}
