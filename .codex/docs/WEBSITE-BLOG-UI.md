# Website Blog & Content UI - Expert Knowledge Document

**System:** Website Blog & Content UI
**Expert Type:** Website UI Expert
**Status:** Implementation Ready
**Priority:** P1 - High
**WordPress Equivalent:** `index.php` (blog index), `single.php` (single post), `page.php` (single page), `archive.php` (category/tag/author archives), `search.php` (search results), `404.php` (not found), `comments.php` (comment template), `content.php` partials, theme template hierarchy
**Last Analyzed:** 2026-02-09

---

## Quick Reference

### What This Expert Does

The Website Blog & Content UI Expert owns all public-facing content display pages and components rendered on the website app (`ConvexPress-Website/`). This is the entire frontend reading experience -- the blog index, single post pages, single page rendering, category/tag/author archive pages, the search results page, the 404 page, and all reusable content display components (post cards, comment sections, pagination, share buttons, related posts, block content rendering). It is responsible for:

1. **Blog index page** -- Post cards in grid/list layout, sticky post highlighting, pagination
2. **Single post page** -- Full post rendering with title, author, featured image, block content, categories, tags, share buttons, author box, related posts, comment section
3. **Single page rendering** -- Title, content, page template rendering
4. **Archive pages** -- Category, tag, and author archives with header + filtered post lists + pagination
5. **Search results page** -- Search form, result cards with highlighted excerpts, filters, pagination, empty state
6. **404 page** -- Friendly error with search suggestion and popular posts
7. **Comment section** -- Threaded comments display, reply form, like/flag buttons, comment pagination
8. **Block content renderer** -- Rendering the JSON block editor output as HTML (heading, paragraph, image, gallery, code, quote, list, embed, table)
9. **Post card component** -- Reusable card for listings (thumbnail, title, excerpt, author, date, categories)
10. **Pagination component** -- Page numbers, prev/next, total count
11. **Share buttons** -- Copy link, social sharing (Twitter/X, Facebook, LinkedIn, Reddit)
12. **Related posts** -- Same-category or same-tag posts, excluding current
13. **SEO head tags** -- Meta tags, Open Graph, structured data, canonical URLs via TanStack Start SSR
14. **Loading and error states** -- Skeleton loaders, error boundaries, empty states
15. **Accessibility** -- Semantic HTML, ARIA landmarks, focus management, keyboard navigation

This expert does NOT:
- Define Convex queries or mutations (those belong to Post System, Page System, Comment System, Taxonomy System, Search System, SEO System experts)
- Handle admin-side content management (that belongs to Admin Editor UI, Admin List Table UI)
- Handle website layout chrome (header, footer, navigation -- that belongs to Website Layout UI)
- Handle auth page rendering (that belongs to Website Auth UI)
- Handle user dashboard rendering (that belongs to Website Dashboard UI)

### Key Concepts

| Concept | Description |
|---------|-------------|
| **PostCard** | Reusable card component for post listings -- thumbnail, title, excerpt, author avatar + name, date, primary category badge |
| **PostCardFeatured** | Larger visual treatment for sticky/featured posts at the top of the blog index |
| **BlockContentRenderer** | Component that converts TipTap JSON block content into rendered HTML/React elements |
| **CommentThread** | Recursive threaded comment display with configurable depth (default 5 levels) |
| **ArchiveHeader** | Shared header for category/tag/author archive pages with title, description, post count |
| **PostPagination** | Cursor-based or page-number pagination for post listings |
| **SEOHead** | TanStack Start `head` configuration for meta tags, OG, Twitter Cards, JSON-LD, canonical URLs |
| **ReadTime** | Estimated reading time calculated from word count (average 200 wpm) |
| **AutoExcerpt** | First 150 characters of plain text extracted from block content when no manual excerpt exists |
| **PasswordGate** | Form displayed instead of content for password-protected posts |
| **PreviewBanner** | Banner shown at top of post when viewing via preview URL (`?preview=true&nonce=...`) |
| **SSR Loader** | TanStack Start server-side loaders that fetch data before page render for SEO |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| Blog URL | `/` or `/blog` (configurable) | `/blog` (blog index), `/` (front page or latest posts) |
| Single Post URL | `/{year}/{month}/{day}/{slug}/` or `/{slug}/` | `/blog/{slug}` |
| Single Page URL | `/{slug}/` (hierarchical) | `/{path}` (computed from parent chain) |
| Category Archive | `/category/{slug}/` | `/category/{slug}` |
| Tag Archive | `/tag/{slug}/` | `/tag/{slug}` |
| Author Archive | `/author/{slug}/` | `/author/{slug}` |
| Search Results | `/?s={query}` | `/search?q={query}` |
| 404 Page | `404.php` template | `/404` route (catch-all) |
| Template Hierarchy | PHP template files (single.php, archive.php, etc.) | TanStack Start route files with shared layout components |
| Content Rendering | `the_content()` filter chain | BlockContentRenderer React component parsing TipTap JSON |
| Comment Display | `wp_list_comments()` + `comments.php` | CommentThread React component with Convex reactive subscription |
| Pagination | `paginate_links()` / `the_posts_pagination()` | PostPagination React component |
| Featured Image | `the_post_thumbnail()` | FeaturedImage component with responsive srcset |
| Excerpt | `the_excerpt()` / `wp_trim_excerpt()` | Manual excerpt or auto-generated (first 150 chars plain text) |
| Share Buttons | Plugin (AddToAny, Social Warfare, etc.) | Built-in PostShareButtons component |
| Related Posts | Plugin (YARPP, Jetpack, etc.) | Built-in PostRelatedPosts component (same-category query) |
| SSR | PHP renders HTML on every request | TanStack Start SSR with Convex preloading in loaders |
| SEO Tags | Yoast/RankMath plugins inject into `wp_head` | SeoHead component in TanStack Start `head()` configuration |
| Reading Time | Plugin (Reading Time WP, etc.) | Built-in utility function |

---

## Architecture Overview

### Page Rendering Flow

```
User visits /blog/my-first-post
    |
    v
TanStack Start SSR loader executes on server:
    1. Fetch post by slug: posts.get({ slug: "my-first-post" })
    2. If post not found -> throw redirect to /404
    3. If post is private -> check auth, 404 if unauthorized
    4. If post is password-protected -> return post with isPasswordProtected flag
    5. Fetch post taxonomies: taxonomies.getByPost({ postId })
    6. Fetch post SEO meta: seo.getPostSeo({ postId })
    7. Resolve SEO: apply fallback chain (custom -> template -> content -> global)
    8. Return { post, taxonomies, seoMeta } to component
    |
    v
Component renders with SSR data:
    - SeoHead renders meta tags, OG, JSON-LD in <head>
    - PostHeader renders featured image, title, author, date, categories
    - BlockContentRenderer renders JSON content as React elements
    - PostFooter renders tags, share buttons
    - PostAuthorBox renders author bio card
    - PostRelatedPosts fetches and renders 3 related posts
    - CommentSection renders threaded comments (client-side reactive)
    |
    v
Client-side hydration:
    - Convex subscriptions activate for real-time comment updates
    - Share buttons become interactive
    - Comment form becomes functional
    - Like/flag buttons become functional
```

### Blog Index Flow

```
User visits /blog?page=2
    |
    v
TanStack Start SSR loader:
    1. Parse page number from search params (default: 1)
    2. Fetch posts: posts.list({ status: "publish", page, perPage: 10 })
    3. Fetch site settings: settings.get("reading") for posts_per_page
    4. Return { posts, pagination, settings }
    |
    v
Component renders:
    - Page title "Blog" (configurable via Settings)
    - If page 1: Sticky posts rendered as PostCardFeatured
    - Remaining posts rendered as PostCard in grid
    - PostPagination renders page numbers / prev/next
    |
    v
Client-side:
    - Convex subscription on posts.list updates live (new publish appears)
    - Pagination links navigate with client-side transitions
```

### Search Results Flow

```
User visits /search?q=react+hooks
    |
    v
TanStack Start SSR loader:
    1. Parse query from search params
    2. If no query: return { results: null }
    3. Fetch: search.execute({ query: "react hooks", contentTypes: ["post", "page"], page, perPage: 10 })
    4. Return { query, results, pagination }
    |
    v
Component renders:
    - Search form (pre-filled with query)
    - Result count: "42 results for 'react hooks'"
    - SearchResultCard for each result (with highlighted excerpts via <mark>)
    - PostPagination
    - If no results: EmptySearchState with suggestions
    |
    v
Client-side:
    - Search form submits navigate to /search?q=...
    - Live suggestions via debounced search.suggest query (future enhancement)
```

### Provider Stack (Website App)

```
<ConvexProvider client={convexClient}>
  <AuthKitProvider>       {/* @auth/authkit-tanstack-react-start/client */}
    <html>
      <head>
        <HeadContent />   {/* SEO tags, OG, JSON-LD injected here via head() */}
      </head>
      <body>
        <Header />        {/* Website Layout UI -- uses useAuth() for sign-in/out */}
        <Outlet />        {/* Route components (blog, posts, pages, archives, etc.) */}
        <Footer />        {/* Website Layout UI */}
        <Toaster />       {/* Sonner toast notifications */}
      </body>
    </html>
  </AuthKitProvider>
</ConvexProvider>
```

### Real-Time Behavior

- **Blog index:** `useQuery(api.posts.list, { status: "publish" })` is a reactive Convex subscription. When a new post is published from the admin, the blog index updates live without page refresh for users who already have the page loaded.
- **Single post comments:** `useQuery(api.comments.forPost, { postId })` updates live. New comments from other users appear immediately. Like/flag counts update reactively.
- **Comment count on post cards:** The `commentCount` field on the post object is denormalized and updates reactively when new comments are approved.
- **Search results:** Search queries are point-in-time (not subscribed). Users see results at time of search; new content requires a new search.
- **Archive pages:** Archive post lists update reactively if a post is published/unpublished while a user is viewing the archive.

### SSR Considerations

All content pages use TanStack Start's SSR capabilities for SEO:

- **Loader data fetching:** Each route's `loader` fetches content and SEO data server-side using Convex's `fetchQuery` (or equivalent server-side query mechanism). This ensures search engines see fully rendered content.
- **head() configuration:** Each route uses TanStack Start's `head()` to inject meta tags, OG tags, canonical URLs, and JSON-LD into the `<head>`. This must be computed in the loader, not client-side.
- **Progressive enhancement:** Content is fully readable without JavaScript. Comment forms and interactive elements (like, share, reply) enhance with JavaScript after hydration.
- **Caching:** Published content can be cached at the CDN layer. Convex's reactive queries handle cache invalidation on the client side.
- **RSS feed discovery:** Blog pages include `<link rel="alternate" type="application/rss+xml">` in the head for feed readers.

---

## TypeScript Types

### Post Display Types

```typescript
// ConvexPress-Website/apps/web/src/lib/blog/types.ts

import type { Id } from "@convexpress-website/backend/convex/_generated/dataModel";

/** Post data as returned by posts.get query (denormalized for display) */
export interface PostDisplay {
  _id: Id<"posts">;
  title: string;
  slug: string;
  content: string;                    // Serialized TipTap JSON
  excerpt?: string;                   // Manual excerpt
  status: "publish" | "private" | "password";  // Only visible statuses on website
  authorId: string;                   // user identifier
  author: PostAuthor;                 // Denormalized author data
  visibility: "public" | "private" | "password";
  isPasswordProtected: boolean;       // true if visibility === "password"
  publishedAt: number;                // Timestamp (ms)
  commentStatus: "open" | "closed";
  commentCount: number;
  isSticky: boolean;
  featuredImageId?: string;
  featuredImageUrl?: string;          // Resolved URL from Media System
  createdAt: number;
  updatedAt: number;
}

/** Denormalized author data attached to posts */
export interface PostAuthor {
  id: string;                         // user identifier
  name: string;                       // Display name (firstName + lastName)
  slug: string;                       // URL-safe author slug
  avatarUrl?: string;                 // Convex Auth profile picture URL
  bio?: string;                       // Author biography from user profile
  postCount?: number;                 // Total published posts by this author
}

/** Post card data -- lighter than full PostDisplay */
export interface PostCardData {
  _id: Id<"posts">;
  title: string;
  slug: string;
  excerpt?: string;
  autoExcerpt: string;                // First 150 chars of plain text content
  author: PostAuthor;
  publishedAt: number;
  commentCount: number;
  isSticky: boolean;
  featuredImageUrl?: string;
  primaryCategory?: TaxonomyBadge;    // First assigned category
  readTimeMinutes: number;            // Estimated reading time
}

/** Taxonomy badge (category or tag) for display */
export interface TaxonomyBadge {
  _id: string;
  name: string;
  slug: string;
  type: "category" | "tag";
}

/** Page data for single page rendering */
export interface PageDisplay {
  _id: Id<"posts">;
  title: string;
  slug: string;
  path: string;                       // Full URL path (e.g., "/services/web-design")
  content: string;                    // Serialized TipTap JSON
  author: PostAuthor;
  publishedAt: number;
  featuredImageUrl?: string;
  pageTemplate?: string;              // Template key (e.g., "full-width", "sidebar")
  commentStatus: "open" | "closed";
  commentCount: number;
}

/** Search result item */
export interface SearchResultItem {
  _id: string;
  contentType: "post" | "page";
  title: string;
  slug: string;
  url: string;                        // Full URL path
  highlightedExcerpt: string;         // Excerpt with <mark> tags around matched terms
  author: PostAuthor;
  publishedAt: number;
  featuredImageUrl?: string;
  primaryCategory?: TaxonomyBadge;
  score: number;                      // Relevance score
}

/** Paginated list result for post listings */
export interface PostListResult {
  posts: PostCardData[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** Search results response */
export interface SearchResults {
  query: string;
  items: SearchResultItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  searchTime: number;                 // Query execution time (ms)
}

/** Archive page header data */
export interface ArchiveHeader {
  type: "category" | "tag" | "author";
  name: string;
  slug: string;
  description?: string;               // Category/tag description, or author bio
  postCount: number;
  avatarUrl?: string;                 // Author avatar (author archives only)
}

/** SEO metadata resolved for a page */
export interface ResolvedSeo {
  title: string;
  description: string;
  canonical: string;
  ogType: "website" | "article";
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterCard: "summary" | "summary_large_image";
  noindex?: boolean;
  jsonLd: Record<string, unknown>;    // Schema.org JSON-LD object
  prevUrl?: string;                   // Previous page in pagination
  nextUrl?: string;                   // Next page in pagination
}

/** Comment display data */
export interface CommentDisplay {
  _id: string;
  postId: Id<"posts">;
  parentId?: string;                  // Parent comment ID (for threading)
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;                    // Plain text or limited markdown
  status: "approved";                 // Only approved comments shown on website
  likeCount: number;
  isLikedByCurrentUser: boolean;
  createdAt: number;
  updatedAt: number;
  depth: number;                      // Nesting level (0 = top-level)
  replies: CommentDisplay[];          // Child comments (recursive)
  canReply: boolean;                  // Whether current user can reply
  canEdit: boolean;                   // Within grace period and is author
  canFlag: boolean;                   // Whether current user can flag
  isFlaggedByCurrentUser: boolean;
}

/** Comment form values */
export interface CommentFormValues {
  content: string;
  parentId?: string;                  // If replying to a comment
}

/** Password form state for protected posts */
export interface PasswordFormState {
  password: string;
  error?: string;
  isSubmitting: boolean;
}
```

---

## Component Inventory

### Layout Components

#### `BlogLayout`

**File:** `ConvexPress-Website/apps/web/src/components/blog/BlogLayout.tsx`
**Purpose:** Shared wrapper for blog index and archive pages. Provides consistent page structure with optional sidebar.

**Props:**
```typescript
interface BlogLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;          // Optional sidebar (widgets)
  className?: string;
}
```

**UI Structure:**
```
+----------------------------------------------------------+
|  [Main Content Area]              | [Sidebar (optional)]  |
|                                   |                       |
|  {children}                       | Widget Area           |
|                                   | (Recent Posts,        |
|                                   |  Categories,          |
|                                   |  Tags, Search, etc.)  |
|                                   |                       |
+----------------------------------------------------------+
```

**Styling:**
- Main content: `flex-1` or full width when no sidebar
- Sidebar: `w-64` fixed width, hidden on mobile (responsive)
- Container: `max-w-6xl mx-auto px-4`
- All colors via CSS variables

---

#### `ArchiveHeader`

**File:** `ConvexPress-Website/apps/web/src/components/blog/ArchiveHeader.tsx`
**Purpose:** Header section for category, tag, and author archive pages. Shows the archive type label, name, description, and post count.

**Props:**
```typescript
interface ArchiveHeaderProps {
  type: "category" | "tag" | "author";
  name: string;
  description?: string;
  postCount: number;
  avatarUrl?: string;                 // Author archives only
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| Category: Technology                                      |
| Articles about web development, JavaScript, and React.    |
| 42 posts                                                  |
+----------------------------------------------------------+
```

For author archives:
```
+----------------------------------------------------------+
| [Avatar]  Author: Jane Smith                              |
|           Full-stack developer and tech writer.            |
|           42 posts                                        |
+----------------------------------------------------------+
```

**Styling:**
- Type label: `text-muted-foreground text-xs uppercase tracking-wider`
- Name: `text-xl font-medium`
- Description: `text-muted-foreground text-xs/relaxed`
- Post count: `text-muted-foreground text-xs`
- Avatar: `size-12 rounded-none` (matches ConvexPress's no-rounded-corners pattern)
- Bottom border: `border-b border-border`

---

### Post Card Components

#### `PostCard`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostCard.tsx`
**Purpose:** Standard post card used in blog index, archive pages, related posts, and search results. Displays thumbnail, title, excerpt, author, date, and primary category.

**Props:**
```typescript
interface PostCardProps {
  post: PostCardData;
  variant?: "default" | "compact" | "horizontal";
  showExcerpt?: boolean;              // Default: true
  showAuthor?: boolean;               // Default: true
  showCategory?: boolean;             // Default: true
  showReadTime?: boolean;             // Default: true
  className?: string;
}
```

**UI Structure (default variant):**
```
+--------------------------------+
| [Featured Image]               |
| (aspect-ratio: 16/9)           |
+--------------------------------+
| Category Badge                 |
| Post Title (H3, linked)       |
| Excerpt text trimmed to 2      |
| lines with ellipsis...         |
|                                |
| [Avatar] Author Name  ·  Date |
| 5 min read                     |
+--------------------------------+
```

**UI Structure (horizontal variant):**
```
+------------------+-----------------------------+
| [Featured Image] | Category Badge              |
| (aspect-ratio    | Post Title (H3, linked)    |
|  4/3, fixed      | Excerpt text trimmed...     |
|  width)          |                             |
|                  | [Avatar] Author  ·  Date    |
+------------------+-----------------------------+
```

**UI Structure (compact variant):**
```
+----------------------------------------------------------+
| Post Title (linked)                              Date     |
+----------------------------------------------------------+
```

**Responsibilities:**
- Render featured image with `loading="lazy"` for images below the fold
- Category badge links to `/category/{slug}`
- Title is an `<a>` link to `/blog/{slug}` wrapped in `<h3>`
- Auto-excerpt if no manual excerpt: first 150 chars of plain text from content
- Author avatar (16x16) + name + publication date (relative or absolute based on age)
- Reading time estimate based on word count

**Base UI Dependencies:** None directly (uses native HTML elements with Tailwind)
**Styling:**
- Card border: `ring-1 ring-foreground/10 bg-card`
- Image: `aspect-video object-cover` (no rounded corners)
- Title: `text-sm font-medium text-foreground hover:text-primary transition-colors`
- Excerpt: `text-xs text-muted-foreground line-clamp-2`
- Author name: `text-xs text-muted-foreground`
- Date: `text-xs text-muted-foreground`
- Category badge: `text-xs bg-muted px-1.5 py-0.5 text-foreground`

---

#### `PostCardFeatured`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostCardFeatured.tsx`
**Purpose:** Larger, more prominent card for sticky/featured posts displayed at the top of the blog index.

**Props:**
```typescript
interface PostCardFeaturedProps {
  post: PostCardData;
  className?: string;
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| [Featured Image -- Full Width, Taller]                    |
| (aspect-ratio: 21/9 or 2/1)                              |
+----------------------------------------------------------+
| Category Badge                                            |
| Post Title (H2, larger)                                   |
| Excerpt text -- full paragraph, not truncated             |
|                                                            |
| [Avatar] Author Name  ·  Date  ·  5 min read             |
+----------------------------------------------------------+
```

**Styling:**
- Spans full width of the content area
- Image: `aspect-[21/9] object-cover`
- Title: `text-lg font-medium`
- Excerpt: `text-xs/relaxed text-muted-foreground` (no line clamp)
- Larger padding and spacing than regular PostCard

---

#### `PostCardSkeleton`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostCardSkeleton.tsx`
**Purpose:** Loading skeleton placeholder matching the PostCard dimensions.

**Props:**
```typescript
interface PostCardSkeletonProps {
  variant?: "default" | "compact" | "horizontal";
}
```

**Uses:** Existing `Skeleton` component from `@/components/ui/skeleton`

---

### Single Post Components

#### `PostHeader`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostHeader.tsx`
**Purpose:** Hero section of a single blog post. Displays the featured image (full-width), category badges, post title (H1), author info, publication date, and reading time.

**Props:**
```typescript
interface PostHeaderProps {
  post: PostDisplay;
  categories: TaxonomyBadge[];
  readTimeMinutes: number;
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| [Featured Image -- Full Width]                            |
| (aspect-ratio: 21/9, optional overlay gradient)           |
+----------------------------------------------------------+
|                                                            |
| Category  ·  Category                                     |
|                                                            |
| Post Title (H1)                                           |
|                                                            |
| [Avatar] Author Name  ·  Feb 9, 2026  ·  5 min read     |
|                                                            |
+----------------------------------------------------------+
```

**Styling:**
- Featured image: `w-full aspect-[21/9] object-cover` with optional `bg-gradient-to-t from-black/40` overlay for text readability
- Categories: `flex gap-2`, each as a linked badge (`text-xs bg-muted px-1.5 py-0.5`)
- Title: `text-2xl font-medium text-foreground leading-tight`
- Author section: `flex items-center gap-2 text-xs text-muted-foreground`
- Avatar: `size-8 rounded-none`

---

#### `BlockContentRenderer`

**File:** `ConvexPress-Website/apps/web/src/components/blog/BlockContentRenderer.tsx`
**Purpose:** Converts TipTap JSON document content into rendered React elements. This is the frontend counterpart to the Content Editor System's block editor -- it reads the same JSON format and produces readable HTML.

**Props:**
```typescript
interface BlockContentRendererProps {
  content: string;                    // JSON string (TipTap document format)
  className?: string;
}
```

**Supported Block Types:**

| Block Type | Rendered As | Notes |
|-----------|------------|-------|
| `paragraph` | `<p>` | With inline marks (bold, italic, link, code, strikethrough) |
| `heading` | `<h2>` through `<h6>` | Level from block attrs. H1 reserved for post title. |
| `image` | `<figure><img><figcaption>` | Responsive with srcset, lazy loading, alt text |
| `gallery` | `<div>` grid of `<figure>` | 2-3 column grid based on image count |
| `blockquote` | `<blockquote>` | Styled with left border accent |
| `codeBlock` | `<pre><code>` | With syntax highlighting (language from attrs) |
| `bulletList` | `<ul><li>` | Nested lists supported |
| `orderedList` | `<ol><li>` | Start number from attrs |
| `listItem` | `<li>` | Can contain nested blocks |
| `horizontalRule` | `<hr>` | Styled divider |
| `table` | `<table>` | Responsive wrapper with horizontal scroll |
| `embed` | `<iframe>` or embed component | YouTube, Vimeo, Twitter embeds |
| `reusableBlock` | Resolved content | Fetched from Convex and rendered inline |

**Inline Marks:**

| Mark | Rendered As |
|------|------------|
| `bold` | `<strong>` |
| `italic` | `<em>` |
| `link` | `<a>` (with `rel="noopener noreferrer"` for external) |
| `code` | `<code>` (inline) |
| `strikethrough` | `<del>` |
| `highlight` | `<mark>` |
| `underline` | `<u>` |

**Styling:**
- Prose container: Apply consistent typography spacing via `space-y-4`
- Paragraphs: `text-xs/relaxed text-foreground`
- Headings: `text-sm font-medium` (h2), `text-sm font-medium` (h3), etc., with `mt-6 mb-2`
- Links: `text-primary underline underline-offset-4 hover:text-primary/80`
- Blockquotes: `border-l-2 border-primary/30 pl-4 italic text-muted-foreground`
- Code blocks: `bg-muted p-4 overflow-x-auto text-xs font-mono`
- Images: `w-full` with optional `max-w-prose mx-auto`
- Tables: `w-full border-collapse` with `border border-border` on cells
- All colors via CSS variables -- NEVER hardcoded

**Code Syntax Highlighting:**
- Use a lightweight client-side highlighter (e.g., `shiki` or `highlight.js`)
- Theme must use CSS variables to match the site theme
- Language detection from block attrs (`language` field)
- Fallback to plain `<pre><code>` if no highlighter loaded

---

#### `PostFooter`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostFooter.tsx`
**Purpose:** Section below the post content showing tags and share buttons.

**Props:**
```typescript
interface PostFooterProps {
  tags: TaxonomyBadge[];
  postUrl: string;                    // Full URL for sharing
  postTitle: string;                  // Title for share text
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| Tags: [React] [JavaScript] [Web Dev]                     |
+----------------------------------------------------------+
| Share:  [Twitter/X] [Facebook] [LinkedIn] [Copy Link]    |
+----------------------------------------------------------+
```

**Styling:**
- Tags: `flex flex-wrap gap-1.5`, each as a linked badge (`text-xs bg-muted px-1.5 py-0.5 hover:bg-muted/80`)
- Separator: `border-t border-border my-4`
- Share section below tags

---

#### `PostShareButtons`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostShareButtons.tsx`
**Purpose:** Social sharing buttons for a blog post. Opens share dialogs or copies link to clipboard.

**Props:**
```typescript
interface PostShareButtonsProps {
  url: string;                        // Full URL to share
  title: string;                      // Post title for share text
  className?: string;
}
```

**Providers:**
1. **Twitter/X** -- Opens `https://twitter.com/intent/tweet?url=...&text=...`
2. **Facebook** -- Opens `https://www.facebook.com/sharer/sharer.php?u=...`
3. **LinkedIn** -- Opens `https://www.linkedin.com/sharing/share-offsite/?url=...`
4. **Reddit** -- Opens `https://www.reddit.com/submit?url=...&title=...`
5. **Copy Link** -- Copies URL to clipboard, shows "Copied!" toast via Sonner

**Styling:**
- Icon buttons using Lucide icons
- `flex items-center gap-2`
- Ghost variant buttons: `hover:bg-muted`
- Consistent `size-8` icon buttons

---

#### `PostAuthorBox`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostAuthorBox.tsx`
**Purpose:** Author information box displayed below the post content. Shows avatar, name, bio, and link to author archive.

**Props:**
```typescript
interface PostAuthorBoxProps {
  author: PostAuthor;
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| [Avatar 48x48]  Author Name                              |
|                  Full-stack developer and tech writer.     |
|                  View all posts ->                         |
+----------------------------------------------------------+
```

**Styling:**
- Container: `bg-muted/30 p-4`
- Avatar: `size-12 rounded-none`
- Name: `text-sm font-medium`
- Bio: `text-xs text-muted-foreground`
- Link: `text-xs text-primary hover:underline`

---

#### `PostRelatedPosts`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostRelatedPosts.tsx`
**Purpose:** Section showing 3 related posts at the bottom of a single post page. Related posts share the same primary category; falls back to recent posts if not enough in the same category.

**Props:**
```typescript
interface PostRelatedPostsProps {
  currentPostId: string;
  categoryId?: string;                // Primary category for finding related posts
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| Related Posts                                             |
+----------------------------------------------------------+
| [PostCard] [PostCard] [PostCard]                          |
+----------------------------------------------------------+
```

**Behavior:**
- Fetches `posts.list({ status: "publish", categoryId, perPage: 4 })` then excludes the current post, taking 3
- If fewer than 3 results from the same category, fills remaining slots with recent posts
- Shows nothing if no related posts found at all

**Styling:**
- Section heading: `text-sm font-medium mb-4`
- 3-column grid on desktop, 1-column stack on mobile: `grid grid-cols-1 md:grid-cols-3 gap-4`

---

#### `PostPasswordForm`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostPasswordForm.tsx`
**Purpose:** Password entry form displayed instead of content for password-protected posts. The post title and excerpt remain visible; only the full content is gated.

**Props:**
```typescript
interface PostPasswordFormProps {
  postId: string;
  onSuccess: () => void;              // Called when password is verified
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| This content is password protected.                       |
| Enter the password to view it.                            |
|                                                            |
| [Password Input___________] [Submit]                      |
| Incorrect password. Please try again.                     |
+----------------------------------------------------------+
```

**Behavior:**
- Submits password to a server action that verifies against the hashed password
- On success: Sets a session cookie, calls `onSuccess` callback (which re-renders with full content)
- On failure: Shows error message
- Accessible: form labels, error with `role="alert"`, autofocus on input

**Base UI Dependencies:** Button, Input
**Styling:**
- Container: `bg-muted/30 p-6 text-center`
- Input: standard form input from `@/components/ui/input`
- Error: `text-destructive text-xs`

---

#### `PostPreviewBanner`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostPreviewBanner.tsx`
**Purpose:** Fixed banner shown at the top of the page when viewing a post via the preview URL (from the admin editor).

**Props:**
```typescript
interface PostPreviewBannerProps {
  postId: string;
  postStatus: string;
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| PREVIEW MODE -- This post is a {status}. [Edit in Admin]  |
+----------------------------------------------------------+
```

**Styling:**
- Fixed top bar: `fixed top-0 left-0 right-0 z-50`
- Background: `bg-primary text-primary-foreground`
- Text: `text-xs font-medium`
- Link to admin editor: `underline`

---

### Comment Section Components

#### `CommentSection`

**File:** `ConvexPress-Website/apps/web/src/components/blog/CommentSection.tsx`
**Purpose:** Complete comment section for a single post. Includes the comment count heading, comment form (for authenticated users), and threaded comment list.

**Props:**
```typescript
interface CommentSectionProps {
  postId: string;
  commentStatus: "open" | "closed";
  commentCount: number;
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| Comments (12)                                             |
+----------------------------------------------------------+
| [CommentForm -- only if logged in and comments open]      |
+----------------------------------------------------------+
| [CommentThread -- recursive threaded comments]            |
|   [Comment]                                               |
|     [Reply]                                               |
|       [Reply to reply]                                    |
|   [Comment]                                               |
+----------------------------------------------------------+
| [Load More Comments] or [Pagination]                      |
+----------------------------------------------------------+
```

**Behavior:**
- If `commentStatus === "closed"`: Show "Comments are closed." message, still display existing comments
- If user is not authenticated: Show "Sign in to leave a comment." with link to `/login?returnTo=...`
- Uses Convex reactive subscription: `useQuery(api.comments.forPost, { postId })`
- New comments appear in real-time
- Comment form clears and shows success toast on submit

---

#### `CommentForm`

**File:** `ConvexPress-Website/apps/web/src/components/blog/CommentForm.tsx`
**Purpose:** Textarea form for writing a new comment or replying to an existing comment.

**Props:**
```typescript
interface CommentFormProps {
  postId: string;
  parentId?: string;                  // If replying to a comment
  onSubmit?: () => void;              // Called after successful submit
  onCancel?: () => void;              // Called when canceling a reply
  autoFocus?: boolean;                // Focus textarea on mount (for reply forms)
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| [Avatar]  [Textarea________________________]              |
|           [Cancel (if reply)]  [Post Comment]             |
+----------------------------------------------------------+
```

**Form Validation (Zod):**
```typescript
const commentSchema = z.object({
  content: z.string()
    .min(1, "Comment cannot be empty")
    .max(5000, "Comment is too long (max 5000 characters)"),
});
```

**Behavior:**
- Calls `useMutation(api.comments.create)` on submit
- Shows character count approaching limit
- Disables submit button while submitting
- Shows success toast: "Comment posted" (or "Comment submitted for review" if pending moderation)
- Clears form on success
- Reply form appears inline below the parent comment

**Base UI Dependencies:** Button (via `@/components/ui/button`)
**Styling:**
- Textarea: native `<textarea>` styled with Tailwind, `bg-background border border-border text-xs p-2 min-h-20 resize-y`
- Submit button: primary variant
- Cancel button: ghost variant

---

#### `CommentThread`

**File:** `ConvexPress-Website/apps/web/src/components/blog/CommentThread.tsx`
**Purpose:** Renders a threaded comment tree recursively. Each comment can have nested replies up to the configured depth limit.

**Props:**
```typescript
interface CommentThreadProps {
  comments: CommentDisplay[];
  maxDepth?: number;                  // Default: 5
  currentDepth?: number;              // Internal, starts at 0
}
```

**UI Structure (single comment):**
```
+----------------------------------------------------------+
| [Avatar]  Author Name  ·  2 hours ago                    |
|           Comment content text goes here. It can be       |
|           multiple lines long.                            |
|           [Like (3)] [Reply] [Flag]                       |
|                                                            |
|    +------------------------------------------------------+
|    | [Avatar]  Reply Author  ·  1 hour ago               |
|    |           Reply content text...                      |
|    |           [Like (1)] [Reply] [Flag]                  |
|    +------------------------------------------------------+
+----------------------------------------------------------+
```

**Behavior:**
- Each nested level indented with `pl-6` (or responsive padding)
- "Reply" button toggles inline CommentForm below the comment
- At max depth, "Reply" still works but the reply form appears at the max depth level (no further nesting)
- "Like" button calls `useMutation(api.comments.like)` -- toggle behavior (like/unlike)
- "Flag" button calls `useMutation(api.comments.flag)` -- shows confirmation dialog first
- Timestamp shown as relative time ("2 hours ago", "3 days ago") with absolute time on hover (`title` attribute)

**Styling:**
- Comment container: `flex gap-3`
- Avatar: `size-8 rounded-none flex-shrink-0`
- Author name: `text-xs font-medium`
- Timestamp: `text-xs text-muted-foreground`
- Content: `text-xs/relaxed text-foreground`
- Action buttons: `text-xs text-muted-foreground hover:text-foreground` with Lucide icons
- Indent: `pl-6 border-l border-border/50` per nesting level
- Separator between top-level comments: `border-b border-border/30`

---

#### `CommentSkeleton`

**File:** `ConvexPress-Website/apps/web/src/components/blog/CommentSkeleton.tsx`
**Purpose:** Loading skeleton for the comment section.

**Props:** None (renders 3 skeleton comment blocks)

---

### Pagination Component

#### `PostPagination`

**File:** `ConvexPress-Website/apps/web/src/components/blog/PostPagination.tsx`
**Purpose:** Reusable pagination component for blog index, archive pages, and search results. Supports page numbers, prev/next, and total count display.

**Props:**
```typescript
interface PostPaginationProps {
  currentPage: number;
  totalPages: number;
  total: number;                      // Total item count
  baseUrl: string;                    // Base URL for page links (e.g., "/blog", "/category/react")
  className?: string;
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| Showing 1-10 of 42 posts                                 |
| [< Previous]  1  2  [3]  4  5  ...  9  [Next >]         |
+----------------------------------------------------------+
```

**Behavior:**
- Page links use `<Link>` from TanStack Router with `search` params: `?page=N`
- Current page is highlighted (not a link)
- Truncation with ellipsis for large page counts (show first, last, and 2 around current)
- "Previous" disabled on page 1, "Next" disabled on last page
- Shows "Showing X-Y of Z posts" summary

**Styling:**
- Count text: `text-xs text-muted-foreground`
- Page buttons: `size-8 text-xs inline-flex items-center justify-center hover:bg-muted`
- Active page: `bg-primary text-primary-foreground`
- Disabled: `opacity-50 pointer-events-none`

---

### Search Components

#### `SearchForm`

**File:** `ConvexPress-Website/apps/web/src/components/blog/SearchForm.tsx`
**Purpose:** Search input form used on the search results page and optionally in sidebar widgets.

**Props:**
```typescript
interface SearchFormProps {
  defaultQuery?: string;              // Pre-fill input (from URL)
  variant?: "full" | "compact";       // Full page vs widget
  autoFocus?: boolean;
  className?: string;
}
```

**UI Structure (full variant):**
```
+----------------------------------------------------------+
| [Search Icon]  [Search posts..._______________]  [Search] |
+----------------------------------------------------------+
```

**Behavior:**
- On submit: navigates to `/search?q={query}` using TanStack Router `navigate()`
- "compact" variant hides the button (Enter to search)
- Debounced live suggestions (future enhancement -- wired to `search.suggest` query)

**Base UI Dependencies:** Button, Input
**Styling:**
- Input: `h-10 text-sm` (larger than default for search prominence)
- Full variant: `flex gap-2 items-center`
- Search icon: Lucide `Search`, `text-muted-foreground`

---

#### `SearchResultCard`

**File:** `ConvexPress-Website/apps/web/src/components/blog/SearchResultCard.tsx`
**Purpose:** A search result item card with highlighted excerpt showing matched search terms.

**Props:**
```typescript
interface SearchResultCardProps {
  result: SearchResultItem;
  className?: string;
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| [Category Badge]  Post  ·  Published Feb 9, 2026         |
| Post Title (linked)                                       |
| ...matched text with <mark>search terms</mark>            |
| highlighted in the excerpt...                             |
| /blog/my-post-slug                                        |
+----------------------------------------------------------+
```

**Styling:**
- Title: `text-sm font-medium text-primary hover:underline`
- Excerpt: `text-xs text-muted-foreground` with `<mark>` tags styled as `bg-primary/20 text-foreground`
- URL display: `text-xs text-muted-foreground` (like Google search results)
- Content type badge: `text-xs bg-muted px-1.5 py-0.5`

---

#### `EmptySearchState`

**File:** `ConvexPress-Website/apps/web/src/components/blog/EmptySearchState.tsx`
**Purpose:** Displayed when a search returns no results.

**Props:**
```typescript
interface EmptySearchStateProps {
  query: string;
}
```

**UI Structure:**
```
+----------------------------------------------------------+
| [Search Icon]                                             |
| No results found for "react hooks"                        |
|                                                            |
| Suggestions:                                              |
| - Check your spelling                                     |
| - Try different keywords                                  |
| - Use fewer, more general terms                           |
+----------------------------------------------------------+
```

**Styling:**
- Centered layout with `text-center py-12`
- Icon: Lucide `SearchX`, `size-12 text-muted-foreground/50`
- Heading: `text-sm font-medium`
- Suggestions: `text-xs text-muted-foreground list-disc`

---

### 404 Page Component

#### `NotFoundPage`

**File:** `ConvexPress-Website/apps/web/src/components/blog/NotFoundPage.tsx`
**Purpose:** Friendly 404 error page with search suggestion and popular posts.

**Props:** None (fetches popular posts internally)

**UI Structure:**
```
+----------------------------------------------------------+
| 404                                                       |
| Page Not Found                                            |
|                                                            |
| The page you're looking for doesn't exist or has been     |
| moved.                                                    |
|                                                            |
| [Search Form]                                             |
|                                                            |
| Popular Posts:                                             |
| [PostCard compact] [PostCard compact] [PostCard compact]  |
|                                                            |
| [Go to Homepage]                                          |
+----------------------------------------------------------+
```

**Behavior:**
- Fetches popular posts: `useQuery(api.posts.list, { status: "publish", orderBy: "commentCount", perPage: 3 })`
- Search form navigates to `/search?q=...`
- "Go to Homepage" link to `/`

**Styling:**
- Centered layout: `max-w-2xl mx-auto text-center py-16`
- 404 number: `text-6xl font-medium text-muted-foreground/30`
- Heading: `text-xl font-medium`
- Description: `text-xs text-muted-foreground`

---

### SEO Components

#### `SeoHead`

**File:** `ConvexPress-Website/apps/web/src/lib/seo/SeoHead.ts`
**Purpose:** Utility function (not a component) that generates the `head()` return value for TanStack Start routes. Produces meta tags, Open Graph tags, Twitter Card tags, canonical URLs, and JSON-LD structured data.

**Usage:**
```typescript
// In a route's head() configuration
head: ({ loaderData }) => ({
  meta: [
    ...SeoHead.meta(loaderData.seo),
    ...SeoHead.openGraph(loaderData.seo),
    ...SeoHead.twitterCard(loaderData.seo),
  ],
  links: [
    ...SeoHead.canonical(loaderData.seo),
    ...SeoHead.rssDiscovery(),
    ...SeoHead.prevNext(loaderData.seo),
  ],
  scripts: [
    SeoHead.jsonLd(loaderData.seo.jsonLd),
  ],
}),
```

**Functions:**
```typescript
export const SeoHead = {
  /** Generate meta tags */
  meta(seo: ResolvedSeo): HeadMeta[],

  /** Generate Open Graph meta tags */
  openGraph(seo: ResolvedSeo): HeadMeta[],

  /** Generate Twitter Card meta tags */
  twitterCard(seo: ResolvedSeo): HeadMeta[],

  /** Generate canonical link */
  canonical(seo: ResolvedSeo): HeadLink[],

  /** Generate RSS feed discovery link */
  rssDiscovery(): HeadLink[],

  /** Generate prev/next pagination links */
  prevNext(seo: ResolvedSeo): HeadLink[],

  /** Generate JSON-LD script tag */
  jsonLd(data: Record<string, unknown>): HeadScript,
};
```

**JSON-LD Schemas:**
- **Blog index:** `WebPage` with `CollectionPage` type
- **Single post:** `BlogPosting` with author as `Person`, publisher as `Organization`
- **Single page:** `WebPage`
- **Category/Tag archive:** `CollectionPage`
- **Author archive:** `ProfilePage` with `Person`
- **Search results:** `SearchResultsPage`

---

### Utility Components

#### `ReadTimeDisplay`

**File:** `ConvexPress-Website/apps/web/src/components/blog/ReadTimeDisplay.tsx`
**Purpose:** Small inline component displaying estimated reading time.

**Props:**
```typescript
interface ReadTimeDisplayProps {
  minutes: number;
  className?: string;
}
```

**Renders:** `5 min read`
**Styling:** `text-xs text-muted-foreground`

---

#### `DateDisplay`

**File:** `ConvexPress-Website/apps/web/src/components/blog/DateDisplay.tsx`
**Purpose:** Renders a formatted date with relative time support.

**Props:**
```typescript
interface DateDisplayProps {
  timestamp: number;                  // Unix timestamp (ms)
  format?: "relative" | "absolute" | "auto";  // Default: "auto"
  className?: string;
}
```

**Behavior:**
- `"relative"`: "2 hours ago", "3 days ago"
- `"absolute"`: "Feb 9, 2026"
- `"auto"`: Relative if less than 7 days old, absolute otherwise
- Always includes absolute time in `title` attribute for hover tooltip
- Uses `<time>` element with `dateTime` attribute for accessibility/SEO

---

#### `CategoryBadge`

**File:** `ConvexPress-Website/apps/web/src/components/blog/CategoryBadge.tsx`
**Purpose:** Linked badge displaying a category or tag name.

**Props:**
```typescript
interface CategoryBadgeProps {
  taxonomy: TaxonomyBadge;
  className?: string;
}
```

**Styling:** `text-xs bg-muted px-1.5 py-0.5 text-foreground hover:bg-muted/80 transition-colors`
**Links to:** `/category/{slug}` or `/tag/{slug}` based on `taxonomy.type`

---

#### `FeaturedImage`

**File:** `ConvexPress-Website/apps/web/src/components/blog/FeaturedImage.tsx`
**Purpose:** Responsive featured image with proper `srcset`, lazy loading, and alt text.

**Props:**
```typescript
interface FeaturedImageProps {
  src: string;
  alt: string;
  aspectRatio?: "video" | "wide" | "square";  // Default: "video" (16:9)
  priority?: boolean;                 // If true, no lazy loading (for above-fold images)
  className?: string;
}
```

**Behavior:**
- If `priority` is true: no `loading="lazy"` attribute (above-the-fold images)
- If `priority` is false: `loading="lazy"` and `decoding="async"`
- Applies responsive `srcset` if the Media System provides multiple sizes
- Fallback: Placeholder with `bg-muted` if image fails to load

**Styling:**
- `w-full object-cover rounded-none`
- Aspect ratios: `aspect-video` (16:9), `aspect-[21/9]` (wide), `aspect-square` (1:1)

---

## Hooks

### `usePostList`

**File:** `ConvexPress-Website/apps/web/src/hooks/usePostList.ts`

```typescript
interface UsePostListParams {
  status?: "publish";
  categoryId?: string;
  tagId?: string;
  authorId?: string;
  page?: number;
  perPage?: number;
  orderBy?: "publishedAt" | "commentCount";
  orderDir?: "asc" | "desc";
}

interface UsePostListResult {
  posts: PostCardData[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  isLoading: boolean;
}

function usePostList(params: UsePostListParams): UsePostListResult
```

**Behavior:**
- Wraps `useQuery(api.posts.list, params)` with loading state handling
- Transforms raw post data into `PostCardData` (computes autoExcerpt, readTimeMinutes)
- Only queries published posts on the website (status is always "publish")

---

### `usePostBySlug`

**File:** `ConvexPress-Website/apps/web/src/hooks/usePostBySlug.ts`

```typescript
interface UsePostBySlugResult {
  post: PostDisplay | null;
  isLoading: boolean;
  isPasswordProtected: boolean;
}

function usePostBySlug(slug: string): UsePostBySlugResult
```

**Behavior:**
- Wraps `useQuery(api.posts.get, { slug })`
- Denormalizes author data
- Computes `isPasswordProtected` from visibility field

---

### `useComments`

**File:** `ConvexPress-Website/apps/web/src/hooks/useComments.ts`

```typescript
interface UseCommentsResult {
  comments: CommentDisplay[];
  total: number;
  isLoading: boolean;
}

function useComments(postId: string): UseCommentsResult
```

**Behavior:**
- Wraps `useQuery(api.comments.forPost, { postId })`
- Builds threaded tree structure from flat comment list (nesting by `parentId`)
- Computes `canReply`, `canEdit`, `canFlag` based on current auth state
- Reactive: new comments appear live

---

### `useSearch`

**File:** `ConvexPress-Website/apps/web/src/hooks/useSearch.ts`

```typescript
interface UseSearchResult {
  results: SearchResults | null;
  isLoading: boolean;
}

function useSearch(query: string, page?: number): UseSearchResult
```

**Behavior:**
- Wraps `useQuery(api.search.execute, { query, contentTypes: ["post", "page"], page })`
- Returns null when query is empty
- Includes highlighted excerpts from the search system

---

### `useReadTime`

**File:** `ConvexPress-Website/apps/web/src/hooks/useReadTime.ts`

```typescript
function useReadTime(content: string): number  // Returns minutes
```

**Behavior:**
- Parses TipTap JSON to extract plain text
- Counts words, divides by 200 (average reading speed)
- Returns minimum of 1 minute
- Memoized to avoid recalculation

---

### `useAutoExcerpt`

**File:** `ConvexPress-Website/apps/web/src/hooks/useAutoExcerpt.ts`

```typescript
function useAutoExcerpt(content: string, maxLength?: number): string
```

**Behavior:**
- Parses TipTap JSON to extract plain text
- Takes first `maxLength` characters (default 150)
- Trims to last complete word
- Appends "..." if truncated
- Memoized

---

### `useRelativeTime`

**File:** `ConvexPress-Website/apps/web/src/hooks/useRelativeTime.ts`

```typescript
function useRelativeTime(timestamp: number): string
```

**Behavior:**
- Converts timestamp to relative time string ("2 hours ago", "3 days ago", "Feb 9, 2026")
- Updates periodically (every minute for recent, less frequently for older)
- Falls back to absolute date after 7 days

---

## Routes

### `/blog` - Blog Index

**File:** `ConvexPress-Website/apps/web/src/routes/blog/index.tsx`
**Auth:** None (public)
**SSR:** Yes -- loader fetches published posts server-side
**SEO:** Title: "Blog | {site_name}", meta description from Settings, canonical: `/blog`

**Loader:**
```typescript
loader: async ({ context }) => {
  const page = /* parse from search params */ 1;
  const perPage = /* from settings or default */ 10;

  const [postsResult, settings] = await Promise.all([
    fetchQuery(api.posts.list, { status: "publish", page, perPage }),
    fetchQuery(api.settings.get, { key: "reading" }),
  ]);

  const seo = resolveBlogIndexSeo(postsResult, settings, page);
  return { postsResult, settings, seo };
}
```

**Search Params:**
```typescript
const searchParams = z.object({
  page: z.coerce.number().optional().default(1),
});
```

**head():**
```typescript
head: ({ loaderData }) => ({
  meta: [
    { title: loaderData.seo.title },
    { name: "description", content: loaderData.seo.description },
    ...SeoHead.openGraph(loaderData.seo),
  ],
  links: [
    ...SeoHead.canonical(loaderData.seo),
    ...SeoHead.rssDiscovery(),
    ...SeoHead.prevNext(loaderData.seo),
  ],
}),
```

**Component Structure:**
```
<BlogLayout>
  <h1>Blog</h1>

  {/* Sticky posts (page 1 only) */}
  {page === 1 && stickyPosts.length > 0 && (
    <div>
      {stickyPosts.map(post => <PostCardFeatured key={post._id} post={post} />)}
    </div>
  )}

  {/* Post grid */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {posts.map(post => <PostCard key={post._id} post={post} />)}
  </div>

  <PostPagination
    currentPage={page}
    totalPages={postsResult.totalPages}
    total={postsResult.total}
    baseUrl="/blog"
  />
</BlogLayout>
```

---

### `/blog/$slug` - Single Post

**File:** `ConvexPress-Website/apps/web/src/routes/blog/$slug.tsx`
**Auth:** None for public posts; auth required for private posts
**SSR:** Yes -- loader fetches post, taxonomies, and SEO data
**SEO:** Full article SEO (title, description, OG article, JSON-LD BlogPosting, canonical, prev/next post links)

**Loader:**
```typescript
loader: async ({ params }) => {
  const post = await fetchQuery(api.posts.get, { slug: params.slug });

  if (!post) {
    throw redirect({ to: "/404" });
  }

  if (post.status === "private") {
    const { user } = await getAuth();
    if (!user) throw redirect({ to: "/404" });
    // Further capability check may be needed
  }

  const [taxonomies, seoMeta] = await Promise.all([
    fetchQuery(api.taxonomies.getByPost, { postId: post._id }),
    fetchQuery(api.seo.getPostSeo, { postId: post._id }),
  ]);

  const seo = resolvePostSeo(post, taxonomies, seoMeta);
  return { post, taxonomies, seo };
}
```

**head():**
```typescript
head: ({ loaderData }) => ({
  meta: [
    { title: loaderData.seo.title },
    { name: "description", content: loaderData.seo.description },
    ...SeoHead.openGraph(loaderData.seo),
    ...SeoHead.twitterCard(loaderData.seo),
  ],
  links: [
    ...SeoHead.canonical(loaderData.seo),
  ],
  scripts: [
    SeoHead.jsonLd(loaderData.seo.jsonLd),
  ],
}),
```

**Component Structure:**
```
<article>
  {isPreview && <PostPreviewBanner postId={post._id} postStatus={post.status} />}

  <PostHeader post={post} categories={taxonomies.categories} readTimeMinutes={readTime} />

  {post.isPasswordProtected && !passwordVerified ? (
    <PostPasswordForm postId={post._id} onSuccess={() => setPasswordVerified(true)} />
  ) : (
    <>
      <BlockContentRenderer content={post.content} />

      <PostFooter tags={taxonomies.tags} postUrl={fullUrl} postTitle={post.title} />

      <PostAuthorBox author={post.author} />

      <PostRelatedPosts
        currentPostId={post._id}
        categoryId={taxonomies.categories[0]?._id}
      />

      {post.commentStatus === "open" || post.commentCount > 0 ? (
        <CommentSection
          postId={post._id}
          commentStatus={post.commentStatus}
          commentCount={post.commentCount}
        />
      ) : null}
    </>
  )}
</article>
```

---

### `/$slug` - Single Page (Catch-All)

**File:** `ConvexPress-Website/apps/web/src/routes/$slug.tsx` (or `$` catch-all route)
**Auth:** None for public pages
**SSR:** Yes
**SEO:** Title: `{page_title} | {site_name}`, WebPage JSON-LD

**Note:** Pages use the `path` field which can be hierarchical (e.g., `/services/web-design`). The route must handle nested slugs. This may require a splatted route (`$`) or a specific route configuration. The Routing System expert owns the URL resolution logic; this expert renders the resolved page.

**Loader:**
```typescript
loader: async ({ params }) => {
  const path = "/" + params["*"];  // or params.slug
  const page = await fetchQuery(api.pages.getByPath, { path });

  if (!page) {
    throw redirect({ to: "/404" });
  }

  const seoMeta = await fetchQuery(api.seo.getPostSeo, { postId: page._id });
  const seo = resolvePageSeo(page, seoMeta);
  return { page, seo };
}
```

**Component Structure:**
```
<article>
  <h1>{page.title}</h1>

  <BlockContentRenderer content={page.content} />

  {page.commentStatus === "open" && (
    <CommentSection
      postId={page._id}
      commentStatus={page.commentStatus}
      commentCount={page.commentCount}
    />
  )}
</article>
```

**Page Templates:**
- `"default"` -- Standard single-column content
- `"full-width"` -- No sidebar, content spans full width
- `"sidebar"` -- Content + sidebar widget area
- Template key from `page.pageTemplate` field selects the layout wrapper

---

### `/category/$slug` - Category Archive

**File:** `ConvexPress-Website/apps/web/src/routes/category/$slug.tsx`
**Auth:** None (public)
**SSR:** Yes
**SEO:** Title: `{category_name} Archives | {site_name}`, canonical: `/category/{slug}`

**Loader:**
```typescript
loader: async ({ params }) => {
  const category = await fetchQuery(api.taxonomies.getBySlug, {
    slug: params.slug,
    type: "category",
  });

  if (!category) {
    throw redirect({ to: "/404" });
  }

  const page = /* from search params */ 1;
  const postsResult = await fetchQuery(api.posts.list, {
    status: "publish",
    categoryId: category._id,
    page,
    perPage: 10,
  });

  const seo = resolveCategoryArchiveSeo(category, postsResult, page);
  return { category, postsResult, seo };
}
```

**Component Structure:**
```
<BlogLayout>
  <ArchiveHeader
    type="category"
    name={category.name}
    description={category.description}
    postCount={postsResult.total}
  />

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {posts.map(post => <PostCard key={post._id} post={post} />)}
  </div>

  <PostPagination
    currentPage={page}
    totalPages={postsResult.totalPages}
    total={postsResult.total}
    baseUrl={`/category/${category.slug}`}
  />
</BlogLayout>
```

---

### `/tag/$slug` - Tag Archive

**File:** `ConvexPress-Website/apps/web/src/routes/tag/$slug.tsx`
**Auth:** None (public)
**SSR:** Yes
**SEO:** Title: `{tag_name} Archives | {site_name}`, canonical: `/tag/{slug}`

**Loader:** Same pattern as category archive but using `tagId` filter.

**Component Structure:** Same as category archive with `type="tag"`.

---

### `/author/$slug` - Author Archive

**File:** `ConvexPress-Website/apps/web/src/routes/author/$slug.tsx`
**Auth:** None (public)
**SSR:** Yes
**SEO:** Title: `{author_name} - Author Archives | {site_name}`, canonical: `/author/{slug}`, JSON-LD `ProfilePage` with `Person` schema

**Loader:**
```typescript
loader: async ({ params }) => {
  const author = await fetchQuery(api.users.getBySlug, { slug: params.slug });

  if (!author) {
    throw redirect({ to: "/404" });
  }

  const page = /* from search params */ 1;
  const postsResult = await fetchQuery(api.posts.list, {
    status: "publish",
    authorId: author.id,
    page,
    perPage: 10,
  });

  const seo = resolveAuthorArchiveSeo(author, postsResult, page);
  return { author, postsResult, seo };
}
```

**Component Structure:**
```
<BlogLayout>
  <ArchiveHeader
    type="author"
    name={author.name}
    description={author.bio}
    postCount={postsResult.total}
    avatarUrl={author.avatarUrl}
  />

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {posts.map(post => <PostCard key={post._id} post={post} showAuthor={false} />)}
  </div>

  <PostPagination
    currentPage={page}
    totalPages={postsResult.totalPages}
    total={postsResult.total}
    baseUrl={`/author/${author.slug}`}
  />
</BlogLayout>
```

---

### `/search` - Search Results

**File:** `ConvexPress-Website/apps/web/src/routes/search.tsx`
**Auth:** None (public)
**SSR:** Yes
**SEO:** Title: `Search Results for "{query}" | {site_name}`, `noindex` meta tag (search results should not be indexed)

**Loader:**
```typescript
loader: async ({ context }) => {
  const query = /* from search params */ "";
  const page = /* from search params */ 1;

  if (!query) {
    return { query: "", results: null };
  }

  const results = await fetchQuery(api.search.execute, {
    query,
    contentTypes: ["post", "page"],
    page,
    perPage: 10,
  });

  return { query, results };
}
```

**Search Params:**
```typescript
const searchParams = z.object({
  q: z.string().optional().default(""),
  page: z.coerce.number().optional().default(1),
});
```

**Component Structure:**
```
<BlogLayout>
  <h1>Search Results</h1>
  <SearchForm defaultQuery={query} autoFocus={!query} />

  {results === null ? (
    <p className="text-muted-foreground text-xs">Enter a search term above.</p>
  ) : results.items.length === 0 ? (
    <EmptySearchState query={query} />
  ) : (
    <>
      <p className="text-xs text-muted-foreground">
        {results.total} results for "{query}"
      </p>

      <div className="space-y-4">
        {results.items.map(item => (
          <SearchResultCard key={item._id} result={item} />
        ))}
      </div>

      <PostPagination
        currentPage={page}
        totalPages={results.totalPages}
        total={results.total}
        baseUrl={`/search?q=${encodeURIComponent(query)}`}
      />
    </>
  )}
</BlogLayout>
```

---

### 404 Route

**File:** `ConvexPress-Website/apps/web/src/routes/404.tsx` (or catch-all `$` route with not-found handling)
**Auth:** None
**SSR:** Yes
**SEO:** `noindex`, title: "Page Not Found | {site_name}"

**Component Structure:**
```
<NotFoundPage />
```

**Note:** TanStack Start's `notFoundComponent` on the root route can also handle this. The 404 route may be a dedicated file or configured via the router's `defaultNotFoundComponent`.

---

## Backend Integration

### Convex Queries Used (Read-Only -- Defined in Admin Backend)

| Query | Used By | Purpose |
|-------|---------|---------|
| `api.posts.list` | Blog index, archives, related posts, 404 popular posts | Paginated published post list with filters |
| `api.posts.get` | Single post page | Fetch post by slug (with author denormalization) |
| `api.posts.preview` | Preview mode | Fetch post with autosave content merged |
| `api.pages.getByPath` | Single page route | Fetch page by URL path |
| `api.taxonomies.getByPost` | Single post page | Fetch categories and tags for a post |
| `api.taxonomies.getBySlug` | Category/tag archives | Fetch taxonomy by slug |
| `api.comments.forPost` | Comment section | Threaded comments for a post (reactive) |
| `api.search.execute` | Search results page | Full-text search with highlighted excerpts |
| `api.search.suggest` | Search form (future) | Autocomplete suggestions |
| `api.seo.getPostSeo` | Single post/page | SEO metadata for a specific post |
| `api.seo.getSettings` | All pages | Global SEO settings (site name, defaults) |
| `api.settings.get` | Blog index, archives | Reading settings (posts_per_page) |
| `api.users.getBySlug` | Author archive | Fetch author profile by slug |

### Convex Mutations Used (Defined in Admin Backend)

| Mutation | Used By | Purpose |
|----------|---------|---------|
| `api.comments.create` | CommentForm | Post a new comment |
| `api.comments.reply` | CommentForm (reply mode) | Reply to an existing comment |
| `api.comments.like` | CommentThread like button | Toggle like on a comment |
| `api.comments.unlike` | CommentThread like button | Remove like from a comment |
| `api.comments.flag` | CommentThread flag button | Flag a comment for review |
| `api.comments.edit` | CommentThread (within grace period) | Edit own comment content |
| `api.posts.verifyPassword` | PostPasswordForm | Verify password for protected post |
| `api.search.logQuery` | Search results page | Record search query for analytics |

### Server Actions (TanStack Start)

| Action | Used By | Purpose |
|--------|---------|---------|
| `verifyPostPassword` | PostPasswordForm | Server-side password verification + cookie setting |

### Convex Auth APIs Used

| API | Used By | Import From |
|-----|---------|-------------|
| `getAuth()` | SSR loaders (for private post access check) | `@auth/authkit-tanstack-react-start` |
| `useAuth()` | CommentSection (check if user is signed in), CommentForm | `@auth/authkit-tanstack-react-start/client` |

---

## Accessibility

### Semantic HTML

- Blog index: `<main>` landmark, each post card is an `<article>` within a list
- Single post: `<article>` element wrapping the full post
- Heading hierarchy: `<h1>` for post title (only one per page), `<h2>` through `<h6>` for content headings
- Comments: `<section aria-label="Comments">`, each comment in `<article>` elements
- Navigation: `<nav aria-label="Pagination">` for pagination
- Search: `<form role="search">` for the search form

### Focus Management

- On page navigation: focus moved to the `<h1>` or `<main>` element
- On comment submission: focus moved to the newly posted comment
- On reply button click: focus moved to the reply form textarea
- On search form submit: focus moved to results count or empty state heading
- On pagination: focus moved to the first post card on the new page

### Keyboard Navigation

- All interactive elements (links, buttons, forms) are keyboard accessible
- Post cards: title link is the primary focusable element
- Comment actions (like, reply, flag): focusable buttons with clear labels
- Pagination: each page number is a focusable link
- Share buttons: focusable buttons, copy link shows toast confirmation

### Screen Reader Support

- Images have descriptive `alt` text (from Media System or post title fallback)
- Relative time has absolute date in `title` attribute and `<time dateTime="...">` for machine-readable date
- Comment count: `aria-label` describes "12 comments" not just "12"
- Like count: `aria-label="Like this comment. 3 likes"` / `aria-label="Unlike this comment. 3 likes"`
- Loading states: `aria-live="polite"` regions for dynamic content updates
- Search results: `aria-live="polite"` for result count announcement

### Color Contrast

- All text meets WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text)
- `<mark>` highlighted search terms must be distinguishable against their background
- Category badges must have sufficient contrast
- All colors via CSS variables -- NEVER hardcoded

---

## Known Gaps & Decisions

### 1. Blog Index Layout (Grid vs List vs Mixed)

**Gap:** Should the blog index use a card grid, a list layout, or a mixed layout (featured cards + list)?

**Recommendation:** Default to a 3-column card grid on desktop, 1-column on mobile. Sticky posts rendered as full-width featured cards above the grid (page 1 only). This can be made configurable via Settings System in a future version.

### 2. Featured Post / Sticky Post Visual Treatment

**Gap:** How should sticky posts be visually distinguished from regular posts?

**Decision:** Sticky posts are rendered using `PostCardFeatured` (larger, full-width) at the top of the blog index on page 1 only. They do not appear in the regular grid below. On archive pages, sticky posts are not given special treatment (they follow normal sort order).

### 3. Share Button Provider List

**Gap:** Which social share providers to include.

**Decision:** Twitter/X, Facebook, LinkedIn, Reddit, and Copy Link. These cover the most common sharing destinations. The provider list can be made configurable via Settings System later. No email share (to avoid spam concerns).

### 4. Related Posts Algorithm

**Gap:** How to determine "related" posts.

**Decision:** Primary algorithm: fetch published posts from the same primary category (first assigned category), excluding the current post, sorted by `publishedAt` descending, limit 3. Fallback: if fewer than 3 found in the same category, fill remaining slots with the most recent published posts. No ML-based recommendations in v1.

### 5. Comment Section Loading Strategy

**Gap:** Should comments load immediately or be lazy-loaded below the fold?

**Decision:** Comments use a Convex reactive subscription (`useQuery`) which is client-side. The SSR render includes the post content but does NOT server-render comments (they load after hydration). This is acceptable because:
- Comments are user-generated content, not critical for SEO
- Reactive subscriptions require client-side JavaScript
- This avoids SSR complexity for the threaded comment tree

Show `CommentSkeleton` loading state until comments are fetched.

### 6. Code Block Syntax Highlighting

**Gap:** Which syntax highlighting library and theme to use.

**Recommendation:** Use `shiki` (same engine as VS Code) for server-side rendering of code blocks. It produces pre-tokenized HTML that doesn't require client-side JavaScript. Use a theme that maps to CSS variables (or a neutral dark/light theme that works with both modes). If shiki is too heavy, fall back to `highlight.js` with lazy loading.

### 7. Image Lightbox / Zoom on Click

**Gap:** Should images in post content have a lightbox/zoom on click?

**Decision:** Defer to v2. For v1, images are displayed inline at their natural size within the content area. No lightbox. This can be added later as an enhancement to the BlockContentRenderer's image block.

### 8. Reading Time Calculation

**Gap:** Should reading time be displayed, and how?

**Decision:** Yes, display on both PostCard and PostHeader. Calculated as: word count / 200 (average reading speed in wpm), minimum 1 minute. Reading time is computed client-side from the content JSON, not stored in the database.

### 9. Table of Contents for Long Posts

**Gap:** Should long posts auto-generate a table of contents from headings?

**Decision:** Defer to v2. For v1, no auto-generated TOC. The BlockContentRenderer does assign `id` attributes to heading elements (from the heading text, slugified), which allows for manual anchor links and future TOC implementation.

### 10. RSS Feed Discovery

**Gap:** Should blog pages include RSS feed discovery links?

**Decision:** Yes. The blog index and archive pages include `<link rel="alternate" type="application/rss+xml" href="/feed/rss" title="{site_name} RSS Feed">` in the `<head>`. The RSS/Feed System owns the actual feed generation; this expert just includes the discovery link.

### 11. Post Content Rendering vs Editor

**Gap:** The Content Editor System uses TipTap for editing. The website uses a read-only renderer. Are these the same component?

**Decision:** No. The editor is TipTap with full editing capabilities. The BlockContentRenderer is a separate, lightweight, read-only component that parses the same JSON format. This keeps the website bundle small (no TipTap dependency on the website). The renderer is a simple recursive function that maps block types to React elements.

### 12. Dark Mode Support

**Gap:** Does the website support dark mode?

**Current State:** The `__root.tsx` already sets `className="dark"` on the `<html>` element. All styling uses CSS variables which adapt to the theme. The blog and content components should work in both light and dark modes without any hardcoded colors.

---

## Implementation Checklist

### Phase 1: Core Components (Current Priority)

**Components:**
- [ ] `src/components/blog/BlogLayout.tsx` -- Page wrapper with optional sidebar
- [ ] `src/components/blog/PostCard.tsx` -- Standard post card (default, compact, horizontal)
- [ ] `src/components/blog/PostCardFeatured.tsx` -- Featured/sticky post card
- [ ] `src/components/blog/PostCardSkeleton.tsx` -- Loading skeleton
- [ ] `src/components/blog/PostHeader.tsx` -- Single post hero section
- [ ] `src/components/blog/BlockContentRenderer.tsx` -- TipTap JSON to React renderer
- [ ] `src/components/blog/PostFooter.tsx` -- Tags + share section
- [ ] `src/components/blog/PostShareButtons.tsx` -- Social share buttons
- [ ] `src/components/blog/PostAuthorBox.tsx` -- Author info card
- [ ] `src/components/blog/PostPagination.tsx` -- Page navigation
- [ ] `src/components/blog/FeaturedImage.tsx` -- Responsive featured image
- [ ] `src/components/blog/DateDisplay.tsx` -- Formatted date display
- [ ] `src/components/blog/ReadTimeDisplay.tsx` -- Reading time display
- [ ] `src/components/blog/CategoryBadge.tsx` -- Category/tag badge link
- [ ] `src/components/blog/ArchiveHeader.tsx` -- Archive page header

**Hooks:**
- [ ] `src/hooks/usePostList.ts` -- Post list query wrapper
- [ ] `src/hooks/usePostBySlug.ts` -- Single post query wrapper
- [ ] `src/hooks/useReadTime.ts` -- Reading time calculation
- [ ] `src/hooks/useAutoExcerpt.ts` -- Auto-excerpt generation
- [ ] `src/hooks/useRelativeTime.ts` -- Relative time formatting

**Routes:**
- [ ] `src/routes/blog/index.tsx` -- Blog index page
- [ ] `src/routes/blog/$slug.tsx` -- Single post page

**Types:**
- [ ] `src/lib/blog/types.ts` -- TypeScript types

**SEO:**
- [ ] `src/lib/seo/SeoHead.ts` -- SEO head utility functions

### Phase 2: Archives & Search

**Components:**
- [ ] `src/components/blog/SearchForm.tsx` -- Search input form
- [ ] `src/components/blog/SearchResultCard.tsx` -- Search result item
- [ ] `src/components/blog/EmptySearchState.tsx` -- No results state
- [ ] `src/components/blog/NotFoundPage.tsx` -- 404 page

**Hooks:**
- [ ] `src/hooks/useSearch.ts` -- Search query wrapper

**Routes:**
- [ ] `src/routes/category/$slug.tsx` -- Category archive
- [ ] `src/routes/tag/$slug.tsx` -- Tag archive
- [ ] `src/routes/author/$slug.tsx` -- Author archive
- [ ] `src/routes/search.tsx` -- Search results
- [ ] `src/routes/404.tsx` -- Not found page

### Phase 3: Comments

**Components:**
- [ ] `src/components/blog/CommentSection.tsx` -- Complete comment section
- [ ] `src/components/blog/CommentForm.tsx` -- Comment input form
- [ ] `src/components/blog/CommentThread.tsx` -- Threaded comment display
- [ ] `src/components/blog/CommentSkeleton.tsx` -- Comment loading skeleton

**Hooks:**
- [ ] `src/hooks/useComments.ts` -- Comment query wrapper

### Phase 4: Advanced Features

**Components:**
- [ ] `src/components/blog/PostRelatedPosts.tsx` -- Related posts section
- [ ] `src/components/blog/PostPasswordForm.tsx` -- Password-protected post form
- [ ] `src/components/blog/PostPreviewBanner.tsx` -- Preview mode banner

**Routes:**
- [ ] `src/routes/$slug.tsx` -- Single page (catch-all route)

### Phase 5: Enhancements (Future)

- [ ] Table of contents auto-generation from headings
- [ ] Image lightbox/zoom
- [ ] Live search suggestions (search.suggest integration)
- [ ] Syntax highlighting with shiki for code blocks
- [ ] Infinite scroll option (alternative to pagination)
- [ ] Print stylesheet for posts
- [ ] Reading progress bar

---

## Edge Cases & Gotchas

1. **Post Not Found After Publish/Unpublish:** If a user bookmarks a post URL and the post is later unpublished (moved to draft), the SSR loader returns 404. The Convex query `posts.get` only returns posts with `status: "publish"` for unauthenticated users. Do not show a "this post was removed" message -- just 404.

2. **Password-Protected Posts and SEO:** Password-protected posts should have their `og:description` set to a generic message ("This content is password protected") rather than the actual excerpt. The `robots` meta should still allow indexing (the title is visible).

3. **Sticky Posts Across Pages:** Sticky posts should only appear as featured cards on page 1 of the blog index. On page 2+, they appear in normal chronological order (if they would normally appear there). Do not duplicate them.

4. **Empty Blog Index:** If there are zero published posts, show a friendly empty state: "No posts yet. Check back soon!" rather than a broken or empty page.

5. **Very Long Post Titles:** Truncate with ellipsis in PostCard display (line-clamp-2), but show full title on single post page. Title should not break the card layout.

6. **Missing Featured Image:** Many posts will not have a featured image. PostCard and PostHeader should gracefully handle this: hide the image area entirely (do not show a placeholder) in PostCard, or show a minimal header without image in PostHeader.

7. **Comment Flood Prevention:** The Comment System enforces a 15-second minimum between comments server-side. The CommentForm should disable the submit button for 15 seconds after a successful submission and show a countdown: "You can comment again in X seconds."

8. **Comment Grace Period Editing:** Users can edit their own comments within 5 minutes. After the grace period, the "Edit" button disappears. The timer is computed client-side from `comment.createdAt`. If the user starts editing at 4:59 and tries to save at 5:01, the server will reject the edit -- show a clear error message.

9. **Deep Comment Threading:** At max depth (5), the "Reply" button still works but creates a reply at the max depth level (no further indentation). The UI should not allow infinite nesting or break the layout.

10. **Search With Special Characters:** The search query should be properly escaped for display (prevent XSS via `<mark>` highlighted excerpts). Use `dangerouslySetInnerHTML` only for the highlighted excerpt, and ensure the Search System properly sanitizes the HTML.

11. **Archive Page With No Posts:** If a category/tag/author has zero published posts, show the ArchiveHeader with "0 posts" and an empty state message. Do not 404 -- the taxonomy/author may exist but simply have no published content.

12. **Browser Back Button After Password Entry:** After entering a password for a protected post, if the user navigates away and comes back, the session cookie should still be valid. Do not re-prompt for the password on every page visit.

13. **Preview URL Security:** The `?preview=true&nonce=...` URL should be validated server-side. The nonce prevents unauthorized preview access. If the nonce is invalid, redirect to 404. Do not show draft content to unauthenticated users.

14. **BlockContentRenderer Unknown Block Types:** If the content JSON contains a block type that the renderer doesn't recognize (e.g., a new block type added in the editor but not yet supported in the renderer), gracefully skip it with a `<!-- unknown block: type_name -->` comment in dev mode, and nothing in production.

15. **SSR Hydration Mismatch:** The `DateDisplay` component with relative time ("2 hours ago") can cause hydration mismatches if the server and client compute different times. Render the absolute date in SSR and switch to relative time on the client after hydration. Wrap the relative time in a `useEffect` that runs after mount.

---

## Dependencies

### Depends On

| System | Type | Details |
|--------|------|---------|
| **Post System** | Hard | Blog index, single post, post cards, post metadata display. `posts.list`, `posts.get`, `posts.preview` queries. |
| **Page System** | Hard | Single page rendering, page templates. `pages.getByPath` query. |
| **Comment System** | Hard | Comment section on single post, threaded replies, comment form. `comments.forPost` query, `comments.create/reply/like/flag` mutations. |
| **Taxonomy System** | Hard | Category/tag archive pages, category/tag badges on posts. `taxonomies.getByPost`, `taxonomies.getBySlug` queries. |
| **Search System** | Hard | Search results page, search form, highlighted excerpts. `search.execute`, `search.suggest` queries. |
| **SEO System** | Medium | Meta tags, Open Graph, structured data, canonical URLs. `seo.getPostSeo`, `seo.getSettings` queries. |
| **User Profile System** | Medium | Author cards, author archive page. `users.getBySlug` query. |
| **Media System** | Medium | Featured images, responsive images with srcset. Media URL resolution. |
| **Content Editor System** | Medium | Block content rendering pipeline. BlockContentRenderer parses the same TipTap JSON format used by the editor. |
| **Routing System** | Soft | Permalink-based URLs, 404 page, page path resolution. |
| **RSS/Feed System** | Soft | Feed discovery link tags in `<head>`. |

### Depended On By

| System | Type | Details |
|--------|------|---------|
| None | -- | This is a leaf consumer. It renders content from backend systems but no other system depends on it. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **@base-ui/react** | UI primitives (Button in share buttons, comment form) |
| **TanStack Start** | SSR framework, route loaders, `head()` configuration |
| **TanStack Router** | Client-side routing, `<Link>` components, `useSearch`, `useParams` |
| **Convex** | Reactive queries for comments, post lists. `useQuery`, `useMutation` from `convex/react`. |
| **Convex Auth** | Auth state for comment section (check if user is signed in to comment) |
| **Lucide React** | Icons (search, share, heart, flag, message-circle, clock, calendar, copy, external-link, etc.) |
| **Sonner** | Toast notifications (copy link success, comment posted, errors) |
| **Zod** | Validation for comment form, search params |
| **class-variance-authority** | Component variants (PostCard variants) |
| **clsx + tailwind-merge** | Class utilities via `cn()` |

---

## Existing Code Reference

### Currently Implemented Files

| File | Status | Notes |
|------|--------|-------|
| `ConvexPress-Website/apps/web/src/routes/__root.tsx` | Complete | ConvexProvider + AuthKitProvider wrapping. Do not modify. |
| `ConvexPress-Website/apps/web/src/routes/index.tsx` | Placeholder | Currently shows health check. Will need updating when blog system is implemented (may become the front page or redirect to /blog). |
| `ConvexPress-Website/apps/web/src/components/header.tsx` | Basic | Sign-in/sign-out, basic nav. Will need blog/search links added (Website Layout UI expert's responsibility). |
| `ConvexPress-Website/apps/web/src/routes/api/auth/callback.tsx` | Complete | Auth callback. Do not modify. |

### UI Component Patterns (Match These)

All blog and content components should follow the patterns established in the existing UI components:

- **Button:** Uses `@base-ui/react/button` via `ButtonPrimitive`. Uses `cva` for variants. File: `src/components/ui/button.tsx`
- **Input:** Uses `@base-ui/react/input` via `InputPrimitive`. File: `src/components/ui/input.tsx`
- **Card:** Uses standard `div` elements with `data-slot` attributes. File: `src/components/ui/card.tsx`
- **Skeleton:** Uses `div` with animation classes. File: `src/components/ui/skeleton.tsx`
- **All colors via CSS variables** -- `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`, `text-destructive`, `bg-primary`, `text-primary-foreground`, etc.
- **No rounded corners** -- `rounded-none` is the default across all components
- **Text size** -- Default is `text-xs` for body, `text-sm` for headings within cards
- **Utility function:** `cn()` from `@/lib/utils` for class merging (uses `clsx` + `tailwind-merge`)

### Package Dependencies (Already Installed)

These packages are already available in `ConvexPress-Website/apps/web/package.json`:
- `@base-ui/react` -- UI primitives
- `@auth/authkit-tanstack-react-start` -- Auth integration
- `@tanstack/react-form` -- Form management
- `class-variance-authority` -- Component variants
- `clsx` + `tailwind-merge` -- Class utilities
- `lucide-react` -- Icons
- `sonner` -- Toast notifications
- `zod` -- Validation
- `convex` -- Database client
