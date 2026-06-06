/**
 * Role & Capability System - Seed Data
 *
 * Defines the 5 built-in WordPress-standard roles with their complete
 * capability arrays and page access lists. Used by the seedRoles
 * internal mutation to idempotently populate the roles table.
 *
 * Roles follow WordPress conventions:
 *   Administrator (100) > Editor (80) > Author (60) > Contributor (40) > Subscriber (20)
 */

import type { Capability } from "../types/capabilities";
import { ALL_CAPABILITIES } from "../types/capabilities";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RoleSeedData {
  name: string;
  slug: string;
  description: string;
  level: number;
  type: "internal" | "customer" | "system";
  isDefault: boolean;
  isProtected: boolean;
  capabilities: Capability[];
  pageAccess: string[];
  status: "active" | "inactive";
}

// ─── Page Access Constants ──────────────────────────────────────────────────

const ALL_ADMIN_PAGES: string[] = [
  "/admin",
  "/admin/dashboard",
  "/admin/setup",
  "/admin/posts",
  "/admin/posts/new",
  "/admin/posts/edit",
  "/admin/pages",
  "/admin/pages/new",
  "/admin/pages/edit",
  "/admin/media",
  "/admin/media/new",
  "/admin/comments",
  "/admin/users",
  "/admin/users/new",
  "/admin/users/edit",
  "/admin/users/profile",
  "/admin/roles",
  "/admin/roles/new",
  "/admin/roles/edit",
  "/admin/categories",
  "/admin/tags",
  "/admin/settings",
  "/admin/settings/general",
  "/admin/settings/reading",
  "/admin/settings/writing",
  "/admin/settings/discussion",
  "/admin/settings/permalinks",
  "/admin/settings/privacy",
  "/admin/settings/email",
  "/admin/menus",
  "/admin/seo",
  "/admin/api",
  "/admin/audit-log",
  "/admin/email-notifications",
  "/admin/site-notifications",
  "/admin/search",
  "/admin/routing",
  "/admin/revisions",
  "/admin/custom-fields",
  "/admin/tools",
  "/admin/tools/import",
  "/admin/tools/export",
  "/admin/updates",
  "/admin/rss",
  "/admin/sitemap",
  "/admin/registration",
  "/admin/events",
  "/admin/password-management",
  "/admin/kb",
  "/admin/kb/*",
  "/admin/tickets",
  "/admin/tickets/*",
  "/admin/support",
  "/admin/support/*",
  "/admin/lms",
  "/admin/lms/*",
  "/forms",
  "/admin/forms",
];

const EDITOR_PAGES: string[] = [
  "/admin",
  "/admin/dashboard",
  "/admin/posts",
  "/admin/posts/new",
  "/admin/posts/edit",
  "/admin/pages",
  "/admin/pages/new",
  "/admin/pages/edit",
  "/admin/media",
  "/admin/media/new",
  "/admin/comments",
  "/admin/categories",
  "/admin/tags",
  "/admin/revisions",
  "/admin/users/profile",
  "/admin/seo",
  "/admin/custom-fields",
  "/admin/kb",
  "/admin/kb/*",
  "/admin/tickets",
  "/admin/tickets/*",
  "/admin/lms",
  "/admin/lms/*",
  "/forms",
  "/admin/forms",
];

const AUTHOR_PAGES: string[] = [
  "/admin",
  "/admin/dashboard",
  "/admin/posts",
  "/admin/posts/new",
  "/admin/posts/edit",
  "/admin/media",
  "/admin/users/profile",
  "/admin/lms",
  "/admin/lms/*",
];

const CONTRIBUTOR_PAGES: string[] = [
  "/admin",
  "/admin/dashboard",
  "/admin/posts",
  "/admin/posts/new",
  "/admin/users/profile",
];

const SUBSCRIBER_PAGES: string[] = ["/admin/users/profile"];

// ─── Capability Sets ────────────────────────────────────────────────────────

/**
 * Administrator: all registered concrete capabilities. Full system access.
 */
const ADMINISTRATOR_CAPABILITIES: Capability[] = [...ALL_CAPABILITIES];

/**
 * Editor: content, moderation, analytics, and Forms operations; no
 * settings/users/roles.
 */
const EDITOR_CAPABILITIES: Capability[] = [
  // All post capabilities (13)
  "post.create",
  "post.read",
  "post.update",
  "post.delete",
  "post.publish",
  "post.unpublish",
  "post.schedule",
  "post.trash",
  "post.restore",
  "post.duplicate",
  "post.bulk_delete",
  "post.bulk_publish",
  "post.preview",
  // All page capabilities (8)
  "page.create",
  "page.read",
  "page.read_private",
  "page.update",
  "page.delete",
  "page.publish",
  "page.reorder",
  "page.set_parent",
  // All media capabilities (6)
  "media.read",
  "media.upload",
  "media.update",
  "media.delete",
  "media.crop",
  "media.bulk_delete",
  // All taxonomy capabilities (9)
  "taxonomy.create_category",
  "taxonomy.update_category",
  "taxonomy.delete_category",
  "taxonomy.create_tag",
  "taxonomy.update_tag",
  "taxonomy.delete_tag",
  "taxonomy.assign",
  "taxonomy.unassign",
  "taxonomy.merge",
  // All comment capabilities (13)
  "comment.create",
  "comment.read",
  "comment.update",
  "comment.delete",
  "comment.reply",
  "comment.approve",
  "comment.reject",
  "comment.spam",
  "comment.flag",
  "comment.like",
  "comment.bulk_approve",
  "comment.bulk_delete",
  "comment.bulk_spam",
  // Profile (3)
  "profile.view",
  "profile.update",
  "profile.upload_avatar",
  // Auth (5)
  "auth.login",
  "auth.logout",
  "auth.oauth_login",
  "auth.refresh_session",
  "auth.verify_email",
  // Password (1)
  "password.change",
  // Dashboard (4)
  "dashboard.view",
  "dashboard.quick_draft",
  "dashboard.dismiss_widget",
  "dashboard.reorder_widgets",
  // Editor (6)
  "editor.add_block",
  "editor.remove_block",
  "editor.reorder_blocks",
  "editor.save_draft",
  "editor.save_reusable",
  "editor.autosave",
  // Custom Fields (2)
  "custom_field.set_value",
  "custom_field.read_value",
  // Revisions (3)
  "revision.view",
  "revision.compare",
  "revision.restore",
  // SEO (1)
  "seo.update_post",
  // Search (1)
  "search.query",
  // Notifications (4)
  "notification.mark_read",
  "notification.mark_all_read",
  "notification.delete",
  "notification.update_preferences",
  // Analytics (1)
  "analytics.view",
  // LMS (12)
  "lms.course.view",
  "lms.course.create",
  "lms.course.edit",
  "lms.course.publish",
  "lms.course.delete",
  "lms.lesson.edit",
  "lms.lesson.delete",
  "lms.builder.manage",
  "lms.ai.generate",
  "lms.enroll.manage",
  "lms.certificate.manage",
  "lms.settings.manage",
  // Forms (14)
  "form.view",
  "form.create",
  "form.update",
  "form.delete",
  "form.duplicate",
  "form.view_entries",
  "form.edit_entry",
  "form.delete_entry",
  "form.manage_notifications",
  "form.manage_confirmations",
  "form.manage_actions",
  "form.view_analytics",
  "form.export_entries",
  "form.manage_security",
];

/**
 * Author: 49 capabilities. Own posts + media, can publish own content.
 */
const AUTHOR_CAPABILITIES: Capability[] = [
  // Post (subset - 8)
  "post.create",
  "post.read",
  "post.update",
  "post.publish",
  "post.schedule",
  "post.trash",
  "post.duplicate",
  "post.preview",
  // Page (1)
  "page.read",
  // Media (4)
  "media.read",
  "media.upload",
  "media.update",
  "media.crop",
  // Taxonomy (3)
  "taxonomy.create_tag",
  "taxonomy.assign",
  "taxonomy.unassign",
  // Comment (5)
  "comment.create",
  "comment.read",
  "comment.reply",
  "comment.flag",
  "comment.like",
  // Profile (3)
  "profile.view",
  "profile.update",
  "profile.upload_avatar",
  // Auth (5)
  "auth.login",
  "auth.logout",
  "auth.oauth_login",
  "auth.refresh_session",
  "auth.verify_email",
  // Password (1)
  "password.change",
  // Dashboard (4)
  "dashboard.view",
  "dashboard.quick_draft",
  "dashboard.dismiss_widget",
  "dashboard.reorder_widgets",
  // Editor (5)
  "editor.add_block",
  "editor.remove_block",
  "editor.reorder_blocks",
  "editor.save_draft",
  "editor.autosave",
  // Custom Fields (2)
  "custom_field.set_value",
  "custom_field.read_value",
  // Revisions (2)
  "revision.view",
  "revision.compare",
  // SEO (1)
  "seo.update_post",
  // Search (1)
  "search.query",
  // Notifications (4)
  "notification.mark_read",
  "notification.mark_all_read",
  "notification.delete",
  "notification.update_preferences",
  // LMS own-content authoring (6)
  "lms.course.view",
  "lms.course.create",
  "lms.course.edit",
  "lms.lesson.edit",
  "lms.builder.manage",
  "lms.ai.generate",
];

/**
 * Contributor: 35 capabilities. Own drafts only, no publishing or uploads.
 */
const CONTRIBUTOR_CAPABILITIES: Capability[] = [
  // Post (subset - 4)
  "post.create",
  "post.read",
  "post.update",
  "post.preview",
  // Page (1)
  "page.read",
  // Media (1)
  "media.read",
  // Taxonomy (1)
  "taxonomy.assign",
  // Comment (4)
  "comment.create",
  "comment.read",
  "comment.flag",
  "comment.like",
  // Profile (3)
  "profile.view",
  "profile.update",
  "profile.upload_avatar",
  // Auth (5)
  "auth.login",
  "auth.logout",
  "auth.oauth_login",
  "auth.refresh_session",
  "auth.verify_email",
  // Password (1)
  "password.change",
  // Dashboard (4)
  "dashboard.view",
  "dashboard.quick_draft",
  "dashboard.dismiss_widget",
  "dashboard.reorder_widgets",
  // Editor (5)
  "editor.add_block",
  "editor.remove_block",
  "editor.reorder_blocks",
  "editor.save_draft",
  "editor.autosave",
  // Custom Fields (1)
  "custom_field.read_value",
  // Search (1)
  "search.query",
  // Notifications (4)
  "notification.mark_read",
  "notification.mark_all_read",
  "notification.delete",
  "notification.update_preferences",
];

/**
 * Subscriber: 22 capabilities. Read + profile + comments.
 */
const SUBSCRIBER_CAPABILITIES: Capability[] = [
  // Post (1)
  "post.read",
  // Page (1)
  "page.read",
  // Media (1)
  "media.read",
  // Comment (4)
  "comment.create",
  "comment.read",
  "comment.flag",
  "comment.like",
  // Profile (3)
  "profile.view",
  "profile.update",
  "profile.upload_avatar",
  // Auth (5)
  "auth.login",
  "auth.logout",
  "auth.oauth_login",
  "auth.refresh_session",
  "auth.verify_email",
  // Password (1)
  "password.change",
  // Search (1)
  "search.query",
  // Notifications (4)
  "notification.mark_read",
  "notification.mark_all_read",
  "notification.delete",
  "notification.update_preferences",
];

// ─── Seed Data ──────────────────────────────────────────────────────────────

/**
 * Complete seed data for the 5 built-in WordPress-standard roles.
 * Order: highest privilege first.
 */
export const BUILT_IN_ROLES: RoleSeedData[] = [
  {
    name: "Administrator",
    slug: "administrator",
    description: "Full system access. Can manage all content, users, settings, and configuration.",
    level: 100,
    type: "internal",
    isDefault: false,
    isProtected: true,
    capabilities: ADMINISTRATOR_CAPABILITIES,
    pageAccess: ALL_ADMIN_PAGES,
    status: "active",
  },
  {
    name: "Editor",
    slug: "editor",
    description: "All content and moderation capabilities. Cannot manage users, roles, or settings.",
    level: 80,
    type: "internal",
    isDefault: false,
    isProtected: true,
    capabilities: EDITOR_CAPABILITIES,
    pageAccess: EDITOR_PAGES,
    status: "active",
  },
  {
    name: "Author",
    slug: "author",
    description: "Can create, edit, and publish own posts. Can upload media.",
    level: 60,
    type: "customer",
    isDefault: false,
    isProtected: true,
    capabilities: AUTHOR_CAPABILITIES,
    pageAccess: AUTHOR_PAGES,
    status: "active",
  },
  {
    name: "Contributor",
    slug: "contributor",
    description: "Can write and edit own drafts. Cannot publish or upload media.",
    level: 40,
    type: "customer",
    isDefault: false,
    isProtected: true,
    capabilities: CONTRIBUTOR_CAPABILITIES,
    pageAccess: CONTRIBUTOR_PAGES,
    status: "active",
  },
  {
    name: "Subscriber",
    slug: "subscriber",
    description: "Can read content, manage own profile, and leave comments.",
    level: 20,
    type: "customer",
    isDefault: true,
    isProtected: true,
    capabilities: SUBSCRIBER_CAPABILITIES,
    pageAccess: SUBSCRIBER_PAGES,
    status: "active",
  },
];

/**
 * Mapping from legacy internalRole slugs to new role slugs.
 * Used during migration from the old string-based role system.
 */
export const LEGACY_ROLE_MAP: Record<string, string> = {
  admin: "administrator",
  editor: "editor",
  author: "author",
  contributor: "contributor",
  support: "editor", // Support maps to Editor in the new system
  customer: "subscriber", // Customer maps to Subscriber
};
