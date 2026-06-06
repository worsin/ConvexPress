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

export type SetupEnvironmentGroup = {
  id: string;
  title: string;
  description: string;
  keys: ServerEnvironmentKey[];
};

export type ShippingOverview =
  | {
      integrationSettings?: Record<string, unknown>;
      providers?: Array<{
        provider: string;
        descriptor?: {
          title?: string;
          credentialFields?: Array<{
            label: string;
            required: boolean;
          }>;
        };
        secretStored?: boolean;
        connection?: { status?: string } | null;
      }>;
    }
  | null
  | undefined;

export const SECRET_SENTINEL = "__set__";

export const DEPLOYMENT_ENVIRONMENT_KEYS: ServerEnvironmentKey[] = [
  {
    name: "CONVEX_DEPLOYMENT",
    detail: "Convex CLI deployment identifier for deploy and setup jobs.",
  },
  {
    name: "CONVEX_DEPLOY_KEY",
    detail: "Deploy key used by setup automation and non-interactive deploys.",
  },
  {
    name: "CONVEX_URL",
    detail: "Convex realtime URL used by backend tooling.",
  },
  {
    name: "CONVEX_SITE_URL",
    detail: "Convex HTTP actions URL for auth, analytics, and webhooks.",
  },
];

export const ADMIN_APP_ENVIRONMENT_KEYS: ServerEnvironmentKey[] = [
  {
    name: "VITE_CONVEX_URL",
    detail: "Admin web client Convex realtime URL.",
  },
  {
    name: "VITE_CONVEX_SITE_URL",
    detail: "Admin web client URL for /auth/login, /auth/refresh, and /auth/logout.",
  },
  {
    name: "VITE_CONSUMER_SITE_URL",
    detail: "Public website URL used for website sign-in and cross-app links.",
    optional: true,
  },
];

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
    name: "FIRST_ADMIN_SETUP_SECRET",
    detail: "One-time first-admin setup token gate; the desktop setup wizard generates and rotates it.",
    optional: true,
  },
  {
    name: "SHIPPING_PROVIDER_ENCRYPTION_KEY",
    detail: "Encrypts stored shipping carrier credentials.",
  },
  {
    name: "WEBHOOK_SECRET_ENCRYPTION_KEY",
    detail: "Encrypts outbound webhook signing secrets.",
  },
  {
    name: "WP_SYNC_ENCRYPTION_KEY",
    detail: "Encrypts WordPress and WooCommerce migration credentials.",
    optional: true,
  },
  {
    name: "AIRTABLE_API_KEY",
    detail: "Airtable personal access token for blueprint/system sync jobs.",
    optional: true,
  },
  {
    name: "AIRTABLE_BASE_ID",
    detail: "Airtable base ID used by sync helpers.",
    optional: true,
  },
  {
    name: "SITE_URL",
    detail: "Public site URL used for payment return URLs and email links.",
    optional: true,
  },
  {
    name: "FORMS_TURNSTILE_SECRET_KEY",
    detail: "Cloudflare Turnstile server-side CAPTCHA secret.",
    optional: true,
  },
  {
    name: "FORMS_HCAPTCHA_SECRET_KEY",
    detail: "hCaptcha server-side CAPTCHA secret.",
    optional: true,
  },
  {
    name: "FORMS_RECAPTCHA_SECRET_KEY",
    detail: "reCAPTCHA server-side CAPTCHA secret.",
    optional: true,
  },
  {
    name: "SHIPSTATION_WEBHOOK_SECRET",
    detail: "Optional ShipStation webhook fallback secret; per-connection secrets can replace it.",
    optional: true,
  },
  {
    name: "FEDEX_WEBHOOK_SECRET",
    detail: "Optional FedEx webhook fallback secret; per-connection secrets can replace it.",
    optional: true,
  },
  {
    name: "UPS_WEBHOOK_SECRET",
    detail: "Optional UPS webhook fallback secret; per-connection secrets can replace it.",
    optional: true,
  },
  {
    name: "MEDIA_URL_ONLY_MODE",
    detail: "Optional WordPress media migration mode that keeps source media URLs instead of downloading files.",
    optional: true,
  },
];

export const WEBSITE_ENVIRONMENT_KEYS: ServerEnvironmentKey[] = [
  {
    name: "VITE_CONVEX_URL",
    detail: "Website Convex realtime URL; must point at the admin-owned deployment.",
  },
  {
    name: "VITE_CONVEX_SITE_URL",
    detail: "Optional Convex HTTP actions URL for analytics tracking.",
    optional: true,
  },
  {
    name: "VITE_CLERK_PUBLISHABLE_KEY",
    detail: "Clerk publishable key for public website sign-up and sign-in.",
  },
  {
    name: "VITE_ADMIN_APP_URL",
    detail: "Admin app URL used by the website admin bar and edit links.",
    optional: true,
  },
  {
    name: "VITE_MEILISEARCH_HOST",
    detail: "Public website Meilisearch host.",
    optional: true,
  },
  {
    name: "VITE_MEILISEARCH_KEY",
    detail: "Meilisearch search-only key safe for browser exposure.",
    optional: true,
  },
  {
    name: "VITE_APP_URL",
    detail: "Public website URL used for canonical URLs and social metadata.",
    optional: true,
  },
  {
    name: "VITE_PUBLIC_APP_URL",
    detail: "Alternate public website URL fallback for SEO helpers.",
    optional: true,
  },
  {
    name: "VITE_ALLOWED_REDIRECT_HOSTS",
    detail: "Comma-separated redirect allowlist for website auth return URLs.",
    optional: true,
  },
];

export const SETUP_ENVIRONMENT_GROUPS: SetupEnvironmentGroup[] = [
  {
    id: "deployment",
    title: "Convex deployment",
    description: "Local setup and deploy-time values for the admin-owned backend.",
    keys: DEPLOYMENT_ENVIRONMENT_KEYS,
  },
  {
    id: "admin-app",
    title: "Admin app environment",
    description: "Browser-visible Vite values used by the admin app and desktop shell.",
    keys: ADMIN_APP_ENVIRONMENT_KEYS,
  },
  {
    id: "backend",
    title: "Backend server environment",
    description: "Convex environment variables for auth, encryption, sync, forms, and webhooks.",
    keys: SERVER_ENVIRONMENT_KEYS,
  },
  {
    id: "website-app",
    title: "Website app environment",
    description: "Public website variables for Clerk, Convex, search, SEO, and admin links.",
    keys: WEBSITE_ENVIRONMENT_KEYS,
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

export function shippingProviderCredentialRequirements(
  shipping: ShippingOverview,
): Requirement[] {
  return (shipping?.providers ?? []).map((provider) => {
    const title = provider.descriptor?.title ?? provider.provider;
    const requiredFields =
      provider.descriptor?.credentialFields
        ?.filter((field) => field.required)
        .map((field) => field.label) ?? [];
    const detail = requiredFields.length
      ? requiredFields.join(", ")
      : "Provider credential fields";

    return {
      label: `${title} credentials`,
      configured: Boolean(provider.secretStored),
      detail,
      optional: true,
    };
  });
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
  kbSearch,
  supportAi,
  payments,
  google,
  ga4,
  shipping,
}: {
  email: SettingsData;
  clerk: SettingsData;
  searchSettings: SettingsData;
  ai: SettingsData;
  kbSearch: SettingsData;
  supportAi: SettingsData;
  payments: SettingsData;
  google: SettingsData;
  ga4: SettingsData;
  shipping: ShippingOverview;
}): SetupChecklistCard[] {
  const shippingSecrets = providerSecretCount(shipping);
  const shippingConnected = connectedProviderCount(shipping);
  const shippingProviderRequirements =
    shippingProviderCredentialRequirements(shipping);

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
          detail: "Env fallback: RESEND_API_KEY",
        },
        {
          label: "webhookSecret",
          configured: hasSettingValue(email, "webhookSecret"),
          detail: "Env fallback: RESEND_WEBHOOK_SECRET",
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
          detail: "Env fallback: CLERK_SECRET_KEY",
        },
        {
          label: "clerkWebhookSecret",
          configured: hasSettingValue(clerk, "clerkWebhookSecret"),
          detail: "Env fallback: CLERK_WEBHOOK_SECRET",
        },
        {
          label: "clerkJwtIssuerDomain",
          configured: hasSettingValue(clerk, "clerkJwtIssuerDomain"),
          detail: "Env fallback: CLERK_JWT_ISSUER_DOMAIN",
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
          detail: "Env fallback: MEILISEARCH_HOST",
        },
        {
          label: "meilisearchApiKey",
          configured: hasSettingValue(searchSettings, "meilisearchApiKey"),
          detail: "Env fallback: MEILISEARCH_API_KEY",
        },
        {
          label: "website search key",
          configured: false,
          detail: "Website env: VITE_MEILISEARCH_HOST / VITE_MEILISEARCH_KEY",
          optional: true,
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
          detail: `Provider: ${String(ai?.provider ?? "openrouter")}. Env fallback: OPENROUTER_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY`,
        },
        {
          label: "tavilyApiKey",
          configured: hasSettingValue(ai, "tavilyApiKey"),
          detail: "Env fallback: TAVILY_API_KEY",
        },
        {
          label: "imageApiKey",
          configured: hasSettingValue(ai, "imageApiKey"),
          detail: "Env fallback: OPENAI_IMAGE_API_KEY / OPENAI_API_KEY",
          optional: true,
        },
      ],
    },
    {
      id: "kb-search",
      title: "Knowledge base search and RAG",
      description: "Help-center search indexing, semantic retrieval, and AI-assisted KB answers.",
      route: "/kb/settings",
      providerHref: "https://cloud.meilisearch.com/",
      requirements: [
        {
          label: "kb.meilisearchUrl",
          configured: hasSettingValue(kbSearch, "meilisearchUrl"),
          detail: "KB Settings > Search. Can point at the same Meilisearch deployment as global search.",
        },
        {
          label: "kb.meilisearchApiKey",
          configured: hasSettingValue(kbSearch, "meilisearchApiKey"),
          detail: "Stored key for KB article indexing and lookup.",
        },
        {
          label: "kb.ragApiKey",
          configured: hasSettingValue(kbSearch, "ragApiKey"),
          detail: `Provider: ${String(kbSearch?.ragProvider ?? "openai")}. OpenAI or Anthropic key for KB RAG.`,
        },
        {
          label: "kb.ragModel",
          configured: hasSettingValue(kbSearch, "ragModel"),
          detail: "Embedding or RAG model used by KB semantic search.",
          optional: true,
        },
      ],
    },
    {
      id: "support-ai",
      title: "Support AI deflection",
      description: "Support widget answers, KB handoff, Meilisearch lookup, and RAG escalation.",
      route: "/support/settings",
      providerHref: "https://platform.openai.com/api-keys",
      requirements: [
        {
          label: "support.aiProvider",
          configured: hasSettingValue(supportAi, "aiProvider"),
          detail: "OpenAI or Anthropic provider for support answers.",
        },
        {
          label: "support.aiApiKey",
          configured: hasSettingValue(supportAi, "aiApiKey"),
          detail: "Stored provider API key for support answer generation.",
        },
        {
          label: "support.aiModel",
          configured: hasSettingValue(supportAi, "aiModel"),
          detail: "Model used by support answer generation.",
        },
        {
          label: "support.meilisearchUrl",
          configured: hasSettingValue(supportAi, "meilisearchUrl"),
          detail: "Support settings search URL; can reuse the global Meilisearch host.",
          optional: true,
        },
        {
          label: "support.meilisearchApiKey",
          configured: hasSettingValue(supportAi, "meilisearchApiKey"),
          detail: "Search key for support deflection lookup.",
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
          detail: "Stored setting used by checkout and form payment UI.",
        },
        {
          label: "stripeSecretKey",
          configured: hasSettingValue(payments, "stripeSecretKey"),
          detail: "Env fallback: STRIPE_SECRET_KEY",
        },
        {
          label: "stripeWebhookSecret",
          configured: hasSettingValue(payments, "stripeWebhookSecret"),
          detail: "Env fallback: STRIPE_WEBHOOK_SECRET",
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
          detail: "Env fallback: PAYPAL_CLIENT_ID",
        },
        {
          label: "paypalClientSecret",
          configured: hasSettingValue(payments, "paypalClientSecret"),
          detail: "Env fallback: PAYPAL_CLIENT_SECRET",
        },
        {
          label: "paypalWebhookId",
          configured: hasSettingValue(payments, "paypalWebhookId"),
          detail: "Env fallback: PAYPAL_WEBHOOK_ID",
        },
        {
          label: "paypalMode",
          configured: hasSettingValue(payments, "paypalMode"),
          detail: "sandbox or production. Env fallback: PAYPAL_MODE",
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
          detail: "Env fallback: GOOGLE_PLACES_API_KEY",
        },
        {
          label: "geocodeApiKey",
          configured: hasSettingValue(google, "geocodeApiKey"),
          detail: "Stored setting for geocoding integrations.",
        },
        {
          label: "ga4ServiceAccountJson",
          configured: hasSettingValue(ga4, "ga4ServiceAccountJson"),
          detail: "Configure in GA4 settings. Env fallback: GA4_SERVICE_ACCOUNT_JSON",
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
          detail: "Env fallback: GA4_SERVICE_ACCOUNT_JSON",
        },
        {
          label: "ga4PropertyId",
          configured: hasSettingValue(ga4, "ga4PropertyId"),
          detail: "Env fallback: GA4_PROPERTY_ID",
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
        {
          label: "carrier webhook secrets",
          configured: false,
          detail: "Per-connection secret or env fallback: SHIPSTATION_WEBHOOK_SECRET / FEDEX_WEBHOOK_SECRET / UPS_WEBHOOK_SECRET",
          optional: true,
        },
        ...shippingProviderRequirements,
      ],
    },
  ];
}
