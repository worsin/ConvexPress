/**
 * Reading Settings Page
 *
 * Homepage Display, Posts Per Page, Feed Items, Feed Content, Search Engine Visibility.
 *
 * Field names match backend defaults.ts exactly.
 */

import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageLayout } from "@/components/settings/SettingsPageLayout";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsPageSkeleton } from "@/components/settings/SettingsPageSkeleton";
import { SettingsCallout } from "@/components/settings/SettingsCallout";
import { RadioGroupField } from "@/components/settings/fields/RadioGroupField";
import { NumberField } from "@/components/settings/fields/NumberField";
import { CheckboxField } from "@/components/settings/fields/CheckboxField";
import { SelectField } from "@/components/settings/fields/SelectField";
import { PageSelect } from "@/components/settings/PageSelect";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { readingSettingsSchema } from "@/lib/settings/schemas";
import type { ReadingSettings } from "@/types/settings";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/reading",
)({
  component: ReadingSettingsPage,
});

const homepageDisplayOptions = [
  {
    label: "Your latest posts",
    value: "latest_posts",
    description: "The homepage shows your most recent blog posts.",
  },
  {
    label: "A static page",
    value: "static_page",
    description: "Select specific pages for the homepage and posts page.",
  },
];

const feedContentOptions = [
  { label: "Full text", value: "full" },
  { label: "Summary", value: "summary" },
];

function ReadingSettingsPage() {
  const {
    form,
    isDirty,
    isSubmitting,
    isLoading,
    lastUpdated,
    autoSaveStatus,
    autoSaveError,
  } = useSettingsForm<ReadingSettings>("reading", readingSettingsSchema);

  useNavigationGuard({ isDirty, autoSaveStatus });

  if (isLoading) {
    return <SettingsPageSkeleton sections={3} fieldsPerSection={3} />;
  }

  const homepageDisplays = (form.state.values as ReadingSettings).homepageDisplays;

  return (
    <SettingsPageLayout
      title="Reading Settings"
      description="Configure how your content is displayed to visitors."
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      autoSaveStatus={autoSaveStatus}
      autoSaveError={autoSaveError}
      lastUpdated={lastUpdated}
    >
      {/* Homepage Display */}
      <SettingsSection
        title="Your Homepage Displays"
        description="Choose what shows on the front page of your site."
      >
        <form.Field name="homepageDisplays">
          {(field) => (
            <SettingsField label="Homepage displays" layout="stacked">
              <RadioGroupField
                field={field}
                options={homepageDisplayOptions}
              />
            </SettingsField>
          )}
        </form.Field>

        {/* Conditional: Static page settings */}
        <div
          className={
            homepageDisplays === "static_page"
              ? "grid grid-rows-[1fr] transition-[grid-template-rows] duration-200"
              : "grid grid-rows-[0fr] transition-[grid-template-rows] duration-200"
          }
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-4 pt-2">
              <form.Field name="homepageId">
                {(field) => (
                  <SettingsField
                    label="Homepage"
                    htmlFor="homepageId"
                    error={field.state.meta.errors[0]?.toString()}
                  >
                    <PageSelect
                      field={field}
                      placeholder="-- Select --"
                      clearable
                    />
                  </SettingsField>
                )}
              </form.Field>

              <form.Field name="postsPageId">
                {(field) => (
                  <SettingsField
                    label="Posts page"
                    htmlFor="postsPageId"
                    error={field.state.meta.errors[0]?.toString()}
                  >
                    <PageSelect
                      field={field}
                      placeholder="-- Select --"
                      clearable
                    />
                  </SettingsField>
                )}
              </form.Field>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Blog Pages */}
      <SettingsSection
        title="Blog Pages"
        description="Configure pagination and feed settings."
      >
        <form.Field name="postsPerPage">
          {(field) => (
            <SettingsField
              label="Blog pages show at most"
              htmlFor="postsPerPage"
              suffix="posts"
              error={field.state.meta.errors[0]?.toString()}
            >
              <NumberField
                field={field}
                min={1}
                max={100}
                width="narrow"
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="feedItemCount">
          {(field) => (
            <SettingsField
              label="Syndication feeds show the most recent"
              htmlFor="feedItemCount"
              suffix="items"
              error={field.state.meta.errors[0]?.toString()}
            >
              <NumberField
                field={field}
                min={1}
                max={100}
                width="narrow"
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="feedContentDisplay">
          {(field) => (
            <SettingsField
              label="For each post in a feed, include"
              htmlFor="feedContentDisplay"
              error={field.state.meta.errors[0]?.toString()}
            >
              <SelectField field={field} options={feedContentOptions} />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* Search Engine Visibility */}
      <SettingsSection title="Search Engine Visibility">
        <form.Field name="searchEngineVisibility">
          {(field) => (
            <SettingsField label="Search engines" layout="stacked">
              <CheckboxField
                field={field}
                label="Discourage search engines from indexing this site"
                description="It is up to search engines to honor this request. This does not block access to your site."
              />
              {!field.state.value && (
                <SettingsCallout type="warning">
                  Your site is currently visible to search engines. If this is a
                  staging or development site, consider enabling this option.
                </SettingsCallout>
              )}
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
