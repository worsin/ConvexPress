/**
 * SEO Settings Page
 *
 * Global SEO configuration with 8 tabs:
 * General, Content Types, Social, Schema, Breadcrumbs, Verification, Robots, Advanced.
 *
 * Tab navigation is URL-based via searchParams (?tab=social).
 *
 * Route: /admin/seo/settings
 */

import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { Settings2 } from "lucide-react";

import { SeoSettingsForm } from "@/components/seo/SeoSettingsForm";
import type { SeoSettingsTab } from "@/lib/seo/types";

const seoSettingsSearchSchema = z.object({
  tab: z
    .enum([
      "general",
      "content-types",
      "social",
      "schema",
      "breadcrumbs",
      "verification",
      "robots",
      "advanced",
    ])
    .optional()
    .default("general"),
});

export const Route = createFileRoute("/_authenticated/_admin/seo/settings")({
  component: SeoSettingsPage,
  validateSearch: seoSettingsSearchSchema,
});

function SeoSettingsPage() {
  const { tab } = useSearch({ from: "/_authenticated/_admin/seo/settings" });
  const navigate = useNavigate();

  const handleTabChange = (newTab: SeoSettingsTab) => {
    navigate({
      to: "/seo/settings",
      search: { tab: newTab },
      replace: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Settings2 className="size-5 text-muted-foreground" />
        <div>
          <h1 className="text-sm font-semibold text-foreground">SEO Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure site-wide search engine optimization, social sharing, structured data, and more.
          </p>
        </div>
      </div>

      {/* Settings Form with Tabs */}
      <SeoSettingsForm activeTab={tab} onTabChange={handleTabChange} />
    </div>
  );
}
