/**
 * Discussion Settings Page
 *
 * The most complex settings page with ~24 fields across 6 collapsible sections:
 * - Default Article Settings
 * - Other Comment Settings
 * - Email Me Whenever
 * - Before a Comment Appears
 * - Comment Moderation
 * - Avatars
 *
 * Field names match backend defaults.ts exactly.
 */

import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageLayout } from "@/components/settings/SettingsPageLayout";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsPageSkeleton } from "@/components/settings/SettingsPageSkeleton";
import { CheckboxField } from "@/components/settings/fields/CheckboxField";
import { NumberField } from "@/components/settings/fields/NumberField";
import { SelectField } from "@/components/settings/fields/SelectField";
import { TextareaField } from "@/components/settings/fields/TextareaField";
import { RadioGroupField } from "@/components/settings/fields/RadioGroupField";
import { ToggleField } from "@/components/settings/fields/ToggleField";
import { getFieldError } from "@/components/settings/fields/types";
import { useSettingsForm } from "@/hooks/useSettingsForm";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { discussionSettingsSchema } from "@/lib/settings/schemas";
import type { DiscussionSettings } from "@/types/settings";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/discussion",
)({
  component: DiscussionSettingsPage,
});

// --- Options ---

const commentsPageOptions = [
  { label: "Last page", value: "newest" },
  { label: "First page", value: "oldest" },
];

const commentOrderOptions = [
  { label: "Older comments at the top", value: "asc" },
  { label: "Newer comments at the top", value: "desc" },
];

const avatarRatingOptions = [
  {
    label: "G",
    value: "G",
    description: "Suitable for all audiences",
  },
  {
    label: "PG",
    value: "PG",
    description: "Possibly offensive, usually for audiences 13+",
  },
  {
    label: "R",
    value: "R",
    description: "Intended for adult audiences",
  },
  {
    label: "X",
    value: "X",
    description: "Mature content only",
  },
];

const defaultAvatarOptions = [
  {
    label: "Mystery Person",
    value: "mystery",
    description: "A generic silhouette",
  },
  {
    label: "Blank",
    value: "blank",
    description: "A transparent image",
  },
  {
    label: "Gravatar Logo",
    value: "gravatar_default",
    description: "The Gravatar branding icon",
  },
  {
    label: "Identicon",
    value: "identicon",
    description: "A geometric pattern based on email hash",
  },
  {
    label: "Wavatar",
    value: "wavatar",
    description: "A generated face",
  },
  {
    label: "MonsterID",
    value: "monsterid",
    description: "A generated monster illustration",
  },
  {
    label: "Retro",
    value: "retro",
    description: "A pixelated, 8-bit-style icon",
  },
];

// --- Page ---

function DiscussionSettingsPage() {
  const {
    form,
    isDirty,
    isSubmitting,
    isLoading,
    lastUpdated,
    autoSaveStatus,
    autoSaveError,
  } = useSettingsForm<DiscussionSettings>("discussion", discussionSettingsSchema);

  useNavigationGuard({ isDirty, autoSaveStatus });

  if (isLoading) {
    return <SettingsPageSkeleton sections={6} fieldsPerSection={3} />;
  }

  const values = form.state.values as DiscussionSettings;

  return (
    <SettingsPageLayout
      title="Discussion Settings"
      description="Configure how comments and discussions work on your site."
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      autoSaveStatus={autoSaveStatus}
      autoSaveError={autoSaveError}
      lastUpdated={lastUpdated}
    >
      {/* Section 1: Default Article Settings */}
      <SettingsSection
        title="Default Article Settings"
        description="These settings control the defaults for new posts."
        collapsible
      >
        <form.Field name="attemptNotifyLinkedBlogs">
          {(field) => (
            <CheckboxField
              field={field}
              label="Attempt to notify any blogs linked to from the post"
              description="Send pingbacks and trackbacks when publishing."
            />
          )}
        </form.Field>

        <form.Field name="allowLinkNotifications">
          {(field) => (
            <CheckboxField
              field={field}
              label="Allow link notifications from other blogs (pingbacks and trackbacks)"
            />
          )}
        </form.Field>

        <form.Field name="allowComments">
          {(field) => (
            <CheckboxField
              field={field}
              label="Allow people to submit comments on new posts"
              description="This can be overridden on individual posts."
            />
          )}
        </form.Field>
      </SettingsSection>

      {/* Section 2: Other Comment Settings */}
      <SettingsSection
        title="Other Comment Settings"
        description="Additional rules for who can comment and how comments are displayed."
        collapsible
      >
        <form.Field name="requireNameEmail">
          {(field) => (
            <CheckboxField
              field={field}
              label="Comment author must fill out name and email"
            />
          )}
        </form.Field>

        <form.Field name="requireRegistration">
          {(field) => (
            <CheckboxField
              field={field}
              label="Users must be registered and logged in to comment"
            />
          )}
        </form.Field>

        {/* Auto-close comments */}
        <form.Field name="autoCloseEnabled">
          {(field) => (
            <div className="flex flex-col gap-2">
              <CheckboxField
                field={field}
                label="Automatically close comments on posts older than"
              />
              {/* Dependent field: days input */}
              <div
                className={
                  values.autoCloseEnabled
                    ? "grid grid-rows-[1fr] transition-[grid-template-rows] duration-200"
                    : "grid grid-rows-[0fr] transition-[grid-template-rows] duration-200"
                }
              >
                <div className="overflow-hidden">
                  <div className="pl-6.5 pt-1">
                    <form.Field name="autoCloseAfterDays">
                      {(daysField) => (
                        <SettingsField
                          label=""
                          suffix="days"
                          error={getFieldError(daysField.state.meta.errors)}
                        >
                          <NumberField
                            field={daysField}
                            min={1}
                            max={365}
                            width="narrow"
                          />
                        </SettingsField>
                      )}
                    </form.Field>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form.Field>

        {/* Threaded comments */}
        <form.Field name="enableThreadedComments">
          {(field) => (
            <div className="flex flex-col gap-2">
              <CheckboxField
                field={field}
                label="Enable threaded (nested) comments"
              />
              {/* Dependent field: depth */}
              <div
                className={
                  values.enableThreadedComments
                    ? "grid grid-rows-[1fr] transition-[grid-template-rows] duration-200"
                    : "grid grid-rows-[0fr] transition-[grid-template-rows] duration-200"
                }
              >
                <div className="overflow-hidden">
                  <div className="pl-6.5 pt-1">
                    <form.Field name="threadedCommentsDepth">
                      {(depthField) => (
                        <SettingsField
                          label=""
                          suffix="levels deep"
                          error={getFieldError(depthField.state.meta.errors)}
                        >
                          <NumberField
                            field={depthField}
                            min={1}
                            max={10}
                            width="narrow"
                          />
                        </SettingsField>
                      )}
                    </form.Field>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form.Field>

        {/* Break comments into pages */}
        <form.Field name="enablePaginatedComments">
          {(field) => (
            <div className="flex flex-col gap-2">
              <CheckboxField
                field={field}
                label="Break comments into pages"
              />
              {/* Dependent fields */}
              <div
                className={
                  values.enablePaginatedComments
                    ? "grid grid-rows-[1fr] transition-[grid-template-rows] duration-200"
                    : "grid grid-rows-[0fr] transition-[grid-template-rows] duration-200"
                }
              >
                <div className="overflow-hidden">
                  <div className="pl-6.5 pt-1 flex flex-col gap-3">
                    <form.Field name="commentsPerPage">
                      {(perPageField) => (
                        <SettingsField
                          label=""
                          suffix="top level comments per page"
                          error={getFieldError(perPageField.state.meta.errors)}
                        >
                          <NumberField
                            field={perPageField}
                            min={1}
                            max={200}
                            width="narrow"
                          />
                        </SettingsField>
                      )}
                    </form.Field>

                    <form.Field name="defaultCommentsPage">
                      {(pageField) => (
                        <SettingsField
                          label="displayed by default"
                          htmlFor="defaultCommentsPage"
                        >
                          <SelectField
                            field={pageField}
                            options={commentsPageOptions}
                          />
                        </SettingsField>
                      )}
                    </form.Field>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form.Field>

        {/* Comment order */}
        <form.Field name="commentOrder">
          {(field) => (
            <SettingsField
              label="Comments should be displayed with"
              htmlFor="commentOrder"
            >
              <SelectField field={field} options={commentOrderOptions} />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* Section 3: Email Me Whenever */}
      <SettingsSection
        title="Email Me Whenever"
        description="Get notified when comments are posted."
        collapsible
      >
        <form.Field name="emailOnNewComment">
          {(field) => (
            <CheckboxField
              field={field}
              label="Anyone posts a comment"
            />
          )}
        </form.Field>

        <form.Field name="emailOnHeldForModeration">
          {(field) => (
            <CheckboxField
              field={field}
              label="A comment is held for moderation"
            />
          )}
        </form.Field>
      </SettingsSection>

      {/* Section 4: Before a Comment Appears */}
      <SettingsSection
        title="Before a Comment Appears"
        description="Control when comments become visible on your site."
        collapsible
      >
        <form.Field name="manualApprovalRequired">
          {(field) => (
            <CheckboxField
              field={field}
              label="Comment must be manually approved"
              description="All comments will be held in the moderation queue until an administrator approves them."
            />
          )}
        </form.Field>

        <form.Field name="previouslyApprovedRequired">
          {(field) => (
            <CheckboxField
              field={field}
              label="Comment author must have a previously approved comment"
              description="First-time commenters will be held for moderation. After one approved comment, future comments appear immediately."
            />
          )}
        </form.Field>
      </SettingsSection>

      {/* Section 5: Comment Moderation */}
      <SettingsSection
        title="Comment Moderation"
        description="Automatically hold comments for moderation based on content."
        collapsible
      >
        <form.Field name="holdIfLinksExceed">
          {(field) => (
            <SettingsField
              label="Hold a comment in the queue if it contains"
              htmlFor="holdIfLinksExceed"
              suffix="or more links"
              description="A common characteristic of comment spam is a large number of hyperlinks."
              error={getFieldError(field.state.meta.errors)}
            >
              <NumberField
                field={field}
                min={0}
                max={100}
                width="narrow"
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="moderationWordList">
          {(field) => (
            <SettingsField
              label="Moderation Word List"
              htmlFor="moderationWordList"
              layout="stacked"
              description="When a comment contains any of these words in its content, author name, URL, email, IP address, or browser's user agent string, it will be held in the moderation queue. One word or IP address per line."
              error={getFieldError(field.state.meta.errors)}
            >
              <TextareaField
                field={field}
                rows={8}
                maxLength={50000}
                showCharCount
                placeholder="Enter words to hold for moderation, one per line..."
                resize="vertical"
              />
            </SettingsField>
          )}
        </form.Field>

        <form.Field name="disallowedWordList">
          {(field) => (
            <SettingsField
              label="Disallowed Comment Keys"
              htmlFor="disallowedWordList"
              layout="stacked"
              description="When a comment contains any of these words in its content, author name, URL, email, IP address, or browser's user agent string, it will be put in the Trash. One word or IP address per line."
              error={getFieldError(field.state.meta.errors)}
            >
              <TextareaField
                field={field}
                rows={8}
                maxLength={50000}
                showCharCount
                placeholder="Enter disallowed words, one per line..."
                resize="vertical"
              />
            </SettingsField>
          )}
        </form.Field>
      </SettingsSection>

      {/* Section 6: Avatars */}
      <SettingsSection
        title="Avatars"
        description="An avatar is an image that follows you from weblog to weblog."
        collapsible
      >
        <form.Field name="showAvatars">
          {(field) => (
            <ToggleField
              field={field}
              label="Show Avatars"
              description="Display avatar images next to comments."
            />
          )}
        </form.Field>

        {/* Dependent avatar settings */}
        <div
          className={
            values.showAvatars
              ? "grid grid-rows-[1fr] transition-[grid-template-rows] duration-200"
              : "grid grid-rows-[0fr] transition-[grid-template-rows] duration-200"
          }
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-4 pt-2">
              <form.Field name="avatarRating">
                {(field) => (
                  <SettingsField
                    label="Maximum Rating"
                    layout="stacked"
                    description="Only show avatars rated at this level or below."
                  >
                    <RadioGroupField
                      field={field}
                      options={avatarRatingOptions}
                    />
                  </SettingsField>
                )}
              </form.Field>

              <form.Field name="defaultAvatar">
                {(field) => (
                  <SettingsField
                    label="Default Avatar"
                    layout="stacked"
                    description="For users without a custom avatar."
                  >
                    <RadioGroupField
                      field={field}
                      options={defaultAvatarOptions}
                    />
                  </SettingsField>
                )}
              </form.Field>
            </div>
          </div>
        </div>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
