/**
 * SeoOverviewDashboard - Container for all SEO overview dashboard cards.
 *
 * Fetches the SEO overview data from Convex and renders the score chart,
 * issues list, and recent stats table. Shows loading skeleton while data
 * is being fetched.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Loader2 } from "lucide-react";

import { SeoScoreChart } from "./SeoScoreChart";
import { SeoIssuesList } from "./SeoIssuesList";
import { SeoRecentTable } from "./SeoRecentTable";

export function SeoOverviewDashboard() {
  const overview = useQuery(api.seo.queries.getSeoOverview);

  if (overview === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Loading SEO overview...</span>
      </div>
    );
  }

  if (overview === null) {
    return (
      <div className="py-12 text-center text-xs text-muted-foreground">
        Unable to load SEO overview. You may not have sufficient permissions.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Score Distribution */}
      <div className="border border-border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Score Distribution
        </h3>
        <SeoScoreChart
          good={overview.scoreDistribution.good}
          ok={overview.scoreDistribution.ok}
          poor={overview.scoreDistribution.poor}
          noData={overview.scoreDistribution.noData}
        />
      </div>

      {/* Actionable Issues */}
      <div className="border border-border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Issues & Warnings
        </h3>
        <SeoIssuesList
          missingDescription={overview.issues.missingDescription}
          missingKeyphrase={overview.issues.missingKeyphrase}
          noindexCount={overview.issues.noindexCount}
          totalPublished={overview.totalPublished}
        />
      </div>

      {/* Recently Updated Posts */}
      <div className="border border-border bg-card p-4 lg:col-span-2 space-y-3">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Recently Updated Posts
        </h3>
        <SeoRecentTable
          recentPosts={overview.recentPosts ?? []}
          totalPublished={overview.totalPublished}
          totalIndexed={overview.totalIndexed}
          cornerstoneCount={overview.cornerstoneCount}
        />
      </div>
    </div>
  );
}
