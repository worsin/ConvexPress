/**
 * Permalink Settings Page
 *
 * Common Structures (radio group), Custom Structure (input + tag buttons),
 * Category Base, Tag Base. Includes permalink change confirmation dialog
 * to warn about SEO impact before saving.
 *
 * NOTE: Autosave is disabled for permalinks. Changes are only saved
 * after the user explicitly confirms via the PermalinkChangeDialog.
 * This prevents accidental permalink changes that would break URLs.
 */

import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageLayout } from "@/components/settings/SettingsPageLayout";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsPageSkeleton } from "@/components/settings/SettingsPageSkeleton";
import { RadioGroupField } from "@/components/settings/fields/RadioGroupField";
import { TextField } from "@/components/settings/fields/TextField";
import { getFieldError } from "@/components/settings/fields/types";
import { PermalinkTagButtons } from "@/components/settings/PermalinkTagButtons";
import { PermalinkPreview } from "@/components/settings/PermalinkPreview";
import { PermalinkChangeDialog } from "@/components/settings/PermalinkChangeDialog";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { permalinkSettingsSchema } from "@/lib/settings/schemas";
import type { PermalinkSettings } from "@/types/settings";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/permalinks",
)({
  component: PermalinkSettingsPage,
});

// --- Options ---

const structureOptions = [
  {
    label: "Plain",
    value: "plain",
    description: "https://example.com/?p=123",
  },
  {
    label: "Day and name",
    value: "day_and_name",
    description: "https://example.com/2026/02/09/sample-post/",
  },
  {
    label: "Month and name",
    value: "month_and_name",
    description: "https://example.com/2026/02/sample-post/",
  },
  {
    label: "Numeric",
    value: "numeric",
    description: "https://example.com/archives/123",
  },
  {
    label: "Post name",
    value: "post_name",
    description: "https://example.com/sample-post/",
  },
  {
    label: "Custom Structure",
    value: "custom",
    description: "Define your own permalink pattern using tags below.",
  },
];

// --- Page ---

function PermalinkSettingsPage() {
  const {
    form,
    isDirty,
    isSubmitting,
    isLoading,
    lastUpdated,
    handleSave,
    initialValues,
  } = useSettingsForm<PermalinkSettings>("permalinks", permalinkSettingsSchema, {
    disableAutosave: true,
  });

  useNavigationGuard(isDirty);

  const customInputRef = React.useRef<HTMLInputElement>(null);
  const [showConfirmDialog, setShowConfirmDialog] = React.useState(false);

  const values = form.state.values as PermalinkSettings;

  // Determine if the permalink structure actually changed (for dialog)
  const structureChanged =
    values.structure !== initialValues.structure ||
    (values.structure === "custom" &&
      values.customStructure !== initialValues.customStructure);

  const handleSaveClick = React.useCallback(async () => {
    if (structureChanged) {
      // Show confirmation dialog before saving
      setShowConfirmDialog(true);
    } else {
      // Non-structure changes (categoryBase, tagBase) can save directly
      await handleSave();
    }
  }, [structureChanged, handleSave]);

  const handleConfirmSave = React.useCallback(() => {
    setShowConfirmDialog(false);
    void handleSave();
  }, [handleSave]);

  const handleCancelDialog = React.useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  // Build display strings for the confirmation dialog
  const getStructureLabel = (structure: string, custom?: string) => {
    switch (structure) {
      case "plain":
        return "Plain (/?p=123)";
      case "day_and_name":
        return "Day and name (/yyyy/mm/dd/post/)";
      case "month_and_name":
        return "Month and name (/yyyy/mm/post/)";
      case "numeric":
        return "Numeric (/archives/123)";
      case "post_name":
        return "Post name (/post-slug/)";
      case "custom":
        return `Custom (${custom || "..."})`;
      default:
        return structure;
    }
  };

  if (isLoading) {
    return <SettingsPageSkeleton sections={2} fieldsPerSection={3} />;
  }

  return (
    <SettingsPageLayout
      title="Permalink Settings"
      description="Customize the URL structure for your posts and pages."
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      autoSaveStatus="idle"
      autoSaveError={null}
      lastUpdated={lastUpdated}
      onSave={handleSaveClick}
    >
      {/* Permalink change confirmation dialog */}
      <PermalinkChangeDialog
        open={showConfirmDialog}
        onConfirm={handleConfirmSave}
        onCancel={handleCancelDialog}
        oldStructure={getStructureLabel(
          initialValues.structure,
          initialValues.customStructure,
        )}
        newStructure={getStructureLabel(
          values.structure,
          values.customStructure,
        )}
      />
        {/* Common Settings */}
        <SettingsSection
          title="Common Settings"
          description="Select the permalink structure for your site."
        >
          <form.Field name="structure">
            {(field) => (
              <SettingsField label="Permalink Structure" layout="stacked">
                <RadioGroupField
                  field={field}
                  options={structureOptions}
                />
              </SettingsField>
            )}
          </form.Field>

          {/* Custom structure input (shown when "custom" is selected) */}
          <div
            className={
              values.structure === "custom"
                ? "grid grid-rows-[1fr] transition-[grid-template-rows] duration-200"
                : "grid grid-rows-[0fr] transition-[grid-template-rows] duration-200"
            }
          >
            <div className="overflow-hidden">
              <div className="flex flex-col gap-3 pt-2">
                <form.Field name="customStructure">
                  {(field) => (
                    <SettingsField
                      label="Custom Structure"
                      htmlFor="customStructure"
                      description="Build your permalink using the available structure tags."
                      error={getFieldError(field.state.meta.errors)}
                    >
                      <div>
                        <input
                          ref={customInputRef}
                          id="customStructure"
                          name="customStructure"
                          type="text"
                          value={(field.state.value as string) ?? ""}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="/%postname%/"
                          className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-none border bg-transparent px-2.5 py-1 text-xs font-mono transition-colors focus-visible:ring-1 w-full min-w-0 outline-hidden placeholder:text-muted-foreground"
                        />
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1.5">
                            Available tags:
                          </p>
                          <PermalinkTagButtons
                            inputRef={customInputRef}
                            field={field}
                          />
                        </div>
                      </div>
                    </SettingsField>
                  )}
                </form.Field>
              </div>
            </div>
          </div>

          {/* Live URL preview */}
          <PermalinkPreview
            structure={values.structure}
            customStructure={values.customStructure}
            siteUrl="https://example.com"
          />
        </SettingsSection>

        {/* Optional Bases */}
        <SettingsSection
          title="Optional"
          description="Customize the base slug for category and tag archives."
        >
          <form.Field name="categoryBase">
            {(field) => (
              <SettingsField
                label="Category base"
                htmlFor="categoryBase"
                description="The prefix for category archive URLs. Default: category"
                error={getFieldError(field.state.meta.errors)}
              >
                <TextField
                  field={field}
                  placeholder="category"
                />
              </SettingsField>
            )}
          </form.Field>

          <form.Field name="tagBase">
            {(field) => (
              <SettingsField
                label="Tag base"
                htmlFor="tagBase"
                description="The prefix for tag archive URLs. Default: tag"
                error={getFieldError(field.state.meta.errors)}
              >
                <TextField
                  field={field}
                  placeholder="tag"
                />
              </SettingsField>
            )}
          </form.Field>
        </SettingsSection>
    </SettingsPageLayout>
  );
}
