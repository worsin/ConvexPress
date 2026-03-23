/**
 * SEO Overview Page
 *
 * Admin dashboard showing aggregate SEO statistics for all published content.
 * Displays score distribution, actionable issues, and overview statistics.
 *
 * Route: /admin/seo
 */

import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { SeoOverviewDashboard } from "@/components/seo/SeoOverviewDashboard";

export const Route = createFileRoute("/_authenticated/_admin/seo/")({
  component: SeoOverviewPage,
});

function SeoOverviewPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Search className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">SEO Overview</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitor and improve the search engine optimization of your content.
            </p>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <SeoOverviewDashboard />
    </div>
  );
}
