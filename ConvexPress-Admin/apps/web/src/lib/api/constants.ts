/**
 * API System - Frontend Constants
 *
 * Scope groups, descriptions, status labels, colors, and header names
 * used by the admin UI for API Keys and Webhooks pages.
 */

import type { ApiKeyScope, ApiKeyStatus, WebhookStatus } from "./types";

// ─── Scope Groups ──────────────────────────────────────────────────────────

export interface ScopeGroup {
  label: string;
  scopes: { scope: ApiKeyScope; label: string }[];
}

export const SCOPE_GROUPS: ScopeGroup[] = [
  {
    label: "Posts & Pages",
    scopes: [
      { scope: "read:posts", label: "Read posts and pages" },
      { scope: "write:posts", label: "Create, update, delete posts and pages" },
    ],
  },
  {
    label: "Comments",
    scopes: [
      { scope: "read:comments", label: "Read comments" },
      { scope: "write:comments", label: "Create, update, delete comments" },
    ],
  },
  {
    label: "Media",
    scopes: [
      { scope: "read:media", label: "Read media library" },
      { scope: "write:media", label: "Upload and delete media" },
    ],
  },
  {
    label: "Users",
    scopes: [
      { scope: "read:users", label: "Read user profiles" },
      { scope: "write:users", label: "Update user profiles" },
    ],
  },
  {
    label: "Taxonomies",
    scopes: [
      { scope: "read:taxonomies", label: "Read categories and tags" },
      {
        scope: "write:taxonomies",
        label: "Create, update, delete categories and tags",
      },
    ],
  },
  {
    label: "Settings",
    scopes: [
      { scope: "read:settings", label: "Read site settings" },
      { scope: "write:settings", label: "Update site settings" },
    ],
  },
  {
    label: "Menus",
    scopes: [
      { scope: "read:menus", label: "Read navigation menus" },
      { scope: "write:menus", label: "Create, update, delete menus" },
    ],
  },
];

export const ALL_SCOPES: ApiKeyScope[] = SCOPE_GROUPS.flatMap((g) =>
  g.scopes.map((s) => s.scope),
);

export const SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  "read:posts": "Read posts and pages",
  "write:posts": "Create/update/delete posts and pages",
  "read:comments": "Read comments",
  "write:comments": "Create/update/delete comments",
  "read:media": "Read media library",
  "write:media": "Upload/delete media",
  "read:users": "Read user profiles",
  "write:users": "Update user profiles",
  "read:taxonomies": "Read categories and tags",
  "write:taxonomies": "Create/update/delete categories and tags",
  "read:settings": "Read site settings",
  "write:settings": "Update site settings",
  "read:menus": "Read navigation menus",
  "write:menus": "Create/update/delete menus",
};

// ─── Status Labels & Classes ────────────────────────────────────────────────

export const API_KEY_STATUS_CONFIG: Record<
  ApiKeyStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-success/10 text-success",
  },
  revoked: {
    label: "Revoked",
    className: "bg-destructive/10 text-destructive",
  },
  expired: {
    label: "Expired",
    className: "bg-warning/10 text-warning",
  },
};

export const WEBHOOK_STATUS_CONFIG: Record<
  WebhookStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-success/10 text-success",
  },
  paused: {
    label: "Paused",
    className: "bg-warning/10 text-warning",
  },
  disabled: {
    label: "Disabled",
    className: "bg-destructive/10 text-destructive",
  },
};

// ─── Event Code Groups (for webhook event selector) ─────────────────────────

export interface EventCodeGroup {
  label: string;
  events: { code: string; label: string }[];
}

export const EVENT_CODE_GROUPS: EventCodeGroup[] = [
  {
    label: "Wildcards",
    events: [
      { code: "*", label: "All events (*)" },
      { code: "post.*", label: "All post events (post.*)" },
      { code: "page.*", label: "All page events (page.*)" },
      { code: "comment.*", label: "All comment events (comment.*)" },
      { code: "media.*", label: "All media events (media.*)" },
      { code: "taxonomy.*", label: "All taxonomy events (taxonomy.*)" },
    ],
  },
  {
    label: "Post Events",
    events: [
      { code: "post.created", label: "Post Created" },
      { code: "post.updated", label: "Post Updated" },
      { code: "post.deleted", label: "Post Deleted" },
      { code: "post.published", label: "Post Published" },
      { code: "post.unpublished", label: "Post Unpublished" },
      { code: "post.trashed", label: "Post Trashed" },
      { code: "post.restored", label: "Post Restored" },
      { code: "post.status_changed", label: "Post Status Changed" },
    ],
  },
  {
    label: "Page Events",
    events: [
      { code: "page.created", label: "Page Created" },
      { code: "page.updated", label: "Page Updated" },
      { code: "page.deleted", label: "Page Deleted" },
      { code: "page.published", label: "Page Published" },
    ],
  },
  {
    label: "Comment Events",
    events: [
      { code: "comment.created", label: "Comment Created" },
      { code: "comment.approved", label: "Comment Approved" },
      { code: "comment.rejected", label: "Comment Rejected" },
      { code: "comment.spammed", label: "Comment Spammed" },
      { code: "comment.deleted", label: "Comment Deleted" },
    ],
  },
  {
    label: "Media Events",
    events: [
      { code: "media.uploaded", label: "Media Uploaded" },
      { code: "media.updated", label: "Media Updated" },
      { code: "media.deleted", label: "Media Deleted" },
    ],
  },
  {
    label: "Taxonomy Events",
    events: [
      { code: "taxonomy.category_created", label: "Category Created" },
      { code: "taxonomy.category_deleted", label: "Category Deleted" },
      { code: "taxonomy.tag_created", label: "Tag Created" },
      { code: "taxonomy.tag_deleted", label: "Tag Deleted" },
    ],
  },
  {
    label: "User Events",
    events: [
      { code: "profile.updated", label: "Profile Updated" },
      { code: "role.assigned", label: "Role Assigned" },
    ],
  },
  {
    label: "System Events",
    events: [
      { code: "settings.updated", label: "Settings Updated" },
      { code: "menu.created", label: "Menu Created" },
      { code: "menu.updated", label: "Menu Updated" },
      { code: "menu.deleted", label: "Menu Deleted" },
      { code: "api.key_created", label: "API Key Created" },
      { code: "api.webhook_triggered", label: "Webhook Triggered" },
    ],
  },
];
