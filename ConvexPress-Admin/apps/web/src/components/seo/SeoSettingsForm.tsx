/**
 * SeoSettingsForm - Tabbed form container with 8 tabs for global SEO settings.
 *
 * Tab navigation is URL-based via searchParams (?tab=social).
 */

import { cn } from "@/lib/utils";
import { SEO_SETTINGS_TABS } from "@/lib/seo/constants";
import type { SeoSettingsTab } from "@/lib/seo/types";
import { SeoSettingsGeneral } from "./SeoSettingsGeneral";
import { SeoSettingsContentTypes } from "./SeoSettingsContentTypes";
import { SeoSettingsSocial } from "./SeoSettingsSocial";
import { SeoSettingsSchema } from "./SeoSettingsSchema";
import { SeoSettingsBreadcrumbs } from "./SeoSettingsBreadcrumbs";
import { SeoSettingsVerification } from "./SeoSettingsVerification";
import { SeoSettingsRobots } from "./SeoSettingsRobots";
import { SeoSettingsAdvanced } from "./SeoSettingsAdvanced";

interface SeoSettingsFormProps {
  activeTab: SeoSettingsTab;
  onTabChange: (tab: SeoSettingsTab) => void;
}

export function SeoSettingsForm({
  activeTab,
  onTabChange,
}: SeoSettingsFormProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Tab buttons */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-px">
        {SEO_SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors -mb-px",
              activeTab === tab.id
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "general" && <SeoSettingsGeneral />}
        {activeTab === "content-types" && <SeoSettingsContentTypes />}
        {activeTab === "social" && <SeoSettingsSocial />}
        {activeTab === "schema" && <SeoSettingsSchema />}
        {activeTab === "breadcrumbs" && <SeoSettingsBreadcrumbs />}
        {activeTab === "verification" && <SeoSettingsVerification />}
        {activeTab === "robots" && <SeoSettingsRobots />}
        {activeTab === "advanced" && <SeoSettingsAdvanced />}
      </div>
    </div>
  );
}
