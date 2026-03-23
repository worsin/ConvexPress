/**
 * Search Settings & Analytics Page
 *
 * Admin-only page at /admin/settings/search with three sections:
 *   1. Analytics - Search performance metrics and insights
 *   2. Synonyms - Manage search synonym groups
 *   3. Reindex - Trigger full content reindex
 *
 * Requires search.reindex capability (Administrator only).
 */

import { createFileRoute } from "@tanstack/react-router";

import { SearchAnalyticsDashboard } from "@/components/admin/SearchAnalyticsDashboard";
import { SynonymManager } from "@/components/admin/SynonymManager";
import { ReindexButton } from "@/components/admin/ReindexButton";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/search",
)({
  component: SearchSettingsPage,
});

function SearchSettingsPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Page Header */}
      <div>
        <h1 className="text-lg font-bold">Search Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure search behavior, view analytics, manage synonyms, and reindex content.
        </p>
      </div>

      {/* Analytics Section */}
      <section>
        <h2 className="mb-4 text-base font-semibold">Search Analytics</h2>
        <SearchAnalyticsDashboard />
      </section>

      {/* Synonyms Section */}
      <section>
        <SynonymManager />
      </section>

      {/* Reindex Section */}
      <section>
        <div className="rounded-sm border border-border bg-background p-4">
          <h3 className="mb-1 text-sm font-medium">Content Reindex</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Rebuild the search index from scratch. This may take several minutes for large sites.
            The search will continue to work during reindexing.
          </p>
          <ReindexButton />
        </div>
      </section>
    </div>
  );
}
