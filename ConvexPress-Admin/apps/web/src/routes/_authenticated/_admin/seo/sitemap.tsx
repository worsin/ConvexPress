/**
 * Sitemap Settings Page
 *
 * Admin page for configuring sitemap generation settings, viewing sitemap
 * status, and manually triggering regeneration.
 *
 * Route: /admin/seo/sitemap
 * Breadcrumb: SEO > Sitemap Settings
 * Auth: Requires `seo.generate_sitemap` capability
 *
 * Features:
 *   - Real-time sitemap status card with URL counts and stale indicators
 *   - Full settings form for content types, ping, and auto-regeneration
 *   - Manual "Regenerate Now" button
 *   - Generation history log
 */

import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Map, ShieldAlert } from "lucide-react";

import { SitemapStatusCard } from "@/components/sitemaps/SitemapStatusCard";
import { SitemapSettingsForm } from "@/components/sitemaps/SitemapSettingsForm";
import { SitemapGenerationLog } from "@/components/sitemaps/SitemapGenerationLog";
import { useSitemapStatus } from "@/hooks/sitemaps/useSitemapStatus";
import { useSitemapSettings } from "@/hooks/sitemaps/useSitemapSettings";
import { useSitemapMutations } from "@/hooks/sitemaps/useSitemapMutations";
import { useCan } from "@/hooks/useCan";
import { useAuth } from "@/lib/auth-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/_admin/seo/sitemap")({
  component: SitemapSettingsPage,
});

function SitemapSettingsPage() {
  const { isLoading } = useAuth();
  const canGenerateSitemap = useCan("seo.generate_sitemap");

  if (isLoading) {
    return null;
  }

  if (!canGenerateSitemap) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-lg font-semibold mb-2">Access Denied</h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          You do not have permission to manage sitemap generation settings.
        </p>
        <Link
          to="/seo"
          className="inline-flex items-center px-4 py-2 text-sm font-medium border border-input bg-card hover:bg-accent transition-colors"
        >
          Return to SEO Dashboard
        </Link>
      </div>
    );
  }

  const status = useSitemapStatus();
  const { settings, isLoading: settingsLoading } = useSitemapSettings();
  const { updateSettings, regenerate, isRegenerating } = useSitemapMutations();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Map className="size-5 text-muted-foreground" />
        <div>
          <h1 className="text-sm font-semibold text-foreground">XML Sitemap</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure XML sitemap generation, content type inclusion, and search engine notifications.
          </p>
        </div>
      </div>

      {/* Status Card */}
      <SitemapStatusCard
        status={status}
        isRegenerating={isRegenerating}
        onRegenerate={regenerate}
      />

      {/* Settings Form */}
      <SitemapSettingsForm
        settings={settings}
        isLoading={settingsLoading}
        onSave={updateSettings}
      />

      {/* Generation Log */}
      <Card>
        <CardHeader>
          <CardTitle>Generation History</CardTitle>
          <CardDescription>
            Recent sitemap generation events with timing and status information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SitemapGenerationLog
            entries={status?.recentGenerations ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
