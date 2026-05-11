/**
 * Zod validation schemas for all 6 settings sections.
 *
 * Field names MUST match the backend defaults.ts exactly.
 * The backend field names are authoritative.
 *
 * These schemas are used by TanStack Form for client-side validation.
 * Server-side validation is handled by Convex mutation handlers.
 */

import { z } from "zod";

// --- General Settings ---

export const generalSettingsSchema = z.object({
  siteTitle: z
    .string()
    .min(1, "Site title is required.")
    .max(200, "Site title must be 200 characters or less."),
  tagline: z
    .string()
    .max(500, "Tagline must be 500 characters or less.")
    .default(""),
  siteUrl: z
    .string()
    .trim()
    .refine(
      (value) => value.length === 0 || z.string().url().safeParse(value).success,
      "Please enter a valid URL.",
    ),
  homeUrl: z
    .string()
    .trim()
    .refine(
      (value) => value.length === 0 || z.string().url().safeParse(value).success,
      "Please enter a valid URL.",
    ),
  adminEmail: z
    .string()
    .trim()
    .refine(
      (value) => value.length === 0 || z.string().email().safeParse(value).success,
      "Please enter a valid email address.",
    ),
  membershipEnabled: z.boolean().default(false),
  registrationMode: z.enum(["invite_only", "closed"]).default("invite_only"),
  defaultRole: z.string().min(1, "Default role is required."),
  siteLanguage: z.string().min(1, "Language is required."),
  timezone: z.string().min(1, "Timezone is required."),
  dateFormat: z.string().min(1, "Date format is required."),
  timeFormat: z.string().min(1, "Time format is required."),
  weekStartsOn: z
    .number()
    .int()
    .min(0, "Must be 0-6.")
    .max(6, "Must be 0-6.")
    .default(0),
  // Password notification settings
  sendPasswordResetEmail: z.boolean().default(false),
  sendPasswordChangedEmail: z.boolean().default(true),
  notifyAdminOnPasswordReset: z.boolean().default(false),
});

export type GeneralSettingsSchema = z.infer<typeof generalSettingsSchema>;

// --- Reading Settings ---

export const readingSettingsSchema = z
  .object({
    homepageDisplays: z.enum(["latest_posts", "static_page"]),
    homepageId: z.string().nullable().default(null),
    postsPageId: z.string().nullable().default(null),
    postsPerPage: z
      .number()
      .int("Must be a whole number.")
      .min(1, "Must show at least 1 post.")
      .max(100, "Cannot exceed 100 posts per page."),
    feedItemCount: z
      .number()
      .int("Must be a whole number.")
      .min(1, "Must include at least 1 item.")
      .max(100, "Cannot exceed 100 feed items."),
    feedContentDisplay: z.enum(["full", "summary"]),
    searchEngineVisibility: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // homepageId is required when static_page is selected
      if (data.homepageDisplays === "static_page" && !data.homepageId) {
        return false;
      }
      return true;
    },
    {
      message: "Homepage must be selected when using static page display.",
      path: ["homepageId"],
    },
  )
  .refine(
    (data) => {
      // postsPageId cannot equal homepageId
      if (data.homepageId && data.postsPageId && data.homepageId === data.postsPageId) {
        return false;
      }
      return true;
    },
    {
      message: "Posts page cannot be the same as the homepage.",
      path: ["postsPageId"],
    },
  );

export type ReadingSettingsSchema = z.infer<typeof readingSettingsSchema>;

// --- Writing Settings ---

export const writingSettingsSchema = z.object({
  defaultCategory: z.string().nullable().default(null),
  defaultPostFormat: z.string().default("standard"),
});

export type WritingSettingsSchema = z.infer<typeof writingSettingsSchema>;

// --- Discussion Settings ---

export const discussionSettingsSchema = z.object({
  // Default article settings
  attemptNotifyLinkedBlogs: z.boolean().default(true),
  allowLinkNotifications: z.boolean().default(true),
  allowComments: z.boolean().default(true),

  // Other comment settings
  requireNameEmail: z.boolean().default(true),
  requireRegistration: z.boolean().default(false),
  autoCloseEnabled: z.boolean().default(false),
  autoCloseAfterDays: z
    .number()
    .int()
    .min(1, "Must be at least 1 day.")
    .max(365, "Cannot exceed 365 days.")
    .default(14),
  enableThreadedComments: z.boolean().default(true),
  threadedCommentsDepth: z
    .number()
    .int()
    .min(1, "Minimum depth is 1.")
    .max(10, "Maximum depth is 10.")
    .default(5),
  enablePaginatedComments: z.boolean().default(false),
  commentsPerPage: z
    .number()
    .int()
    .min(1, "Must show at least 1 comment.")
    .max(200, "Cannot exceed 200 comments per page.")
    .default(50),
  defaultCommentsPage: z.enum(["newest", "oldest"]).default("newest"),
  commentOrder: z.enum(["asc", "desc"]).default("asc"),

  // Email me whenever
  emailOnNewComment: z.boolean().default(true),
  emailOnHeldForModeration: z.boolean().default(true),

  // Before a comment appears
  manualApprovalRequired: z.boolean().default(false),
  previouslyApprovedRequired: z.boolean().default(true),

  // Comment moderation
  holdIfLinksExceed: z
    .number()
    .int()
    .min(0, "Cannot be negative.")
    .max(100, "Cannot exceed 100.")
    .default(2),
  moderationWordList: z
    .string()
    .max(50000, "Moderation word list must be 50,000 characters or less.")
    .default(""),
  disallowedWordList: z
    .string()
    .max(50000, "Disallowed word list must be 50,000 characters or less.")
    .default(""),

  // Avatars
  showAvatars: z.boolean().default(true),
  avatarRating: z.enum(["G", "PG", "R", "X"]).default("G"),
  defaultAvatar: z
    .enum(["mystery", "blank", "gravatar_default", "identicon", "wavatar", "monsterid", "retro"])
    .default("mystery"),
});

export type DiscussionSettingsSchema = z.infer<typeof discussionSettingsSchema>;

// --- Permalink Settings ---

export const permalinkSettingsSchema = z
  .object({
    structure: z.enum([
      "plain",
      "day_and_name",
      "month_and_name",
      "numeric",
      "post_name",
      "custom",
    ]),
    customStructure: z.string().default(""),
    categoryBase: z
      .string()
      .max(100, "Category base must be 100 characters or less.")
      .refine(
        (v) => v.length === 0 || /^[a-zA-Z0-9-]+$/.test(v),
        "Category base must contain only letters, numbers, and hyphens.",
      )
      .default("category"),
    tagBase: z
      .string()
      .max(100, "Tag base must be 100 characters or less.")
      .refine(
        (v) => v.length === 0 || /^[a-zA-Z0-9-]+$/.test(v),
        "Tag base must contain only letters, numbers, and hyphens.",
      )
      .default("tag"),
  })
  .refine(
    (data) => {
      // Custom structure must start with / when structure is "custom"
      if (data.structure === "custom" && data.customStructure.trim().length > 0) {
        return data.customStructure.startsWith("/");
      }
      return true;
    },
    {
      message: "Custom structure must start with '/'.",
      path: ["customStructure"],
    },
  )
  .refine(
    (data) => {
      // Custom structure must contain %postname% or %post_id%
      if (data.structure === "custom" && data.customStructure.trim().length > 0) {
        return (
          data.customStructure.includes("%postname%") ||
          data.customStructure.includes("%post_id%")
        );
      }
      return true;
    },
    {
      message: "Custom structure must contain %postname% or %post_id%.",
      path: ["customStructure"],
    },
  );

export type PermalinkSettingsSchema = z.infer<typeof permalinkSettingsSchema>;

// --- Privacy Settings ---

export const privacySettingsSchema = z.object({
  privacyPolicyPageId: z.string().nullable().default(null),
  showPrivacyPolicyLink: z.boolean().default(true),
});

export type PrivacySettingsSchema = z.infer<typeof privacySettingsSchema>;

// --- Media Settings ---

export const mediaSettingsSchema = z.object({
  maxUploadSize: z
    .number()
    .int("Must be a whole number.")
    .min(0, "Cannot be negative."),
  thumbnailWidth: z
    .number()
    .int("Must be a whole number.")
    .min(0, "Cannot be negative."),
  thumbnailHeight: z
    .number()
    .int("Must be a whole number.")
    .min(0, "Cannot be negative."),
  thumbnailCrop: z.boolean().default(true),
  mediumWidth: z
    .number()
    .int("Must be a whole number.")
    .min(0, "Cannot be negative."),
  mediumMaxHeight: z
    .number()
    .int("Must be a whole number.")
    .min(0, "Cannot be negative."),
  mediumLargeWidth: z
    .number()
    .int("Must be a whole number.")
    .min(0, "Cannot be negative."),
  mediumLargeMaxHeight: z
    .number()
    .int("Must be a whole number.")
    .min(0, "Cannot be negative."),
  largeWidth: z
    .number()
    .int("Must be a whole number.")
    .min(0, "Cannot be negative."),
  largeMaxHeight: z
    .number()
    .int("Must be a whole number.")
    .min(0, "Cannot be negative."),
});

export type MediaSettingsSchema = z.infer<typeof mediaSettingsSchema>;

// --- Default Values (must match backend defaults.ts exactly) ---

export const generalDefaults: GeneralSettingsSchema = {
  siteTitle: "My Site",
  tagline: "Just another ConvexPress site",
  siteUrl: "",
  homeUrl: "",
  adminEmail: "",
  membershipEnabled: false,
  registrationMode: "invite_only",
  defaultRole: "subscriber",
  siteLanguage: "en-US",
  timezone: "America/New_York",
  dateFormat: "MMMM d, yyyy",
  timeFormat: "h:mm a",
  weekStartsOn: 0,
  sendPasswordResetEmail: false,
  sendPasswordChangedEmail: true,
  notifyAdminOnPasswordReset: false,
};

export const readingDefaults: ReadingSettingsSchema = {
  homepageDisplays: "latest_posts",
  homepageId: null,
  postsPageId: null,
  postsPerPage: 10,
  feedItemCount: 10,
  feedContentDisplay: "full",
  searchEngineVisibility: true,
};

export const writingDefaults: WritingSettingsSchema = {
  defaultCategory: null,
  defaultPostFormat: "standard",
};

export const discussionDefaults: DiscussionSettingsSchema = {
  attemptNotifyLinkedBlogs: true,
  allowLinkNotifications: true,
  allowComments: true,
  requireNameEmail: true,
  requireRegistration: false,
  autoCloseEnabled: false,
  autoCloseAfterDays: 14,
  enableThreadedComments: true,
  threadedCommentsDepth: 5,
  enablePaginatedComments: false,
  commentsPerPage: 50,
  defaultCommentsPage: "newest",
  commentOrder: "asc",
  emailOnNewComment: true,
  emailOnHeldForModeration: true,
  manualApprovalRequired: false,
  previouslyApprovedRequired: true,
  holdIfLinksExceed: 2,
  moderationWordList: "",
  disallowedWordList: "",
  showAvatars: true,
  avatarRating: "G",
  defaultAvatar: "mystery",
};

export const permalinkDefaults: PermalinkSettingsSchema = {
  structure: "post_name",
  customStructure: "",
  categoryBase: "category",
  tagBase: "tag",
};

export const privacyDefaults: PrivacySettingsSchema = {
  privacyPolicyPageId: null,
  showPrivacyPolicyLink: true,
};

export const mediaDefaults: MediaSettingsSchema = {
  maxUploadSize: 52_428_800,
  thumbnailWidth: 150,
  thumbnailHeight: 150,
  thumbnailCrop: true,
  mediumWidth: 300,
  mediumMaxHeight: 0,
  mediumLargeWidth: 768,
  mediumLargeMaxHeight: 0,
  largeWidth: 1024,
  largeMaxHeight: 0,
};

/** Map of section key to default values */
export const sectionDefaults: Record<string, Record<string, unknown>> = {
  general: generalDefaults,
  reading: readingDefaults,
  writing: writingDefaults,
  discussion: discussionDefaults,
  permalinks: permalinkDefaults,
  privacy: privacyDefaults,
  media: mediaDefaults,
};

/** Map of section key to validation schema */
export const sectionSchemas: Record<string, z.ZodObject<z.ZodRawShape>> = {
  general: generalSettingsSchema as unknown as z.ZodObject<z.ZodRawShape>,
  reading: readingSettingsSchema as unknown as z.ZodObject<z.ZodRawShape>,
  writing: writingSettingsSchema as unknown as z.ZodObject<z.ZodRawShape>,
  discussion: discussionSettingsSchema as unknown as z.ZodObject<z.ZodRawShape>,
  permalinks: permalinkSettingsSchema as unknown as z.ZodObject<z.ZodRawShape>,
  privacy: privacySettingsSchema as unknown as z.ZodObject<z.ZodRawShape>,
  media: mediaSettingsSchema as unknown as z.ZodObject<z.ZodRawShape>,
};
