/**
 * Integrations Overview Page
 *
 * Dashboard showing connection status for all external service integrations.
 * Each card links to the respective settings page for configuration.
 *
 * Integrations:
 * - AI Providers (OpenRouter / Anthropic) -> /settings/ai
 * - Analytics (Google Analytics 4) -> /settings/analytics
 * - Email (Resend) -> /settings/email
 * - Search (Meilisearch) -> /settings/search
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import {
  Brain,
  BarChart3,
  Mail,
  Search,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations",
)({
  component: IntegrationsOverviewPage,
});

interface IntegrationCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  to: string;
  connected: boolean;
  statusLabel: string;
}

function IntegrationCard({
  title,
  description,
  icon: Icon,
  to,
  connected,
  statusLabel,
}: IntegrationCardProps) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/50"
    >
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
          connected ? "bg-success/10" : "bg-muted",
        )}
      >
        <Icon
          className={cn(
            "h-6 w-6",
            connected ? "text-success" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          {connected ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
          <span
            className={cn(
              "text-xs font-medium",
              connected ? "text-success" : "text-muted-foreground",
            )}
          >
            {statusLabel}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function IntegrationsOverviewPage() {
  // Read AI settings to check if configured
  const aiSettings = useQuery(api.settings.queries.getBySection, {
    section: "ai" as any,
  });

  // Read GA4 connection status
  const ga4Status = useQuery(api.ga4.queries.getConnectionStatus);

  // Read email settings
  const emailSettings = useQuery(api.settings.queries.getBySection, {
    section: "email",
  });

  // Loading state
  if (aiSettings === undefined || ga4Status === undefined || emailSettings === undefined) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="space-y-3">
            <div className="h-20 rounded bg-muted" />
            <div className="h-20 rounded bg-muted" />
            <div className="h-20 rounded bg-muted" />
            <div className="h-20 rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  const aiConnected = !!(aiSettings as any)?.apiKey;
  const ga4Connected = ga4Status?.connected ?? false;
  const emailEnabled = (emailSettings as any)?.enabled ?? false;

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage connections to external services. Configure API keys and
          credentials for AI, analytics, email, and search.
        </p>
      </div>

      {/* Integration Cards */}
      <div className="space-y-3">
        <IntegrationCard
          title="AI Providers"
          description="OpenRouter or Anthropic Direct for AI content generation and research."
          icon={Brain}
          to="/settings/ai"
          connected={aiConnected}
          statusLabel={aiConnected ? "Configured" : "Not configured"}
        />

        <IntegrationCard
          title="Google Analytics 4"
          description="Connect GA4 for traffic and engagement data on your dashboard."
          icon={BarChart3}
          to="/settings/analytics"
          connected={ga4Connected}
          statusLabel={ga4Connected ? "Connected" : "Not connected"}
        />

        <IntegrationCard
          title="Email (Resend)"
          description="Transactional email delivery for notifications, password resets, and digests."
          icon={Mail}
          to="/settings/email"
          connected={emailEnabled}
          statusLabel={emailEnabled ? "Enabled" : "Disabled"}
        />

        <IntegrationCard
          title="Search (Meilisearch)"
          description="Full-text search indexing for posts, pages, and media."
          icon={Search}
          to="/settings/search"
          connected={false}
          statusLabel="Not connected"
        />
      </div>
    </div>
  );
}
