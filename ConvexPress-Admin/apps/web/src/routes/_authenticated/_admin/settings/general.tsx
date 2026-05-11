/**
 * General Settings Page
 *
 * Site Title, Tagline, Site URL, Home URL, Admin Email, Membership, Default Role,
 * Password Notifications (sendPasswordResetEmail, sendPasswordChangedEmail,
 * notifyAdminOnPasswordReset), Language, Timezone, Date Format, Time Format,
 * Week Starts On.
 *
 * Field names match backend defaults.ts exactly.
 */

import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageLayout } from "@/components/settings/SettingsPageLayout";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsCallout } from "@/components/settings/SettingsCallout";
import { SettingsPageSkeleton } from "@/components/settings/SettingsPageSkeleton";
import { TextField } from "@/components/settings/fields/TextField";
import { SelectField } from "@/components/settings/fields/SelectField";
import { CheckboxField } from "@/components/settings/fields/CheckboxField";
import { RadioGroupField } from "@/components/settings/fields/RadioGroupField";
import { getFieldError } from "@/components/settings/fields/types";
import { TimezoneSelect } from "@/components/settings/TimezoneSelect";
import { DateFormatPreview } from "@/components/settings/DateFormatPreview";
import { TimeFormatPreview } from "@/components/settings/TimeFormatPreview";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { generalSettingsSchema } from "@/lib/settings/schemas";
import type { GeneralSettings } from "@/types/settings";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/general",
)({
  component: GeneralSettingsPage,
});

// --- Options ---

const roleOptions = [
  { label: "Subscriber", value: "subscriber" },
  { label: "Contributor", value: "contributor" },
  { label: "Author", value: "author" },
  { label: "Editor", value: "editor" },
];

const registrationModeOptions = [
  { label: "Invite-only", value: "invite_only" },
  { label: "Closed", value: "closed" },
];


const languageOptions = [
  { label: "English (United States)", value: "en-US" },
  { label: "English (United Kingdom)", value: "en-GB" },
  { label: "Spanish (Spain)", value: "es-ES" },
  { label: "French (France)", value: "fr-FR" },
  { label: "German (Germany)", value: "de-DE" },
  { label: "Portuguese (Brazil)", value: "pt-BR" },
  { label: "Japanese", value: "ja" },
  { label: "Chinese (Simplified)", value: "zh-CN" },
];

const weekStartOptions = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
];

const dateFormatOptions = [
  { label: "MMMM d, yyyy", value: "MMMM d, yyyy" },
  { label: "MM/dd/yyyy", value: "MM/dd/yyyy" },
  { label: "dd/MM/yyyy", value: "dd/MM/yyyy" },
  { label: "yyyy-MM-dd", value: "yyyy-MM-dd" },
  { label: "Custom:", value: "__custom_date__" },
];

const timeFormatOptions = [
  { label: "h:mm a", value: "h:mm a" },
  { label: "HH:mm", value: "HH:mm" },
  { label: "HH:mm:ss", value: "HH:mm:ss" },
  { label: "Custom:", value: "__custom_time__" },
];

/** Well-known date format values (non-custom) */
const KNOWN_DATE_FORMATS = new Set(["MMMM d, yyyy", "MM/dd/yyyy", "dd/MM/yyyy", "yyyy-MM-dd"]);
/** Well-known time format values (non-custom) */
const KNOWN_TIME_FORMATS = new Set(["h:mm a", "HH:mm", "HH:mm:ss"]);

// --- Page ---

function GeneralSettingsPage() {
  const {
    form,
    isDirty,
    isSubmitting,
    isLoading,
    lastUpdated,
    autoSaveStatus,
    autoSaveError,
  } = useSettingsForm<GeneralSettings>("general", generalSettingsSchema);

  useNavigationGuard({ isDirty, autoSaveStatus });

  if (isLoading) {
    return <SettingsPageSkeleton sections={4} fieldsPerSection={3} />;
  }

  return (
    <SettingsPageLayout
      title="General Settings"
      description="Configure your site's basic information and display preferences."
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      autoSaveStatus={autoSaveStatus}
      autoSaveError={autoSaveError}
      lastUpdated={lastUpdated}
    >
      {/* Site Identity */}
      <SettingsSection
        title="Site Identity"
        description="Your site's name and tagline."
      >
        <form.Field name="siteTitle">
          {(field) => (
            <SettingsField
              label="Site Title"
              htmlFor="siteTitle"
              required
              error={getFieldError(field.state.meta.errors)}
            >
              <TextField
                field={field}
                placeholder="My Site"
                maxLength={200}
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="tagline">
          {(field) => (
            <SettingsField
              label="Tagline"
              htmlFor="tagline"
              description="In a few words, explain what this site is about."
              error={getFieldError(field.state.meta.errors)}
            >
              <TextField
                field={field}
                placeholder="Just another ConvexPress site"
                maxLength={500}
              />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* Site Address */}
      <SettingsSection
        title="Site Address"
        description="The URLs where your site is accessible."
      >
        <form.Field name="siteUrl">
          {(field) => (
            <SettingsField
              label="Site Address (URL)"
              htmlFor="siteUrl"
              required
              description="The URL where ConvexPress's core files reside."
              error={getFieldError(field.state.meta.errors)}
            >
              <TextField
                field={field}
                type="url"
                placeholder="https://example.com"
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="homeUrl">
          {(field) => (
            <SettingsField
              label="Home Address (URL)"
              htmlFor="homeUrl"
              required
              description="The address visitors use to reach your site."
              error={getFieldError(field.state.meta.errors)}
            >
              <TextField
                field={field}
                type="url"
                placeholder="https://example.com"
              />
            </SettingsField>
          )}
        </form.Field>

        <SettingsCallout type="info">
          These URLs should only be changed if you know what you're doing. In
          most cases, the Site Address and Home Address should be the same.
        </SettingsCallout>
      </SettingsSection>

      {/* Administration */}
      <SettingsSection title="Administration">
        <form.Field name="adminEmail">
          {(field) => (
            <SettingsField
              label="Administration Email"
              htmlFor="adminEmail"
              required
              description="This address is used for admin purposes."
              error={getFieldError(field.state.meta.errors)}
            >
              <TextField
                field={field}
                type="email"
                placeholder="admin@example.com"
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="membershipEnabled">
          {(field) => (
            <SettingsField label="Membership" layout="stacked">
              <CheckboxField
                field={field}
                label="Anyone can register"
                description="Allow public user registration on the site."
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="registrationMode">
          {(field) => (
            <SettingsField
              label="When Public Registration Is Off"
              layout="stacked"
              error={getFieldError(field.state.meta.errors)}
            >
              <RadioGroupField
                field={field}
                options={registrationModeOptions}
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="defaultRole">
          {(field) => (
            <SettingsField
              label="New User Default Role"
              htmlFor="defaultRole"
              error={getFieldError(field.state.meta.errors)}
            >
              <SelectField field={field} options={roleOptions} />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* Password Notifications */}
      <SettingsSection
        title="Password Notifications"
        description="Control email notifications related to password resets and changes."
      >
        <form.Field name="sendPasswordResetEmail">
          {(field) => (
            <SettingsField label="Password Reset Request" layout="stacked">
              <CheckboxField
                field={field}
                label="Send a branded reset email"
                description="Send a ConvexPress-branded password reset email in addition to the default authentication provider email."
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="sendPasswordChangedEmail">
          {(field) => (
            <SettingsField label="Password Changed Confirmation" layout="stacked">
              <CheckboxField
                field={field}
                label="Send confirmation when password changes"
                description="Notify the user via email when their password has been successfully changed."
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="notifyAdminOnPasswordReset">
          {(field) => (
            <SettingsField label="Admin Notification" layout="stacked">
              <CheckboxField
                field={field}
                label="Notify administrator on password reset"
                description="Send an email to the administration email address whenever any user resets their password."
              />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* Locale */}
      <SettingsSection
        title="Locale"
        description="Language, timezone, and date/time display settings."
      >
        <form.Field name="siteLanguage">
          {(field) => (
            <SettingsField
              label="Site Language"
              htmlFor="siteLanguage"
              error={getFieldError(field.state.meta.errors)}
            >
              <SelectField field={field} options={languageOptions} />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="timezone">
          {(field) => (
            <SettingsField
              label="Timezone"
              htmlFor="timezone"
              error={getFieldError(field.state.meta.errors)}
            >
              <TimezoneSelect field={field} />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="dateFormat">
          {(field) => {
            const currentValue = field.state.value as string;
            const isCustom = !KNOWN_DATE_FORMATS.has(currentValue);
            // Adapter: map between radio sentinel and actual format string
            const radioAdapter = {
              ...field,
              state: {
                ...field.state,
                value: isCustom ? "__custom_date__" : currentValue,
              },
              handleChange: (val: string) => {
                if (val === "__custom_date__") {
                  // When switching to custom, keep current value if already custom,
                  // otherwise set a reasonable starting format
                  if (!isCustom) {
                    field.handleChange(currentValue);
                  }
                } else {
                  field.handleChange(val);
                }
              },
            };
            // Input adapter for the custom text input
            const customInputAdapter = {
              ...field,
              state: {
                ...field.state,
                value: isCustom ? currentValue : "",
              },
              handleChange: (val: string) => field.handleChange(val),
              handleBlur: field.handleBlur,
            };
            return (
              <SettingsField label="Date Format" layout="stacked">
                <RadioGroupField
                  field={radioAdapter}
                  options={dateFormatOptions}
                  customOption={{
                    value: "__custom_date__",
                    inputPlaceholder: "e.g., dd-MMM-yyyy",
                    inputField: customInputAdapter,
                  }}
                />
                {/* Live preview */}
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground mr-2">
                    Preview:
                  </span>
                  <form.Subscribe
                    selector={(state) => (state.values as GeneralSettings).timezone}
                    children={(timezone) => (
                      <DateFormatPreview
                        format={currentValue}
                        timezone={timezone}
                      />
                    )}
                  />
                </div>
              </SettingsField>
            );
          }}
        </form.Field>

        <form.Field name="timeFormat">
          {(field) => {
            const currentValue = field.state.value as string;
            const isCustom = !KNOWN_TIME_FORMATS.has(currentValue);
            const radioAdapter = {
              ...field,
              state: {
                ...field.state,
                value: isCustom ? "__custom_time__" : currentValue,
              },
              handleChange: (val: string) => {
                if (val === "__custom_time__") {
                  if (!isCustom) {
                    field.handleChange(currentValue);
                  }
                } else {
                  field.handleChange(val);
                }
              },
            };
            const customInputAdapter = {
              ...field,
              state: {
                ...field.state,
                value: isCustom ? currentValue : "",
              },
              handleChange: (val: string) => field.handleChange(val),
              handleBlur: field.handleBlur,
            };
            return (
              <SettingsField label="Time Format" layout="stacked">
                <RadioGroupField
                  field={radioAdapter}
                  options={timeFormatOptions}
                  customOption={{
                    value: "__custom_time__",
                    inputPlaceholder: "e.g., h:mm:ss a",
                    inputField: customInputAdapter,
                  }}
                />
                {/* Live preview */}
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground mr-2">
                    Preview:
                  </span>
                  <form.Subscribe
                    selector={(state) => (state.values as GeneralSettings).timezone}
                    children={(timezone) => (
                      <TimeFormatPreview
                        format={currentValue}
                        timezone={timezone}
                      />
                    )}
                  />
                </div>
              </SettingsField>
            );
          }}
        </form.Field>

        <form.Field name="weekStartsOn">
          {(field) => {
            // weekStartsOn is stored as a number (0-6) but SelectField
            // works with string values. Create a thin adapter object.
            const stringAdapter = {
              ...field,
              state: {
                ...field.state,
                value: String(field.state.value ?? 0),
              },
              handleChange: (val: string) => field.handleChange(parseInt(val, 10)),
            };
            return (
              <SettingsField
                label="Week Starts On"
                htmlFor="weekStartsOn"
                error={getFieldError(field.state.meta.errors)}
              >
                <SelectField field={stringAdapter} options={weekStartOptions} />
              </SettingsField>
            );
          }}
        </form.Field>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
