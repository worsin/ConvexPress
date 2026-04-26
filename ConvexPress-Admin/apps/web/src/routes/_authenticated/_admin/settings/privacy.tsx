/**
 * Privacy Settings Page
 *
 * Privacy Policy Page selection, Show Privacy Link checkbox, Privacy Policy Guide.
 *
 * Field names match backend defaults.ts exactly.
 */

import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageLayout } from "@/components/settings/SettingsPageLayout";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsCallout } from "@/components/settings/SettingsCallout";
import { SettingsPageSkeleton } from "@/components/settings/SettingsPageSkeleton";
import { CheckboxField } from "@/components/settings/fields/CheckboxField";
import { getFieldError } from "@/components/settings/fields/types";
import { PageSelect } from "@/components/settings/PageSelect";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { privacySettingsSchema } from "@/lib/settings/schemas";
import type { PrivacySettings } from "@/types/settings";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/privacy",
)({
  component: PrivacySettingsPage,
});

function PrivacySettingsPage() {
  const {
    form,
    isDirty,
    isSubmitting,
    isLoading,
    lastUpdated,
    autoSaveStatus,
    autoSaveError,
  } = useSettingsForm<PrivacySettings>("privacy", privacySettingsSchema);

  useNavigationGuard({ isDirty, autoSaveStatus });

  if (isLoading) {
    return <SettingsPageSkeleton sections={2} fieldsPerSection={2} />;
  }

  return (
    <SettingsPageLayout
      title="Privacy Settings"
      description="Manage your site's privacy policy page."
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      autoSaveStatus={autoSaveStatus}
      autoSaveError={autoSaveError}
      lastUpdated={lastUpdated}
    >
      <SettingsSection
        title="Privacy Policy Page"
        description="Select the page that contains your site's privacy policy."
      >
        <SettingsCallout
          type="info"
          link={{
            text: "Learn more about privacy policies",
            href: "#",
          }}
        >
          As a website owner, you may need to follow national or international
          privacy laws requiring a privacy policy. Select an existing page or
          create a new one to serve as your privacy policy.
        </SettingsCallout>

        <form.Field name="privacyPolicyPageId">
          {(field) => (
            <SettingsField
              label="Privacy Policy Page"
              htmlFor="privacyPolicyPageId"
              description="Select the page that will serve as your privacy policy. This page will be linked from registration and login forms."
              error={getFieldError(field.state.meta.errors)}
            >
              <PageSelect
                field={field}
                placeholder="-- Select --"
                clearable
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="showPrivacyPolicyLink">
          {(field) => (
            <SettingsField label="Display" layout="stacked">
              <CheckboxField
                field={field}
                label="Show a privacy policy link in the footer and on registration forms"
                description="When enabled, a link to your privacy policy page will appear in the site footer and alongside registration and login forms."
              />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* Privacy Policy Guide */}
      <SettingsSection
        title="Privacy Policy Guide"
        description="Suggested text and guidelines for your privacy policy."
      >
        <SettingsCallout type="info">
          The following sections are suggestions based on common privacy policy
          needs. You should review and customize the content based on your
          specific data practices. This guide does not constitute legal advice.
        </SettingsCallout>

        <div className="text-xs text-muted-foreground space-y-3">
          <div>
            <p className="font-medium text-foreground">Who we are</p>
            <p>
              Describe your organization and link to your main website. Include
              the physical address if applicable.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">What personal data we collect and why</p>
            <p>
              List all the types of personal data your site collects (comments,
              contact forms, analytics cookies, etc.) and explain the purpose for
              each collection.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Who we share your data with</p>
            <p>
              Describe any third-party services that receive user data (analytics
              providers, email services, payment processors, etc.).
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">How long we retain your data</p>
            <p>
              Explain your data retention policies for different types of
              personal information.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">What rights you have over your data</p>
            <p>
              Explain how users can request an exported file of their personal
              data, or request deletion of their data.
            </p>
          </div>
        </div>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
