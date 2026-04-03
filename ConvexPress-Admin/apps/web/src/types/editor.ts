/**
 * Admin Editor Layout UI - TypeScript Types
 *
 * All editor-related types and constants for the post/page editor system.
 * Used by EditorLayout, metabox components, hooks, and route files.
 */

/** The content type being edited */
export type EditorContentType = "post" | "page";

/** Post status values */
export type PostStatus =
  | "auto-draft"
  | "draft"
  | "pending"
  | "publish"
  | "future"
  | "private"
  | "trash";

/** Post visibility values */
export type PostVisibility = "public" | "private" | "password";

/** Comment status values */
export type CommentStatus = "open" | "closed";

// ─── Structured Content Types ──────────────────────────────────────────────

/** Hero section for structured content */
export interface HeroFields {
  title: string;
  subtitle: string;
  content: string;
  imageId: string | null;
  videoUrl: string;
  ctaText: string;
  ctaUrl: string;
}

/** Topic section for structured content */
export interface TopicFields {
  title: string;
  subtitle: string;
  content: string;
  imageId: string | null;
  videoUrl: string;
}

/** Summary section for structured content */
export interface SummaryFields {
  title: string;
  content: string;
}

/** Default hero values */
export const DEFAULT_HERO: HeroFields = {
  title: "",
  subtitle: "",
  content: "",
  imageId: null,
  videoUrl: "",
  ctaText: "",
  ctaUrl: "",
};

/** Default topic values */
export const DEFAULT_TOPIC: TopicFields = {
  title: "",
  subtitle: "",
  content: "",
  imageId: null,
  videoUrl: "",
};

/** Default summary values */
export const DEFAULT_SUMMARY: SummaryFields = {
  title: "",
  content: "",
};

// ─── Editor Form Types ────────────────────────────────────────────────────

/** The form values managed by TanStack Form */
export interface EditorFormValues {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: PostStatus;
  visibility: PostVisibility;
  password: string;
  commentStatus: CommentStatus;
  isSticky: boolean;
  featuredImageId: string | null;
  authorId: string;
  scheduledFor: Date | null;
  categoryIds: string[];
  tagIds: string[];
  menuOrder: number;
  // Structured content fields
  hero: HeroFields;
  topics: TopicFields[];
  summary: SummaryFields;
  sources: string;
  tableOfContents: string;
  pagePrompt: string;
}

/** Default form values for a new post */
export const DEFAULT_EDITOR_FORM_VALUES: EditorFormValues = {
  title: "",
  slug: "",
  content: "",
  excerpt: "",
  status: "auto-draft",
  visibility: "public",
  password: "",
  commentStatus: "open",
  isSticky: false,
  featuredImageId: null,
  authorId: "",
  scheduledFor: null,
  categoryIds: [],
  tagIds: [],
  menuOrder: 0,
  // Structured content defaults
  hero: DEFAULT_HERO,
  topics: [],
  summary: DEFAULT_SUMMARY,
  sources: "",
  tableOfContents: "",
  pagePrompt: "",
};

/** Autosave state tracked separately from form */
export interface AutosaveState {
  status: "idle" | "saving" | "saved" | "error";
  lastSavedAt: number | null;
  error: string | null;
}

/** Metabox configuration for drag-and-drop ordering */
export interface MetaboxConfig {
  id: string;
  title: string;
  isCollapsed: boolean;
  isVisible: boolean;
  isDraggable: boolean;
  position: "sidebar" | "main" | "after_title";
}

/** The default metabox ordering for posts */
export const DEFAULT_POST_METABOXES: MetaboxConfig[] = [
  {
    id: "publish",
    title: "Publish",
    isCollapsed: false,
    isVisible: true,
    isDraggable: false,
    position: "sidebar",
  },
  {
    id: "categories",
    title: "Categories",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "tags",
    title: "Tags",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "featured-image",
    title: "Featured Image",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "excerpt",
    title: "Excerpt",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "discussion",
    title: "Discussion",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "author",
    title: "Author",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "revisions",
    title: "Revisions",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "slug",
    title: "Slug",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "seo",
    title: "SEO",
    isCollapsed: true,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
];

/** The default metabox ordering for pages */
export const DEFAULT_PAGE_METABOXES: MetaboxConfig[] = [
  {
    id: "publish",
    title: "Publish",
    isCollapsed: false,
    isVisible: true,
    isDraggable: false,
    position: "sidebar",
  },
  {
    id: "featured-image",
    title: "Featured Image",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "excerpt",
    title: "Excerpt",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "discussion",
    title: "Discussion",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "author",
    title: "Author",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "revisions",
    title: "Revisions",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "slug",
    title: "Slug",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "page-attributes",
    title: "Page Attributes",
    isCollapsed: false,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
  {
    id: "seo",
    title: "SEO",
    isCollapsed: true,
    isVisible: true,
    isDraggable: true,
    position: "sidebar",
  },
];

/** User preferences for metabox layout, stored in localStorage */
export interface MetaboxPreferences {
  order: string[];
  collapsed: string[];
  hidden: string[];
}

/** Category node in the hierarchical tree */
export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  postCount: number;
  children: CategoryNode[];
}

/** Tag item for tag input/autocomplete */
export interface TagItem {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

/** Media item for MediaPicker */
export interface MediaItem {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  altText: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
}

/** Author item for AuthorSelector */
export interface AuthorItem {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  role: string;
}

// ─── TipTap Editor Types ──────────────────────────────────────────────────────

import type { Editor } from "@tiptap/core";

/** Block definition for the block inserter */
export interface BlockDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: BlockCategory;
  aliases: string[];
  /** The TipTap command to insert this block */
  action: (editor: Editor) => void;
}

/** Block categories in the inserter */
export type BlockCategory = "text" | "media" | "design" | "reusable";

/** Slash command item displayed in the suggestion menu */
export interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  aliases: string[];
  action: (editor: Editor) => void;
}

/** Editor save status for the SaveStatusIndicator */
export type EditorSaveStatus =
  | "idle"
  | "unsaved"
  | "saving"
  | "saved"
  | "error";

/** Callout block type variants */
export type CalloutType = "info" | "warning" | "error" | "success";

/** Button block variant options */
export type ButtonVariant = "primary" | "secondary" | "outline";

/** Divider style options */
export type DividerStyle = "solid" | "dashed" | "dotted" | "double";

/** Embed provider types */
export type EmbedProvider = "youtube" | "vimeo" | "twitter" | "generic";

/** Editor context value provided by ContentEditorProvider */
export interface EditorContextValue {
  /** Whether the editor is in read-only mode */
  isReadOnly: boolean;
  /** Current user's capabilities affecting editor features */
  canUploadFiles: boolean;
  canCreateReusableBlocks: boolean;
  /** Callback to update the content string in the form */
  onContentChange: (json: string) => void;
}
