/**
 * Integration registry — the single description of every third-party provider
 * a ConvexPress website can be connected to.
 *
 * Consumed by:
 *   - `integrations/queries.ts`  → readiness overview (what is configured, from where)
 *   - `integrations/actions.ts`  → live verification (real API calls)
 *   - the admin "Integrations" hub, which imports this module directly so the
 *     UI never carries its own copy of provider names, fields, or env names.
 *
 * Pure TypeScript: no Convex imports, safe to import from the web app.
 *
 * Storage kinds
 *   settings  – fields live in one `settings` section (secrets encrypted at rest)
 *   shipping  – credentials live in `shipping_provider_secrets` (carrier module)
 *   env       – only Convex environment variables (no UI storage by design)
 *   link      – nothing to configure here; points at a dedicated tool
 */

export type IntegrationGroup =
  | "essentials"
  | "intelligence"
  | "commerce"
  | "analytics"
  | "protection"
  | "tooling";

export type IntegrationFieldKind =
  | "secret"
  | "text"
  | "url"
  | "email"
  | "select"
  | "json"
  | "toggle";

export interface IntegrationField {
  key: string;
  label: string;
  kind: IntegrationFieldKind;
  /** Required for the provider to count as configured. */
  required: boolean;
  /** Convex environment variable that acts as a fallback when unset. */
  env?: string;
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
  /** Value stored when the field has never been set. */
  defaultValue?: string | boolean;
}

export type IntegrationStorage =
  | { kind: "settings"; section: string }
  | { kind: "shipping"; provider: "shipstation" | "ups" | "usps" | "fedex" | "dhl" }
  | { kind: "env" }
  | { kind: "link" };

export interface IntegrationDefinition {
  id: string;
  title: string;
  group: IntegrationGroup;
  /** One line: what this connection powers. */
  description: string;
  /** Features that light up once verified. Shown as chips. */
  unlocks: string[];
  storage: IntegrationStorage;
  fields: IntegrationField[];
  /** Whether a real API call can be made to verify the credentials. */
  verifiable: boolean;
  /** Not required for launch readiness. */
  optional?: boolean;
  docsUrl?: string;
  consoleUrl?: string;
  /** Route of the full settings page (models, webhooks, advanced options). */
  advancedRoute?: string;
  /** Route of the tool that owns this connection (link storage only). */
  toolRoute?: string;
}

export const INTEGRATION_GROUPS: Array<{
  id: IntegrationGroup;
  title: string;
  blurb: string;
}> = [
  {
    id: "essentials",
    title: "Essentials",
    blurb: "What every website needs before it goes live.",
  },
  {
    id: "intelligence",
    title: "Intelligence",
    blurb: "Content generation, research, and answers.",
  },
  {
    id: "commerce",
    title: "Commerce",
    blurb: "Payments, addresses, and carriers.",
  },
  {
    id: "analytics",
    title: "Analytics",
    blurb: "Traffic and engagement reporting.",
  },
  {
    id: "protection",
    title: "Protection",
    blurb: "Spam and abuse defenses for public forms.",
  },
  {
    id: "tooling",
    title: "Tooling",
    blurb: "Migration, sync, and access for other applications.",
  },
];

const AI_PROVIDER_OPTIONS = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
];

const MODE_OPTIONS = [
  { value: "sandbox", label: "Sandbox / test" },
  { value: "production", label: "Production / live" },
];

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: "resend",
    title: "Resend email",
    group: "essentials",
    description: "Transactional mail: invites, password resets, receipts, notifications, digests.",
    unlocks: ["Invites", "Password reset", "Order receipts", "Digests"],
    storage: { kind: "settings", section: "email" },
    fields: [
      {
        key: "resendApiKey",
        label: "API key",
        kind: "secret",
        required: true,
        env: "RESEND_API_KEY",
        placeholder: "re_…",
        help: "Resend → API Keys. Full-access key so ConvexPress can send.",
      },
      {
        key: "fromAddress",
        label: "From address",
        kind: "email",
        required: true,
        placeholder: "hello@yourdomain.com",
        help: "The domain must be verified in Resend.",
      },
      { key: "fromName", label: "From name", kind: "text", required: false },
      {
        key: "webhookSecret",
        label: "Webhook signing secret",
        kind: "secret",
        required: false,
        env: "RESEND_WEBHOOK_SECRET",
        placeholder: "whsec_…",
        help: "Enables delivery and bounce tracking.",
      },
    ],
    verifiable: true,
    docsUrl: "https://resend.com/docs/api-reference/introduction",
    consoleUrl: "https://resend.com/api-keys",
    advancedRoute: "/settings/email",
  },
  {
    id: "clerk",
    title: "Clerk website auth",
    group: "essentials",
    description: "Public sign-up and sign-in for website customers, JWT validation, user webhooks.",
    unlocks: ["Customer accounts", "Checkout sign-in", "Password sync"],
    storage: { kind: "settings", section: "integrations.clerk" },
    fields: [
      {
        key: "clerkSecretKey",
        label: "Secret key",
        kind: "secret",
        required: true,
        env: "CLERK_SECRET_KEY",
        placeholder: "sk_live_… or sk_test_…",
      },
      {
        key: "clerkJwtIssuerDomain",
        label: "JWT issuer domain",
        kind: "url",
        required: true,
        env: "CLERK_JWT_ISSUER_DOMAIN",
        placeholder: "https://your-app.clerk.accounts.dev",
        help: "Clerk → JWT templates → Convex. Used to validate customer tokens.",
      },
      {
        key: "clerkWebhookSecret",
        label: "Webhook signing secret",
        kind: "secret",
        required: false,
        env: "CLERK_WEBHOOK_SECRET",
        placeholder: "whsec_…",
        help: "Keeps customer profiles in sync when they change in Clerk.",
      },
    ],
    verifiable: true,
    docsUrl: "https://clerk.com/docs",
    consoleUrl: "https://dashboard.clerk.com/",
    advancedRoute: "/settings/integrations/clerk",
  },
  {
    id: "meilisearch",
    title: "Meilisearch",
    group: "essentials",
    description: "Full-text search for posts, pages, products, and people.",
    unlocks: ["Site search", "Search analytics"],
    storage: { kind: "settings", section: "search" },
    fields: [
      {
        key: "meilisearchHost",
        label: "Host",
        kind: "url",
        required: true,
        placeholder: "https://ms-xxxx.meilisearch.io",
      },
      {
        key: "meilisearchApiKey",
        label: "Admin API key",
        kind: "secret",
        required: true,
        help: "Admin key for indexing. The website only ever receives a search-only key.",
      },
    ],
    verifiable: true,
    docsUrl: "https://www.meilisearch.com/docs",
    consoleUrl: "https://cloud.meilisearch.com/",
    advancedRoute: "/settings/search",
  },
  {
    id: "ai",
    title: "AI provider",
    group: "intelligence",
    description: "Content generation, block editing, summaries, and image generation.",
    unlocks: ["Page generation", "Block editing", "Summaries", "Images"],
    storage: { kind: "settings", section: "ai" },
    fields: [
      {
        key: "provider",
        label: "Provider",
        kind: "select",
        required: true,
        options: AI_PROVIDER_OPTIONS,
        defaultValue: "openrouter",
      },
      {
        key: "apiKey",
        label: "API key",
        kind: "secret",
        required: true,
        help: "Env fallback depends on the provider: OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.",
      },
      {
        key: "defaultModel",
        label: "Default model",
        kind: "text",
        required: false,
        placeholder: "anthropic/claude-opus-4.7",
        help: "Checked against the provider's model list during verification.",
      },
      {
        key: "imageApiKey",
        label: "Image generation key (OpenAI)",
        kind: "secret",
        required: false,
        env: "OPENAI_IMAGE_API_KEY",
        help: "Leave empty to reuse the main key when the provider is OpenAI.",
      },
    ],
    verifiable: true,
    docsUrl: "https://openrouter.ai/docs",
    consoleUrl: "https://openrouter.ai/settings/keys",
    advancedRoute: "/settings/ai",
  },
  {
    id: "tavily",
    title: "Tavily research",
    group: "intelligence",
    description: "Web research that grounds generated articles in real sources.",
    unlocks: ["Researched posts", "Source citations"],
    storage: { kind: "settings", section: "ai" },
    fields: [
      {
        key: "tavilyApiKey",
        label: "API key",
        kind: "secret",
        required: true,
        env: "TAVILY_API_KEY",
        placeholder: "tvly-…",
      },
    ],
    verifiable: true,
    optional: true,
    docsUrl: "https://docs.tavily.com/",
    consoleUrl: "https://app.tavily.com/",
    advancedRoute: "/settings/ai",
  },
  {
    id: "kb-search",
    title: "Knowledge base search",
    group: "intelligence",
    description: "Help-center indexing plus retrieval-augmented answers.",
    unlocks: ["Help-center search", "AI answers"],
    storage: { kind: "settings", section: "kb.search" },
    fields: [
      { key: "meilisearchEnabled", label: "Index articles in Meilisearch", kind: "toggle", required: false },
      {
        key: "meilisearchUrl",
        label: "Meilisearch URL",
        kind: "url",
        required: true,
        help: "Can be the same deployment as site search.",
      },
      { key: "meilisearchApiKey", label: "Meilisearch API key", kind: "secret", required: true },
      { key: "ragEnabled", label: "Answer questions with AI", kind: "toggle", required: false },
      {
        key: "ragProvider",
        label: "Answer provider",
        kind: "select",
        required: false,
        options: [
          { value: "openai", label: "OpenAI" },
          { value: "anthropic", label: "Anthropic" },
        ],
        defaultValue: "openai",
      },
      { key: "ragApiKey", label: "Answer provider key", kind: "secret", required: false },
      { key: "ragModel", label: "Answer model", kind: "text", required: false },
    ],
    verifiable: true,
    optional: true,
    docsUrl: "https://www.meilisearch.com/docs",
    advancedRoute: "/kb/settings",
  },
  {
    id: "support-ai",
    title: "Support AI",
    group: "intelligence",
    description: "Answers inside the support widget before a ticket is opened.",
    unlocks: ["Ticket deflection", "Suggested articles"],
    storage: { kind: "settings", section: "support.ai" },
    fields: [
      {
        key: "aiProvider",
        label: "Provider",
        kind: "select",
        required: true,
        options: [
          { value: "openai", label: "OpenAI" },
          { value: "anthropic", label: "Anthropic" },
        ],
      },
      { key: "aiApiKey", label: "API key", kind: "secret", required: true },
      { key: "aiModel", label: "Model", kind: "text", required: true, placeholder: "gpt-4o-mini" },
      { key: "meilisearchEnabled", label: "Search the knowledge base", kind: "toggle", required: false },
      { key: "meilisearchUrl", label: "Meilisearch URL", kind: "url", required: false },
      { key: "meilisearchApiKey", label: "Meilisearch API key", kind: "secret", required: false },
    ],
    verifiable: true,
    optional: true,
    advancedRoute: "/support/settings",
  },
  {
    id: "stripe",
    title: "Stripe",
    group: "commerce",
    description: "Card payments, subscriptions, refunds, tax, and form payments.",
    unlocks: ["Checkout", "Subscriptions", "Refunds", "Form payments"],
    storage: { kind: "settings", section: "commerce.payments" },
    fields: [
      {
        key: "stripeMode",
        label: "Mode",
        kind: "select",
        required: true,
        options: MODE_OPTIONS,
        defaultValue: "sandbox",
      },
      {
        key: "stripePublishableKey",
        label: "Publishable key",
        kind: "text",
        required: true,
        placeholder: "pk_test_… / pk_live_…",
      },
      {
        key: "stripeSecretKey",
        label: "Secret key",
        kind: "secret",
        required: true,
        env: "STRIPE_SECRET_KEY",
        placeholder: "sk_test_… / sk_live_…",
      },
      {
        key: "stripeWebhookSecret",
        label: "Webhook signing secret",
        kind: "secret",
        required: false,
        env: "STRIPE_WEBHOOK_SECRET",
        placeholder: "whsec_…",
        help: "Required for subscription renewals and asynchronous payment updates.",
      },
    ],
    verifiable: true,
    docsUrl: "https://docs.stripe.com/keys",
    consoleUrl: "https://dashboard.stripe.com/apikeys",
    advancedRoute: "/settings/integrations/stripe",
  },
  {
    id: "paypal",
    title: "PayPal",
    group: "commerce",
    description: "PayPal checkout, captures, refunds, and webhook verification.",
    unlocks: ["PayPal checkout", "Refunds"],
    storage: { kind: "settings", section: "commerce.payments" },
    fields: [
      {
        key: "paypalMode",
        label: "Mode",
        kind: "select",
        required: true,
        options: MODE_OPTIONS,
        env: "PAYPAL_MODE",
        defaultValue: "sandbox",
      },
      { key: "paypalClientId", label: "Client ID", kind: "text", required: true, env: "PAYPAL_CLIENT_ID" },
      { key: "paypalClientSecret", label: "Client secret", kind: "secret", required: true, env: "PAYPAL_CLIENT_SECRET" },
      {
        key: "paypalWebhookId",
        label: "Webhook ID",
        kind: "text",
        required: false,
        env: "PAYPAL_WEBHOOK_ID",
        help: "From the PayPal app's webhook configuration.",
      },
    ],
    verifiable: true,
    optional: true,
    docsUrl: "https://developer.paypal.com/api/rest/",
    consoleUrl: "https://developer.paypal.com/dashboard/applications/sandbox",
    advancedRoute: "/settings/integrations/paypal",
  },
  {
    id: "google",
    title: "Google Places",
    group: "commerce",
    description: "Address autocomplete and geocoding at checkout.",
    unlocks: ["Address autocomplete", "Delivery radius"],
    storage: { kind: "settings", section: "integrations.google" },
    fields: [
      {
        key: "placesApiKey",
        label: "Places API key",
        kind: "secret",
        required: true,
        env: "GOOGLE_PLACES_API_KEY",
        placeholder: "AIza…",
      },
      {
        key: "geocodeApiKey",
        label: "Geocoding API key",
        kind: "secret",
        required: false,
        help: "Leave empty to reuse the Places key.",
      },
    ],
    verifiable: true,
    optional: true,
    docsUrl: "https://developers.google.com/maps/documentation/places/web-service",
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    advancedRoute: "/settings/integrations/google",
  },
  {
    id: "shipstation",
    title: "ShipStation",
    group: "commerce",
    description: "Multi-carrier rates, labels, tracking, and manifests.",
    unlocks: ["Live rates", "Labels", "Tracking"],
    storage: { kind: "shipping", provider: "shipstation" },
    fields: [],
    verifiable: true,
    optional: true,
    consoleUrl: "https://www.shipstation.com/",
    advancedRoute: "/settings/integrations/shipping/shipstation",
  },
  {
    id: "ups",
    title: "UPS",
    group: "commerce",
    description: "Direct UPS rates, labels, and tracking through OAuth.",
    unlocks: ["UPS rates", "Labels", "Tracking"],
    storage: { kind: "shipping", provider: "ups" },
    fields: [],
    verifiable: true,
    optional: true,
    consoleUrl: "https://developer.ups.com/",
    advancedRoute: "/settings/integrations/shipping/ups",
  },
  {
    id: "usps",
    title: "USPS",
    group: "commerce",
    description: "USPS address validation, rates, and labels.",
    unlocks: ["Address validation", "USPS rates"],
    storage: { kind: "shipping", provider: "usps" },
    fields: [],
    verifiable: true,
    optional: true,
    consoleUrl: "https://developer.usps.com/",
    advancedRoute: "/settings/integrations/shipping/usps",
  },
  {
    id: "fedex",
    title: "FedEx",
    group: "commerce",
    description: "FedEx rates, labels, and tracking.",
    unlocks: ["FedEx rates", "Labels"],
    storage: { kind: "shipping", provider: "fedex" },
    fields: [],
    verifiable: true,
    optional: true,
    consoleUrl: "https://developer.fedex.com/",
    advancedRoute: "/settings/integrations/shipping/fedex",
  },
  {
    id: "dhl",
    title: "DHL",
    group: "commerce",
    description: "DHL Express rates and labels.",
    unlocks: ["DHL rates", "Labels"],
    storage: { kind: "shipping", provider: "dhl" },
    fields: [],
    verifiable: true,
    optional: true,
    consoleUrl: "https://developer.dhl.com/",
    advancedRoute: "/settings/integrations/shipping/dhl",
  },
  {
    id: "ga4",
    title: "Google Analytics 4",
    group: "analytics",
    description: "Traffic and engagement reports on the dashboard.",
    unlocks: ["Traffic dashboard", "Top pages", "Engagement"],
    storage: { kind: "settings", section: "analytics.ga4" },
    fields: [
      {
        key: "ga4PropertyId",
        label: "Property ID",
        kind: "text",
        required: true,
        env: "GA4_PROPERTY_ID",
        placeholder: "properties/123456789",
      },
      {
        key: "ga4ServiceAccountJson",
        label: "Service account JSON",
        kind: "json",
        required: true,
        env: "GA4_SERVICE_ACCOUNT_JSON",
        help: "Grant the service account Viewer access on the GA4 property.",
      },
    ],
    verifiable: true,
    optional: true,
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1",
    consoleUrl: "https://analytics.google.com/",
    advancedRoute: "/settings/analytics/ga4",
  },
  {
    id: "captcha",
    title: "CAPTCHA",
    group: "protection",
    description: "Cloudflare Turnstile, hCaptcha, or reCAPTCHA for public forms.",
    unlocks: ["Spam-protected forms"],
    storage: { kind: "env" },
    fields: [
      { key: "FORMS_TURNSTILE_SECRET_KEY", label: "Turnstile secret", kind: "secret", required: false, env: "FORMS_TURNSTILE_SECRET_KEY" },
      { key: "FORMS_HCAPTCHA_SECRET_KEY", label: "hCaptcha secret", kind: "secret", required: false, env: "FORMS_HCAPTCHA_SECRET_KEY" },
      { key: "FORMS_RECAPTCHA_SECRET_KEY", label: "reCAPTCHA secret", kind: "secret", required: false, env: "FORMS_RECAPTCHA_SECRET_KEY" },
    ],
    verifiable: true,
    optional: true,
    docsUrl: "https://developers.cloudflare.com/turnstile/",
    advancedRoute: "/forms/settings",
  },
  {
    id: "airtable",
    title: "Airtable sync",
    group: "tooling",
    description: "Blueprint and system sync jobs against an Airtable base.",
    unlocks: ["System sync"],
    storage: { kind: "env" },
    fields: [
      { key: "AIRTABLE_API_KEY", label: "Personal access token", kind: "secret", required: true, env: "AIRTABLE_API_KEY" },
      { key: "AIRTABLE_BASE_ID", label: "Base ID", kind: "text", required: false, env: "AIRTABLE_BASE_ID" },
    ],
    verifiable: true,
    optional: true,
    docsUrl: "https://airtable.com/developers/web/api/introduction",
  },
  {
    id: "wordpress",
    title: "WordPress / WooCommerce",
    group: "tooling",
    description: "Migrate content, media, and orders from an existing WordPress site.",
    unlocks: ["Content import", "WooCommerce sync"],
    storage: { kind: "link" },
    fields: [],
    verifiable: false,
    optional: true,
    toolRoute: "/tools/wordpress-sync",
  },
  {
    id: "access",
    title: "ConvexPress access",
    group: "tooling",
    description: "API keys and outbound webhooks for other applications that talk to this website.",
    unlocks: ["REST API", "Webhooks"],
    storage: { kind: "link" },
    fields: [],
    verifiable: false,
    optional: true,
    toolRoute: "/api-keys",
  },
];

export const INTEGRATION_IDS: string[] = INTEGRATIONS.map((entry: IntegrationDefinition) => entry.id);

export function getIntegration(id: string): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((entry: IntegrationDefinition) => entry.id === id);
}

/** Environment variables the runtime reads, grouped for the environment panel. */
export const RUNTIME_ENVIRONMENT: Array<{
  group: string;
  description: string;
  keys: Array<{ name: string; detail: string; optional?: boolean }>;
}> = [
  {
    group: "Security",
    description: "Keys that protect secrets at rest and sign operator sessions.",
    keys: [
      {
        name: "SHIPPING_PROVIDER_ENCRYPTION_KEY",
        detail: "Encrypts every stored integration secret and shipping credential. Without it secrets are only base64-encoded.",
      },
      { name: "WEBHOOK_SECRET_ENCRYPTION_KEY", detail: "Encrypts outbound webhook signing secrets." },
      { name: "WP_SYNC_ENCRYPTION_KEY", detail: "Encrypts WordPress and WooCommerce migration credentials.", optional: true },
      { name: "AUTH_PRIVATE_KEY", detail: "P-256 key that signs local admin login tokens." },
      { name: "AUTH_ISSUER_URL", detail: "Convex site URL used as the JWT issuer." },
      { name: "AUTH_ALLOWED_ORIGINS", detail: "Admin origins allowed to call the auth endpoints." },
      { name: "AUTH_ALLOW_NULL_ORIGIN", detail: "Required for packaged desktop apps.", optional: true },
    ],
  },
  {
    group: "Setup",
    description: "First-run and development gates.",
    keys: [
      { name: "FIRST_ADMIN_SETUP_SECRET", detail: "One-time token that gates first-admin setup.", optional: true },
      { name: "CONVEXPRESS_ALLOW_PUBLIC_FIRST_ADMIN_SETUP", detail: "Web-only escape hatch for tokenless setup. Keep off in production.", optional: true },
      { name: "CONVEXPRESS_ENABLE_DEV_INTERNALS", detail: "Dev-only fixture helpers. Never enable in production.", optional: true },
      { name: "SITE_URL", detail: "Public site URL for payment return links and email links.", optional: true },
      { name: "MEDIA_URL_ONLY_MODE", detail: "Keep source media URLs during WordPress migration.", optional: true },
    ],
  },
];
