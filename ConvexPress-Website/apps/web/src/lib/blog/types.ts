/**
 * Blog & Content UI Types
 *
 * Shared types used across blog components, comment components,
 * archive pages, and search results.
 */


// ---------------------------------------------------------------------------
// Taxonomy Types
// ---------------------------------------------------------------------------

export interface TaxonomyTerm {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  count?: number;
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
  excerpt?: string;
  title: string;
  slug: string;
  path: string;
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
  contentType: "post" | "page" | "media" | "comment" | "course" | "product" | "event";
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
