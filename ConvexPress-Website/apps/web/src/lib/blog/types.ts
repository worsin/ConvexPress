/**
 * Blog & Content UI Types
 *
 * Shared types used across blog components, comment components,
 * archive pages, and search results.
 */

import type { PageSection } from "@/lib/page-builder/types";
import type { ConvexPressBlock, BlockContentMode } from "@/lib/blocks/types";

// ---------------------------------------------------------------------------
// Block Content Types (TipTap JSON)
// ---------------------------------------------------------------------------

export type BlockType =
  | "paragraph"
  | "heading"
  | "image"
  | "gallery"
  | "blockquote"
  | "code"
  | "orderedList"
  | "bulletList"
  | "table"
  | "embed"
  | "horizontalRule"
  | "html"
  | "callout"
  | "button"
  | "spacer"
  | "divider"
  | "columns"
  | "column"
  | "taskList"
  | "taskItem";

export interface BlockMark {
  type: "bold" | "italic" | "underline" | "strike" | "code" | "link" | "highlight";
  attrs?: {
    href?: string;
    target?: string;
    rel?: string;
    /** Highlight mark background color */
    color?: string;
  };
}

export interface InlineContent {
  type: "text";
  text: string;
  marks?: BlockMark[];
}

export interface HeadingBlock {
  type: "heading";
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 };
  content?: InlineContent[];
}

export interface ParagraphBlock {
  type: "paragraph";
  content?: InlineContent[];
}

export interface ImageBlock {
  type: "image";
  attrs: {
    /** Legacy / fallback URL. Optional when `mediaId` is provided. */
    src?: string;
    /** Media library reference. When present, render via MediaImage. */
    mediaId?: string;
    alt?: string;
    title?: string;
    width?: number;
    height?: number;
    caption?: string;
    /** WP-style alignment. Default "none". */
    align?: "none" | "left" | "center" | "right" | "wide" | "full";
    /** WP-style link target. Default "none". */
    linkTo?: "none" | "media" | "attachment" | "custom";
    /** Custom URL when `linkTo === "custom"`. */
    linkUrl?: string;
    /** Which registered size variant to render. Default "large". */
    sizeSlug?: "thumbnail" | "medium" | "medium_large" | "large" | "full";
  };
}

export interface GalleryBlock {
  type: "gallery";
  attrs: {
    columns?: number;
  };
  content: ImageBlock[];
}

export interface BlockquoteBlock {
  type: "blockquote";
  content?: (ParagraphBlock | HeadingBlock)[];
}

export interface CodeBlock {
  type: "code";
  attrs?: {
    language?: string;
  };
  content?: InlineContent[];
}

export interface ListItemBlock {
  type: "listItem";
  content?: ParagraphBlock[];
}

export interface OrderedListBlock {
  type: "orderedList";
  attrs?: { start?: number };
  content: ListItemBlock[];
}

export interface BulletListBlock {
  type: "bulletList";
  content: ListItemBlock[];
}

export interface TableCellBlock {
  type: "tableCell" | "tableHeader";
  attrs?: { colspan?: number; rowspan?: number };
  content?: ParagraphBlock[];
}

export interface TableRowBlock {
  type: "tableRow";
  content: TableCellBlock[];
}

export interface TableBlock {
  type: "table";
  content: TableRowBlock[];
}

export interface EmbedBlock {
  type: "embed";
  attrs: {
    src: string;
    provider?: "youtube" | "vimeo" | "twitter" | "generic";
    width?: number;
    height?: number;
  };
}

export interface HorizontalRuleBlock {
  type: "horizontalRule";
}

export interface HtmlBlock {
  type: "html";
  attrs: {
    content: string;
  };
}

export interface CalloutBlock {
  type: "callout";
  attrs: {
    type?: "info" | "warning" | "error" | "success";
  };
  content?: (ParagraphBlock | HeadingBlock)[];
}

export interface ButtonBlock {
  type: "button";
  attrs: {
    text?: string;
    url?: string;
    variant?: "primary" | "secondary" | "outline" | string;
    alignment?: "left" | "center" | "right";
  };
}

export interface SpacerBlock {
  type: "spacer";
  attrs: {
    height?: number;
  };
}

export interface DividerBlock {
  type: "divider";
  attrs: {
    style?: "solid" | "dashed" | "dotted" | "double";
  };
}

export interface ColumnBlock {
  type: "column";
  content?: BlockContent[];
}

export interface ColumnsBlock {
  type: "columns";
  attrs: {
    count?: number;
  };
  content?: ColumnBlock[];
}

export interface TaskItemBlock {
  type: "taskItem";
  attrs: {
    checked?: boolean;
  };
  content?: ParagraphBlock[];
}

export interface TaskListBlock {
  type: "taskList";
  content?: TaskItemBlock[];
}

export type BlockContent =
  | HeadingBlock
  | ParagraphBlock
  | ImageBlock
  | GalleryBlock
  | BlockquoteBlock
  | CodeBlock
  | OrderedListBlock
  | BulletListBlock
  | TableBlock
  | EmbedBlock
  | HorizontalRuleBlock
  | HtmlBlock
  | CalloutBlock
  | ButtonBlock
  | SpacerBlock
  | DividerBlock
  | ColumnsBlock
  | ColumnBlock
  | TaskListBlock
  | TaskItemBlock;

export interface BlockDocument {
  type: "doc";
  content: BlockContent[];
}

// ---------------------------------------------------------------------------
// Taxonomy Types
// ---------------------------------------------------------------------------

export interface TaxonomyTerm {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  count: number;
}

export interface PostCategory extends TaxonomyTerm {
  taxonomy: "category";
}

export interface PostTag extends TaxonomyTerm {
  taxonomy: "tag";
}

// ---------------------------------------------------------------------------
// Author Types
// ---------------------------------------------------------------------------

export interface AuthorData {
  _id: string;
  displayName: string;
  slug: string;
  avatarUrl?: string;
  bio?: string;
  websiteUrl?: string;
  socialLinks?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
  };
  postCount?: number;
}

// ---------------------------------------------------------------------------
// Post Types
// ---------------------------------------------------------------------------

export interface PostCard {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  featuredImageUrl?: string;
  featuredImageAlt?: string;
  publishedAt?: string;
  author: {
    _id: string;
    displayName: string;
    slug: string;
    avatarUrl?: string;
  };
  primaryCategory?: {
    _id: string;
    name: string;
    slug: string;
  };
  commentCount: number;
  isSticky?: boolean;
  readingTime?: number;
}

export interface PostDetail extends PostCard {
  content: BlockDocument | null;
  contentMode?: BlockContentMode;
  blocks?: ConvexPressBlock[];
  blocksVersion?: number;
  blocksRevision?: number;
  categories: PostCategory[];
  tags: PostTag[];
  seoTitle?: string;
  seoDescription?: string;
  ogImageUrl?: string;
  canonicalUrl?: string;
  isPasswordProtected?: boolean;
  previousPost?: { title: string; slug: string } | null;
  nextPost?: { title: string; slug: string } | null;
}

// ---------------------------------------------------------------------------
// Page Types
// ---------------------------------------------------------------------------

export interface PageDetail {
  _id: string;
  title: string;
  slug: string;
  path: string;
  content: BlockDocument | null;
  featuredImageUrl?: string;
  featuredImageAlt?: string;
  template?: "default" | "full-width" | "sidebar-left" | "sidebar-right" | "no-sidebar" | "landing" | "blank";
  parentId?: string;
  menuOrder?: number;
  depth?: number;
  seoTitle?: string;
  seoDescription?: string;
  ogImageUrl?: string;
  canonicalUrl?: string;
  isPasswordProtected?: boolean;
  pageSections?: PageSection[];
  contentMode?: BlockContentMode;
  blocks?: ConvexPressBlock[];
  blocksVersion?: number;
  blocksRevision?: number;
  /** Breadcrumbs for hierarchical navigation */
  breadcrumbs?: Array<{
    _id: string;
    title: string;
    slug: string;
    path: string;
  }>;
  /** Direct children of this page */
  children?: Array<{
    _id: string;
    title: string;
    slug: string;
    path: string;
  }>;
}

// ---------------------------------------------------------------------------
// Comment Types
// ---------------------------------------------------------------------------

/**
 * Comment tree node returned by the Convex `comments.forPost` query.
 * Matches the `CommentTreeNode` shape from `helpers/comment.ts`.
 *
 * All commenters must be authenticated in ConvexPress (no guest fields).
 */
export interface CommentData {
  _id: string;
  postId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  depth: number;
  likeCount: number;
  flagCount: number;
  isEdited: boolean;
  editedAt?: number;
  isLikedByMe: boolean;
  /** Whether the current user can edit this comment (owner within grace period) */
  canEdit: boolean;
  replies: CommentData[];
}

// ---------------------------------------------------------------------------
// Archive Types
// ---------------------------------------------------------------------------

export interface ArchiveData {
  type: "category" | "tag" | "author" | "date";
  title: string;
  description?: string;
  slug: string;
  postCount: number;
  imageUrl?: string;
}

export interface DateArchiveGroup {
  year: number;
  month?: number;
  postCount: number;
}

// ---------------------------------------------------------------------------
// Search Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  highlightedExcerpt?: string;
  contentType: "post" | "page" | "media" | "comment";
  publishedAt?: string;
  author?: {
    displayName: string;
    slug: string;
  };
  primaryCategory?: {
    name: string;
    slug: string;
  };
  relevanceScore?: number;
  /** Media-specific fields */
  mimeType?: string;
  /** URL path for the result (from search index) */
  url?: string;
  /** Category names (denormalized from search index) */
  categoryNames?: string[];
  /** Tag names (denormalized from search index) */
  tagNames?: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  /** Total result count - matches Convex API field name `total` */
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  filters?: {
    contentType?: string;
    category?: string;
    tag?: string;
    author?: string;
    dateFrom?: number;
    dateTo?: number;
  };
  suggestions?: string[];
}

// ---------------------------------------------------------------------------
// Pagination Types
// ---------------------------------------------------------------------------

export interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ---------------------------------------------------------------------------
// Utility Types
// ---------------------------------------------------------------------------

export interface SharePlatform {
  id: string;
  label: string;
  icon: string;
  getUrl: (url: string, title: string) => string;
}
