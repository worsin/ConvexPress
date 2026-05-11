/**
 * Writing Settings Page
 *
 * Default Category, Default Post Format.
 * The simplest settings page.
 */

import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageLayout } from "@/components/settings/SettingsPageLayout";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsPageSkeleton } from "@/components/settings/SettingsPageSkeleton";
import { SelectField } from "@/components/settings/fields/SelectField";
import { getFieldError } from "@/components/settings/fields/types";
import { CategorySelect } from "@/components/settings/CategorySelect";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { writingSettingsSchema } from "@/lib/settings/schemas";
import type { WritingSettings } from "@/types/settings";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/writing",
)({
  component: WritingSettingsPage,
});

const postFormatOptions = [
  { label: "Standard", value: "standard" },
  { label: "Aside", value: "aside" },
  { label: "Gallery", value: "gallery" },
  { label: "Link", value: "link" },
  { label: "Image", value: "image" },
  { label: "Quote", value: "quote" },
  { label: "Status", value: "status" },
  { label: "Video", value: "video" },
  { label: "Audio", value: "audio" },
  { label: "Chat", value: "chat" },
];

function WritingSettingsPage() {
  const {
    form,
    isDirty,
    isSubmitting,
    isLoading,
    lastUpdated,
    autoSaveStatus,
    autoSaveError,
  } = useSettingsForm<WritingSettings>("writing", writingSettingsSchema);

  useNavigationGuard({ isDirty, autoSaveStatus });

  if (isLoading) {
    return <SettingsPageSkeleton sections={1} fieldsPerSection={2} />;
  }

  return (
    <SettingsPageLayout
      title="Writing Settings"
      description="Configure defaults for creating new content."
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      autoSaveStatus={autoSaveStatus}
      autoSaveError={autoSaveError}
      lastUpdated={lastUpdated}
    >
      <SettingsSection
        title="Default Post Settings"
        description="These defaults apply when creating new posts."
      >
        <form.Field name="defaultCategory">
          {(field) => (
            <SettingsField
              label="Default Post Category"
              htmlFor="defaultCategory"
              description="The category assigned to new posts if none is selected."
              error={getFieldError(field.state.meta.errors)}
            >
              <CategorySelect field={field} />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="defaultPostFormat">
          {(field) => (
            <SettingsField
              label="Default Post Format"
              htmlFor="defaultPostFormat"
              description="The format assigned to new posts if none is selected."
              error={getFieldError(field.state.meta.errors)}
            >
              <SelectField field={field} options={postFormatOptions} />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
