/**
 * Admin Settings & Forms UI - Shared TypeScript Types
 *
 * These types define the contract for all settings pages in the admin.
 * Every settings page (General, Reading, Writing, Discussion, Permalinks, Privacy)
 * composes these shared types with section-specific value shapes.
 */

import type { z } from "zod";

// --- Settings Section Identifiers ---

/** Identifies a settings section backed by the Convex settings table. */
export type SettingsSection =
  | "general"
  | "reading"
  | "writing"
  | "discussion"
  | "permalinks"
  | "privacy"
  | "email"
  | "media"
  | "analytics"
  | "ai"
  | "plugins"
  | "search"
  | "commerce.general"
  | "commerce.payments"
  | "integrations.shipping"
  | "integrations.shipping.shipstation"
  | "integrations.shipping.ups"
  | "integrations.shipping.usps"
  | "integrations.shipping.fedex"
  | "integrations.shipping.dhl"
  | "integrations.clerk"
  | "integrations.google"
  | "analytics.ga4"
  | "kb.general"
  | "kb.features"
  | "kb.search"
  | "ticket.general"
  | "ticket.sla"
  | "support.widget"
  | "support.ai"
  | "layout"
  | "header"
  | "footer";

/** Extended sections for non-core settings pages that reuse the same layout */
export type ExtendedSettingsSection =
  | SettingsSection
  | "seo"
  | "sitemap"
  | "api";

// --- Page Configuration ---

/** Configuration for a settings page */
export interface SettingsPageConfig {
  /** The section key (matches Convex settings section) */
  section: SettingsSection;
  /** Page title displayed at the top */
  title: string;
  /** Optional page-level description */
  description?: string;
  /** The Zod schema for client-side validation */
  validationSchema: z.ZodTypeAny;
}

/** Configuration for a settings section (visual grouping within a page) */
export interface SettingsSectionConfig {
  /** Unique key for the section */
  id: string;
  /** Section header text */
  title: string;
  /** Optional description below the header */
  description?: string;
  /** Whether the section is collapsible (default: false) */
  collapsible?: boolean;
  /** Whether the section starts collapsed (default: false) */
  defaultCollapsed?: boolean;
}

// --- Field Configuration ---

/** Configuration for a single settings field */
export interface SettingsFieldConfig {
  /** Field name (must match the key in the settings values object) */
  name: string;
  /** Label displayed next to the field */
  label: string;
  /** Optional help text displayed below the field */
  description?: string;
  /** Field type determines which input component is rendered */
  type:
    | "text"
    | "textarea"
    | "number"
    | "email"
    | "url"
    | "select"
    | "combobox"
    | "radio"
    | "checkbox"
    | "toggle"
    | "color"
    | "date";
  /** Whether the field is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Options for select, combobox, and radio fields */
  options?: FieldOption[];
  /** Minimum value (for number fields) */
  min?: number;
  /** Maximum value (for number fields) */
  max?: number;
  /** Maximum character length (for text/textarea fields) */
  maxLength?: number;
  /** Show character count (for textarea fields) */
  showCharCount?: boolean;
  /** Number of rows (for textarea fields) */
  rows?: number;
  /** Field dependency: only visible/editable when parent field matches value */
  dependsOn?: {
    field: string;
    value: unknown;
  };
  /** Whether to show a live preview next to the field */
  livePreview?: boolean;
  /** Suffix text displayed after the input (e.g., "days", "posts") */
  suffix?: string;
  /** Prefix text displayed before the input */
  prefix?: string;
  /** Full width field (default: false, uses label+input side-by-side layout) */
  fullWidth?: boolean;
}

/** Option for select, combobox, and radio fields */
export interface FieldOption {
  /** Display label */
  label: string;
  /** Option value */
  value: string;
  /** Optional description shown below the label (for radio groups) */
  description?: string;
  /** Optional preview text (for radio groups with live preview) */
  preview?: string;
  /** Whether this option is disabled */
  disabled?: boolean;
}

/** Grouped options for combobox fields */
export interface FieldOptionGroup {
  label: string;
  options: FieldOption[];
}

// --- Form State ---

/** State returned by useSettingsForm hook */
export interface SettingsFormState<T extends object> {
  /** TanStack Form instance */
  form: any;
  /** Whether any field has been modified from initial values */
  isDirty: boolean;
  /** Whether the form is currently submitting */
  isSubmitting: boolean;
  /** Whether the initial data has loaded from Convex */
  isLoading: boolean;
  /** Handle save -- validates and submits */
  handleSave: () => Promise<void>;
  /** Reset form to server values */
  handleReset: () => void;
  /** The initial values loaded from server (for comparison) */
  initialValues: T;
  /** Metadata: who last updated and when */
  lastUpdated?: {
    at: number;
    by: string;
  };
  /** Debounced autosave status */
  autoSaveStatus?: "idle" | "pending" | "saving" | "saved" | "blocked" | "error";
  /** Last autosave error text, if any */
  autoSaveError?: string | null;
}

// --- Callout ---

/** Callout/info box configuration */
export interface CalloutConfig {
  type: "info" | "warning" | "error";
  message: string;
  /** Optional link */
  link?: {
    text: string;
    href: string;
  };
}

// --- Section Value Types ---

/** General Settings values -- matches backend defaults.ts field names */
export interface GeneralSettings {
  siteTitle: string;
  tagline: string;
  siteUrl: string;
  homeUrl: string;
  adminEmail: string;
  membershipEnabled: boolean;
  defaultRole: string;
  siteLanguage: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  weekStartsOn: number;
  // Password notification settings (read by helpers/password.ts)
  sendPasswordResetEmail: boolean;
  sendPasswordChangedEmail: boolean;
  notifyAdminOnPasswordReset: boolean;
}

/** Reading Settings values -- matches backend defaults.ts field names */
export interface ReadingSettings {
  homepageDisplays: "latest_posts" | "static_page";
  homepageId: string | null;
  postsPageId: string | null;
  postsPerPage: number;
  feedItemCount: number;
  feedContentDisplay: "full" | "summary";
  searchEngineVisibility: boolean;
}

/** Writing Settings values -- matches backend defaults.ts field names */
export interface WritingSettings {
  defaultCategory: string | null;
  defaultPostFormat: string;
}

/** Discussion Settings values -- matches backend defaults.ts field names */
export interface DiscussionSettings {
  // Default article settings
  attemptNotifyLinkedBlogs: boolean;
  allowLinkNotifications: boolean;
  allowComments: boolean;

  // Other comment settings
  requireNameEmail: boolean;
  requireRegistration: boolean;
  autoCloseEnabled: boolean;
  autoCloseAfterDays: number;
  enableThreadedComments: boolean;
  threadedCommentsDepth: number;
  enablePaginatedComments: boolean;
  commentsPerPage: number;
  defaultCommentsPage: "newest" | "oldest";
  commentOrder: "asc" | "desc";

  // Email me whenever
  emailOnNewComment: boolean;
  emailOnHeldForModeration: boolean;

  // Before a comment appears
  manualApprovalRequired: boolean;
  previouslyApprovedRequired: boolean;

  // Comment moderation
  holdIfLinksExceed: number;
  moderationWordList: string;
  disallowedWordList: string;

  // Avatars
  showAvatars: boolean;
  avatarRating: "G" | "PG" | "R" | "X";
  defaultAvatar: string;
}

/** Permalink Settings values -- matches backend defaults.ts field names */
export interface PermalinkSettings {
  structure: "plain" | "day_and_name" | "month_and_name" | "numeric" | "post_name" | "custom";
  customStructure: string;
  categoryBase: string;
  tagBase: string;
}

/** Privacy Settings values -- matches backend defaults.ts field names */
export interface PrivacySettings {
  privacyPolicyPageId: string | null;
  showPrivacyPolicyLink: boolean;
}

/** Media Settings values -- matches backend defaults.ts field names */
export interface MediaSettings {
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
