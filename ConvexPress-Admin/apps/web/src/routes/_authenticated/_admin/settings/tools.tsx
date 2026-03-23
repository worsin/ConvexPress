/**
 * Settings Tools Page
 *
 * Provides Import/Export functionality for site settings.
 * Administrators can export all settings as JSON and import
 * previously exported settings with a diff preview.
 */

import { createFileRoute } from "@tanstack/react-router";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { ImportExport } from "@/components/settings/ImportExport";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/tools",
)({
  component: SettingsToolsPage,
});

function SettingsToolsPage() {
  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Settings Tools
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import, export, and manage your site settings.
        </p>
      </div>

      {/* Import/Export */}
      <SettingsSection
        title="Import / Export"
        description="Transfer settings between sites or create backups."
      >
        <ImportExport />
      </SettingsSection>
    </div>
  );
}
