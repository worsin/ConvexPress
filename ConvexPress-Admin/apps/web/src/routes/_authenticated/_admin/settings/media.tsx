/**
 * Media Settings Page
 *
 * Upload limits and image size configuration.
 * Mirrors WordPress Settings > Media.
 *
 * Field names match backend defaults.ts MediaSettings exactly.
 */

import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageLayout } from "@/components/settings/SettingsPageLayout";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsCallout } from "@/components/settings/SettingsCallout";
import { SettingsPageSkeleton } from "@/components/settings/SettingsPageSkeleton";
import { CheckboxField } from "@/components/settings/fields/CheckboxField";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/media",
)({
  component: MediaSettingsPage,
});

/** Minimal inline type matching backend MediaSettings */
interface MediaSettings {
  maxUploadSize: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailCrop: boolean;
  mediumWidth: number;
  mediumMaxHeight: number;
  mediumLargeWidth: number;
  mediumLargeMaxHeight: number;
  largeWidth: number;
  largeMaxHeight: number;
}

function MediaSettingsPage() {
  const {
    form,
    isDirty,
    isSubmitting,
    isLoading,
    lastUpdated,
    autoSaveStatus,
    autoSaveError,
  } = useSettingsForm<MediaSettings>("media");

  useNavigationGuard({ isDirty, autoSaveStatus });

  if (isLoading) {
    return <SettingsPageSkeleton sections={3} fieldsPerSection={3} />;
  }

  return (
    <SettingsPageLayout
      title="Media Settings"
      description="Configure image sizes and upload limits."
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      autoSaveStatus={autoSaveStatus}
      autoSaveError={autoSaveError}
      lastUpdated={lastUpdated}
    >
      {/* Upload Limits */}
      <SettingsSection
        title="Uploading Files"
        description="Maximum file upload size."
      >
        <SettingsCallout type="info">
          The maximum upload file size may also be limited by your server
          configuration.
        </SettingsCallout>

        <form.Field name="maxUploadSize">
          {(field) => (
            <SettingsField
              label="Maximum upload size (bytes)"
              htmlFor="maxUploadSize"
              description="Default: 52428800 (50 MB). Set to 0 for no limit."
              error={field.state.meta.errors[0]?.toString()}
            >
              <input
                id="maxUploadSize"
                type="number"
                min={0}
                value={field.state.value ?? 0}
                onChange={(e) => field.handleChange(Number(e.target.value))}
                onBlur={field.handleBlur}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* Thumbnail Size */}
      <SettingsSection
        title="Thumbnail Size"
        description="Used for post thumbnails and small images."
      >
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="thumbnailWidth">
            {(field) => (
              <SettingsField
                label="Width"
                htmlFor="thumbnailWidth"
                error={field.state.meta.errors[0]?.toString()}
              >
                <input
                  id="thumbnailWidth"
                  type="number"
                  min={0}
                  value={field.state.value ?? 150}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  onBlur={field.handleBlur}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </SettingsField>
            )}
          </form.Field>
          <form.Field name="thumbnailHeight">
            {(field) => (
              <SettingsField
                label="Height"
                htmlFor="thumbnailHeight"
                error={field.state.meta.errors[0]?.toString()}
              >
                <input
                  id="thumbnailHeight"
                  type="number"
                  min={0}
                  value={field.state.value ?? 150}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  onBlur={field.handleBlur}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </SettingsField>
            )}
          </form.Field>
        </div>

        <form.Field name="thumbnailCrop">
          {(field) => (
            <SettingsField label="" layout="stacked">
              <CheckboxField
                field={field}
                label="Crop thumbnail to exact dimensions"
                description="When unchecked, thumbnails will be scaled proportionally."
              />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* Medium & Large Sizes */}
      <SettingsSection
        title="Medium Size"
        description="Used in content and archive pages."
      >
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="mediumWidth">
            {(field) => (
              <SettingsField
                label="Max Width"
                htmlFor="mediumWidth"
                error={field.state.meta.errors[0]?.toString()}
              >
                <input
                  id="mediumWidth"
                  type="number"
                  min={0}
                  value={field.state.value ?? 300}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  onBlur={field.handleBlur}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </SettingsField>
            )}
          </form.Field>
          <form.Field name="mediumMaxHeight">
            {(field) => (
              <SettingsField
                label="Max Height"
                htmlFor="mediumMaxHeight"
                description="0 = proportional"
                error={field.state.meta.errors[0]?.toString()}
              >
                <input
                  id="mediumMaxHeight"
                  type="number"
                  min={0}
                  value={field.state.value ?? 0}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  onBlur={field.handleBlur}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </SettingsField>
            )}
          </form.Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Large Size"
        description="Used for full-width content display."
      >
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="largeWidth">
            {(field) => (
              <SettingsField
                label="Max Width"
                htmlFor="largeWidth"
                error={field.state.meta.errors[0]?.toString()}
              >
                <input
                  id="largeWidth"
                  type="number"
                  min={0}
                  value={field.state.value ?? 1024}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  onBlur={field.handleBlur}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </SettingsField>
            )}
          </form.Field>
          <form.Field name="largeMaxHeight">
            {(field) => (
              <SettingsField
                label="Max Height"
                htmlFor="largeMaxHeight"
                description="0 = proportional"
                error={field.state.meta.errors[0]?.toString()}
              >
                <input
                  id="largeMaxHeight"
                  type="number"
                  min={0}
                  value={field.state.value ?? 0}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  onBlur={field.handleBlur}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </SettingsField>
            )}
          </form.Field>
        </div>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
