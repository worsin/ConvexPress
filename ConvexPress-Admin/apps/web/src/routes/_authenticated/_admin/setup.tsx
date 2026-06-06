import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  CreditCard,
  Database,
  ExternalLink,
  Globe,
  KeyRound,
  LockKeyhole,
  Mail,
  Search,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import Loader from "@/components/loader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCan } from "@/hooks/useCan";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/setup")({
  component: FirstRunSetupPage,
});

type SettingsData = Record<string, unknown> | null | undefined;
type Requirement = {
  label: string;
  configured: boolean;
  detail?: string;
  optional?: boolean;
};
type SetupStatus = "ready" | "partial" | "needed" | "manual";
type SetupCard = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  route?: string;
  providerHref?: string;
  requirements: Requirement[];
};

type ShippingOverview =
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

const SECRET_SENTINEL = "__set__";

function hasSettingValue(section: SettingsData, key: string): boolean {
  const value = section?.[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 || trimmed === SECRET_SENTINEL;
  }
  return value !== null && value !== undefined && value !== false;
}

function requiredProgress(requirements: Requirement[]) {
  const required = requirements.filter((requirement) => !requirement.optional);
  const configured = required.filter((requirement) => requirement.configured);
  return { total: required.length, configured: configured.length };
}

function cardStatus(card: SetupCard): SetupStatus {
  const { total, configured } = requiredProgress(card.requirements);
  if (total === 0) return "manual";
  if (configured === total) return "ready";
  if (configured > 0) return "partial";
  return "needed";
}

function statusLabel(status: SetupStatus): string {
  if (status === "ready") return "Ready";
  if (status === "partial") return "Partial";
  if (status === "manual") return "Review";
  return "Needs keys";
}

function statusClassName(status: SetupStatus): string {
  if (status === "ready") return "border-success/30 bg-success/10 text-success";
  if (status === "partial") return "border-warning/30 bg-warning/10 text-warning";
  return "border-border bg-muted text-muted-foreground";
}

function providerSecretCount(shipping: ShippingOverview) {
  return (shipping?.providers ?? []).filter((provider) => provider.secretStored)
    .length;
}

function connectedProviderCount(shipping: ShippingOverview) {
  return (shipping?.providers ?? []).filter(
    (provider) => provider.connection?.status === "connected",
  ).length;
}

function hasShipFromAddress(shipping: ShippingOverview) {
  const values = shipping?.integrationSettings ?? {};
  return [
    "shipFromLine1",
    "shipFromCity",
    "shipFromState",
    "shipFromPostalCode",
    "shipFromCountryCode",
  ].every((key) => typeof values[key] === "string" && String(values[key]).trim());
}

function buildSetupCards({
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
}): SetupCard[] {
  const shippingSecrets = providerSecretCount(shipping);
  const shippingConnected = connectedProviderCount(shipping);

  return [
    {
      id: "email",
      title: "Resend email delivery",
      description: "Transactional mail, invites, notifications, receipts, and digest delivery.",
      icon: Mail,
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
      icon: ShieldCheck,
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
      icon: Search,
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
      icon: Brain,
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
      icon: CreditCard,
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
      icon: Wallet,
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
      icon: Globe,
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
      icon: BarChart3,
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
      icon: Truck,
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

function FirstRunSetupPage() {
  const { isLoading, canAccessRoute } = useAuth();
  const canManageOptions = useCan("manage_options");
  const hasSetupAccess = canManageOptions && canAccessRoute("/setup");
  const canLoadSetupData = !isLoading && hasSetupAccess;

  const email = useQuery(
    api.settings.queries.getBySection,
    canLoadSetupData ? { section: "email" as any } : "skip",
  ) as SettingsData;
  const clerk = useQuery(
    api.settings.queries.getBySection,
    canLoadSetupData ? { section: "integrations.clerk" as any } : "skip",
  ) as SettingsData;
  const searchSettings = useQuery(
    api.settings.queries.getBySection,
    canLoadSetupData ? { section: "search" as any } : "skip",
  ) as SettingsData;
  const ai = useQuery(
    api.settings.queries.getBySection,
    canLoadSetupData ? { section: "ai" as any } : "skip",
  ) as SettingsData;
  const payments = useQuery(
    api.settings.queries.getBySection,
    canLoadSetupData ? { section: "commerce.payments" as any } : "skip",
  ) as SettingsData;
  const google = useQuery(
    api.settings.queries.getBySection,
    canLoadSetupData ? { section: "integrations.google" as any } : "skip",
  ) as SettingsData;
  const ga4 = useQuery(
    api.settings.queries.getBySection,
    canLoadSetupData ? { section: "analytics.ga4" as any } : "skip",
  ) as SettingsData;
  const shipping = useQuery(
    (api as any).shipping.queries.getOverview,
    canLoadSetupData ? {} : "skip",
  ) as
    | ShippingOverview
    | undefined;

  if (isLoading) return <Loader />;

  if (!hasSetupAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="mb-2 text-lg font-semibold text-foreground">
          Access Denied
        </h1>
        <p className="mb-6 max-w-md text-sm text-muted-foreground">
          Setup is restricted to administrators with the manage_options capability.
        </p>
        <Link
          to="/dashboard"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const firstLoad = [
    email,
    clerk,
    searchSettings,
    ai,
    payments,
    google,
    ga4,
    shipping,
  ].some((value) => value === undefined);

  if (firstLoad) return <Loader />;

  const cards = buildSetupCards({
    email,
    clerk,
    searchSettings,
    ai,
    payments,
    google,
    ga4,
    shipping,
  });
  const readyCount = cards.filter((card) => cardStatus(card) === "ready").length;
  const totalRequired = cards.length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <KeyRound className="h-4 w-4" />
            First-run setup
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Finish ConvexPress setup
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Add the provider keys that unlock email, website auth, search,
            AI, payments, analytics, shipping, and customer-facing workflows.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card px-5 py-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Launch readiness
          </div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {readyCount}/{totalRequired}
          </div>
          <div className="text-xs text-muted-foreground">
            provider surfaces ready
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
              <LockKeyhole className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle>Server environment keys</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Confirm these in the Convex deployment environment before
                treating the install as production-ready.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              "AUTH_PRIVATE_KEY",
              "AUTH_ISSUER_URL",
              "AUTH_ALLOWED_ORIGINS",
              "SHIPPING_PROVIDER_ENCRYPTION_KEY",
            ].map((name) => (
              <div
                key={name}
                className="rounded-md border border-border bg-muted/40 p-3"
              >
                <div className="font-mono text-xs font-medium text-foreground">
                  {name}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="https://dashboard.convex.dev/"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Convex dashboard
              <ExternalLink className="h-4 w-4" />
            </a>
            <p className="text-xs text-muted-foreground">
              First-admin setup secret rotation is handled by the desktop setup wizard.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <SetupProviderCard key={card.id} card={card} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
              <Database className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle>ConvexPress access keys</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate these only when another application needs API or
                webhook access to this ConvexPress install.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/api-keys"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              API keys
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/webhooks"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Webhooks
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SetupProviderCard({ card }: { card: SetupCard }) {
  const Icon = card.icon;
  const status = cardStatus(card);
  const progress = requiredProgress(card.requirements);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
              <Icon className="h-5 w-5 text-foreground" />
            </div>
            <div className="min-w-0">
              <CardTitle>{card.title}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {card.description}
              </p>
            </div>
          </div>
          <Badge className={statusClassName(status)}>
            {statusLabel(status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2
            className={cn(
              "h-4 w-4",
              status === "ready" ? "text-success" : "text-muted-foreground",
            )}
          />
          <span>
            {progress.configured} of {progress.total} required values set
          </span>
        </div>
        <div className="space-y-2">
          {card.requirements.map((requirement) => (
            <div
              key={requirement.label}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 p-3"
            >
              <div className="min-w-0">
                <div className="font-mono text-xs font-medium text-foreground">
                  {requirement.label}
                </div>
                {requirement.detail && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {requirement.detail}
                  </div>
                )}
              </div>
              <Badge
                className={
                  requirement.configured
                    ? "border-success/30 bg-success/10 text-success"
                    : requirement.optional
                      ? "border-border bg-muted text-muted-foreground"
                      : "border-warning/30 bg-warning/10 text-warning"
                }
              >
                {requirement.configured
                  ? "Set"
                  : requirement.optional
                    ? "Optional"
                    : "Needed"}
              </Badge>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {card.route && (
            <Link
              to={card.route as any}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Open settings
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {card.providerHref && (
            <a
              href={card.providerHref}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Provider dashboard
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
