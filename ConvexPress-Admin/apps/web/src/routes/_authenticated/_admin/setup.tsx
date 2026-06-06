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
import {
  buildSetupChecklistCards,
  cardStatus,
  requiredProgress,
  type SettingsData,
  type SetupChecklistCard,
  type SetupStatus,
  type ShippingOverview,
} from "@/lib/setup-checklist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/setup")({
  component: FirstRunSetupPage,
});

type SetupCard = {
  icon: LucideIcon;
} & SetupChecklistCard;

const setupIcons: Record<string, LucideIcon> = {
  email: Mail,
  clerk: ShieldCheck,
  search: Search,
  ai: Brain,
  stripe: CreditCard,
  paypal: Wallet,
  google: Globe,
  ga4: BarChart3,
  shipping: Truck,
};

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

  const cards = buildSetupChecklistCards({
    email,
    clerk,
    searchSettings,
    ai,
    payments,
    google,
    ga4,
    shipping,
  }).map((card) => ({
    ...card,
    icon: setupIcons[card.id] ?? KeyRound,
  }));
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
