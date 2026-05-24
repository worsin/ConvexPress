# Tabbed Editor Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the post/page editor from a single-page view into a tabbed detail view with Content, SEO, Traffic, and Engagement tabs, plus add image pickers to structured content editors (HeroSectionEditor and TopicSectionEditor).

**Architecture:** Parent layout routes at `$postId.tsx` and `$pageId.tsx` load post data once and render a tab bar. Child routes (`/edit`, `/seo`, `/traffic`, `/engagement`) render their content into an `<Outlet />`. The existing EditorLayout moves into the `/edit` child route unchanged. SEO tab recomposes existing SEO components into a full-page dashboard. Traffic and Engagement tabs are placeholders until the Analytics System is built.

**Tech Stack:** TanStack Router (file-based routing, layout routes), React, Convex (reactive queries), existing SEO/Media components, Tailwind CSS v4, Lucide icons.

---

## Task 1: Create PostDetailLayout Component

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/editor/PostDetailLayout.tsx`

This is a shared layout component that both the post and page layout routes will use. It loads the post/page data, renders a header bar with status info, a tab navigation bar with live badges, and an `<Outlet />` for child routes.

- [ ] **Step 1: Create PostDetailLayout.tsx**

Create `ConvexPress-Admin/apps/web/src/components/editor/PostDetailLayout.tsx`:

```typescript
/**
 * PostDetailLayout - Tabbed layout wrapper for post/page detail views.
 *
 * Loads post data once at the layout level, renders a tab bar with
 * Content/SEO/Traffic/Engagement tabs, and passes data to child routes
 * via outlet context.
 */

import { useMemo } from "react";
import { Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  FileText,
  Search,
  BarChart3,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePostSeo } from "@/hooks/seo/usePostSeo";
import { SeoScoreBadge } from "@/components/seo/SeoScoreBadge";

type ContentType = "post" | "page";

interface PostDetailLayoutProps {
  contentType: ContentType;
}

/** Data passed to child routes via outlet context */
export interface PostDetailContext {
  contentType: ContentType;
  postId: string;
  post: NonNullable<ReturnType<typeof useQuery<typeof api.posts.queries.get>>>;
  postSeo: ReturnType<typeof usePostSeo>;
}

interface TabDef {
  id: string;
  label: string;
  icon: typeof FileText;
  path: string;
  badge?: React.ReactNode;
}

export function PostDetailLayout({ contentType }: PostDetailLayoutProps) {
  // Extract the ID param — posts use $postId, pages use $pageId
  const params = useParams({ strict: false }) as Record<string, string>;
  const postId = contentType === "post" ? params.postId : params.pageId;

  if (!postId) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No {contentType} ID provided.
        </p>
      </div>
    );
  }

  return <PostDetailLayoutInner contentType={contentType} postId={postId} />;
}

function PostDetailLayoutInner({
  contentType,
  postId,
}: {
  contentType: ContentType;
  postId: string;
}) {
  const location = useLocation();

  // Load post data (single query, shared by all tabs)
  const post = useQuery(
    contentType === "post"
      ? api.posts.queries.get
      : api.pages.queries.get,
    contentType === "post"
      ? { postId: postId as Id<"posts"> }
      : { pageId: postId as Id<"posts"> },
  );

  // Load SEO data for the badge
  const postSeo = usePostSeo(postId as Id<"posts">);

  // Determine the base path for tab links
  const basePath = contentType === "post"
    ? `/posts/${postId}`
    : `/pages/${postId}`;

  // Build tab definitions with live badges
  const tabs: TabDef[] = useMemo(() => {
    const seoScore = postSeo?.seoScore ?? null;

    return [
      {
        id: "edit",
        label: "Content",
        icon: FileText,
        path: `${basePath}/edit`,
      },
      {
        id: "seo",
        label: "SEO",
        icon: Search,
        path: `${basePath}/seo`,
        badge: seoScore != null ? (
          <SeoScoreBadge score={seoScore} size="sm" showLabel={false} />
        ) : null,
      },
      {
        id: "traffic",
        label: "Traffic",
        icon: BarChart3,
        path: `${basePath}/traffic`,
        badge: (
          <span className="text-[10px] text-muted-foreground">--</span>
        ),
      },
      {
        id: "engagement",
        label: "Engagement",
        icon: MessageSquare,
        path: `${basePath}/engagement`,
        badge: (
          <span className="text-[10px] text-muted-foreground">--</span>
        ),
      },
    ];
  }, [basePath, postSeo?.seoScore]);

  // Determine active tab from current path
  const activeTabId = useMemo(() => {
    const path = location.pathname;
    if (path.endsWith("/seo")) return "seo";
    if (path.endsWith("/traffic")) return "traffic";
    if (path.endsWith("/engagement")) return "engagement";
    return "edit";
  }, [location.pathname]);

  // Loading state
  if (post === undefined) {
    return <PostDetailSkeleton />;
  }

  // Not found
  if (post === null) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          {contentType === "post" ? "Post" : "Page"} Not Found
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          The {contentType} you are looking for does not exist or has been deleted.
        </p>
        <Link
          to={contentType === "post" ? "/posts" : "/pages"}
          className="text-sm text-primary hover:underline"
        >
          Back to All {contentType === "post" ? "Posts" : "Pages"}
        </Link>
      </div>
    );
  }

  // Build the status badge text
  const statusLabel = post.status.charAt(0).toUpperCase() + post.status.slice(1);
  const statusColor =
    post.status === "publish"
      ? "bg-primary/10 text-primary"
      : post.status === "draft"
        ? "bg-muted text-muted-foreground"
        : post.status === "pending"
          ? "bg-warning/10 text-warning"
          : post.status === "trash"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground";

  // Last saved time
  const lastSaved = post._creationTime
    ? new Date(post._creationTime).toLocaleString()
    : null;

  // Outlet context for child routes
  const outletContext: PostDetailContext = {
    contentType,
    postId,
    post: post as PostDetailContext["post"],
    postSeo,
  };

  return (
    <div className="space-y-0">
      {/* ── Header bar ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-semibold text-foreground truncate">
            {post.title || "Untitled"}
          </h1>
          <span
            className={cn(
              "shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              statusColor,
            )}
          >
            {statusLabel}
          </span>
          {post.status === "publish" && (
            <a
              href={
                contentType === "post"
                  ? `/blog/${post.slug || postId}`
                  : `/${post.slug || postId}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </div>

        {lastSaved && (
          <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
            Last saved {lastSaved}
          </span>
        )}
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card">
        <nav className="flex px-6 gap-0" aria-label="Editor tabs">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const Icon = tab.icon;

            return (
              <Link
                key={tab.id}
                to={tab.path}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="size-4" aria-hidden="true" />
                {tab.label}
                {tab.badge && (
                  <span className="ml-1">{tab.badge}</span>
                )}
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Tab content (child route) ──────────────────────────────── */}
      <div className="pt-4">
        <Outlet context={outletContext} />
      </div>
    </div>
  );
}

/** Skeleton shown while post data loads at the layout level */
function PostDetailSkeleton() {
  return (
    <div className="space-y-0">
      <div className="border-b border-border bg-card px-6 py-3 flex items-center gap-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="border-b border-border bg-card px-6 py-2.5 flex gap-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/editor/PostDetailLayout.tsx
git commit -m "feat(editor): add PostDetailLayout component with tabbed navigation and live SEO badge"
```

---

## Task 2: Create Post Layout Route

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId.tsx`

This file-based route becomes the **layout** for all `posts/$postId/*` child routes. TanStack Router automatically wraps child routes (`edit`, `seo`, `traffic`, `engagement`, `revisions`) in this layout.

- [ ] **Step 1: Create the post layout route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId.tsx`:

```typescript
/**
 * Post Detail Layout Route - /admin/posts/$postId
 *
 * Layout route that wraps all post detail child routes (edit, seo, traffic, engagement, revisions).
 * Renders the PostDetailLayout with tabbed navigation.
 *
 * If the user navigates to /posts/$postId directly (no child route),
 * TanStack Router will render the first matching child. We rely on
 * beforeLoad to redirect to /edit.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { PostDetailLayout } from "@/components/editor/PostDetailLayout";

export const Route = createFileRoute("/_authenticated/_admin/posts/$postId")({
  component: PostDetailLayoutRoute,
  beforeLoad: ({ location, params }) => {
    // If path is exactly /posts/$postId with no child segment, redirect to /edit
    const path = location.pathname;
    const base = `/posts/${params.postId}`;
    // Check if there is no child route segment after the postId
    if (path === base || path === `${base}/`) {
      throw redirect({ to: "/posts/$postId/edit", params: { postId: params.postId } });
    }
  },
});

function PostDetailLayoutRoute() {
  return <PostDetailLayout contentType="post" />;
}
```

- [ ] **Step 2: Update the edit route path to match new nesting**

The existing `edit.tsx` uses `createFileRoute("/_authenticated/_admin/posts/$postId/edit")`. Since `$postId.tsx` is now a layout route with an `<Outlet />`, the child route `edit.tsx` inside the `$postId/` directory will be automatically nested. No change is needed to `edit.tsx` -- TanStack Router's file-based routing handles this automatically because the `$postId/` directory already contains `edit.tsx` and `edit.lazy.tsx`.

Verify: The existing route path string `"/_authenticated/_admin/posts/$postId/edit"` in both `edit.tsx` and `edit.lazy.tsx` already correctly specifies the full path, which TanStack Router will match as a child of the `$postId` layout route.

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/\$postId.tsx
git commit -m "feat(routes): add post layout route with tab shell and redirect to /edit"
```

---

## Task 3: Create Page Layout Route

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId.tsx`

Same pattern as Task 2 but for pages.

- [ ] **Step 1: Create the page layout route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId.tsx`:

```typescript
/**
 * Page Detail Layout Route - /admin/pages/$pageId
 *
 * Layout route that wraps all page detail child routes (edit, seo, traffic, engagement, revisions).
 * Renders the PostDetailLayout with tabbed navigation.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { PostDetailLayout } from "@/components/editor/PostDetailLayout";

export const Route = createFileRoute("/_authenticated/_admin/pages/$pageId")({
  component: PageDetailLayoutRoute,
  beforeLoad: ({ location, params }) => {
    const path = location.pathname;
    const base = `/pages/${params.pageId}`;
    if (path === base || path === `${base}/`) {
      throw redirect({ to: "/pages/$pageId/edit", params: { pageId: params.pageId } });
    }
  },
});

function PageDetailLayoutRoute() {
  return <PostDetailLayout contentType="page" />;
}
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/\$pageId.tsx
git commit -m "feat(routes): add page layout route with tab shell and redirect to /edit"
```

---

## Task 4: Update Existing Edit Routes

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/edit.lazy.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/edit.lazy.tsx`

The parent layout now loads post data and exposes it via outlet context. However, the existing edit routes have their own data loading and error/not-found/trash states. The safest approach for this phase is to **keep the child routes self-contained** -- they continue loading their own data. The parent layout loads data independently for the tab bar header and SEO badge. Both use the same Convex reactive query, so Convex will deduplicate the subscription (same query + same args = single subscription).

This means Task 4 requires **no changes** to the existing edit route files. The edit routes continue to work exactly as they do now, and the parent layout simply wraps them with the tab bar. The `<Outlet />` in `PostDetailLayout` renders whatever child route is active.

**Why not pass data via outlet context?** The edit route's data loading includes post taxonomies, trash restoration logic, and complex EditorFormValues mapping. Refactoring all of that to use outlet context would be a large change with high regression risk. Convex query deduplication means the "duplicate" query is free. We can refactor to shared context in a future pass.

- [ ] **Step 1: Verify existing routes render correctly within new layout**

No code changes needed. The existing files at:
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/edit.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/edit.lazy.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/edit.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/edit.lazy.tsx`

...all remain unchanged. TanStack Router nests them inside the new `$postId.tsx` / `$pageId.tsx` layout routes automatically.

**Important:** The edit routes' `EditorHeader` component renders its own header bar (with "Edit Post" title, view link, autosave badge). This will now appear **below** the `PostDetailLayout` header and tab bar, creating a slight visual duplication of the post title. This is acceptable for Phase 1. A future cleanup task can remove the redundant header from `EditorHeader` when the tabbed shell is the sole header.

- [ ] **Step 2: Verify revisions route also works**

The existing `revisions.tsx` route at:
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/revisions.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/revisions.tsx`

...will also be nested under the layout route. The revisions page will show the tab bar but no tab will be active (since revisions is not one of the 4 tabs). This is acceptable -- the user can click any tab to navigate back to the main views.

- [ ] **Step 3: No commit needed (no changes)**

---

## Task 5: Create SEO Dashboard Tab

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/seo.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/seo.lazy.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/seo.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/seo.lazy.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/seo/SeoDashboardTab.tsx`

The SEO dashboard tab is a full-page view that recomposes existing SEO components (SeoScoreBadge, SerpPreview, FacebookPreview, TwitterPreview, SeoAnalysisResults) with the analysis hooks (useSeoAnalysis, useReadabilityAnalysis, usePostSeo).

- [ ] **Step 1: Create the SeoDashboardTab component**

Create `ConvexPress-Admin/apps/web/src/components/seo/SeoDashboardTab.tsx`:

```typescript
/**
 * SeoDashboardTab - Full-page SEO dashboard for the tabbed editor.
 *
 * Displays score cards, SERP/social previews, and analysis results
 * in a spacious two-column layout. Reuses existing SEO components.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  Search,
  BookOpen,
  AlertTriangle,
  Star,
  CheckCircle2,
  AlertCircle,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePostSeo } from "@/hooks/seo/usePostSeo";
import { useSeoAnalysis } from "@/hooks/seo/useSeoAnalysis";
import { useReadabilityAnalysis } from "@/hooks/seo/useReadabilityAnalysis";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { SeoScoreBadge } from "./SeoScoreBadge";
import { SerpPreview } from "./SerpPreview";
import { FacebookPreview } from "./FacebookPreview";
import { TwitterPreview } from "./TwitterPreview";
import { SeoAnalysisResults } from "./SeoAnalysisResults";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CharacterCounter } from "./CharacterCounter";
import {
  SEO_TITLE_RECOMMENDED_MIN,
  SEO_TITLE_RECOMMENDED_MAX,
  SEO_TITLE_MAX,
  META_DESCRIPTION_RECOMMENDED_MIN,
  META_DESCRIPTION_RECOMMENDED_MAX,
  META_DESCRIPTION_MAX,
  FOCUS_KEYPHRASE_MAX,
} from "@/lib/seo/constants";

interface SeoDashboardTabProps {
  postId: string;
  contentType: "post" | "page";
}

export function SeoDashboardTab({ postId, contentType }: SeoDashboardTabProps) {
  const typedPostId = postId as Id<"posts">;

  // Load post data for analysis (title, slug, content, excerpt)
  const post = useQuery(
    contentType === "post"
      ? api.posts.queries.get
      : api.pages.queries.get,
    contentType === "post"
      ? { postId: typedPostId }
      : { pageId: typedPostId },
  );

  // Load site URL for previews
  const generalSettings = useQuery(api.settings.queries.get, { section: "general" });
  const siteUrl = (generalSettings as { siteUrl?: string } | undefined)?.siteUrl || "";

  // Load existing SEO data
  const postSeo = usePostSeo(typedPostId);
  const { updatePostSeo } = useSeoMutations();

  // Local state for editable fields
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [focusKeyphrase, setFocusKeyphrase] = useState("");
  const [canonical, setCanonical] = useState("");
  const [noindex, setNoindex] = useState(false);
  const [nofollow, setNofollow] = useState(false);
  const [cornerstone, setCornerstone] = useState(false);
  const [ogTitle, setOgTitle] = useState("");
  const [ogDescription, setOgDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [twitterTitle, setTwitterTitle] = useState("");
  const [twitterDescription, setTwitterDescription] = useState("");
  const [twitterImage, setTwitterImage] = useState("");

  // Sync from server
  useEffect(() => {
    if (postSeo) {
      setSeoTitle(postSeo.seoTitle ?? "");
      setSeoDescription(postSeo.seoDescription ?? "");
      setFocusKeyphrase(postSeo.focusKeyphrase ?? "");
      setCanonical(postSeo.canonical ?? "");
      setNoindex(postSeo.noindex ?? false);
      setNofollow(postSeo.nofollow ?? false);
      setCornerstone(postSeo.cornerstone ?? false);
      setOgTitle(postSeo.ogTitle ?? "");
      setOgDescription(postSeo.ogDescription ?? "");
      setOgImage(postSeo.ogImage ?? "");
      setTwitterTitle(postSeo.twitterTitle ?? "");
      setTwitterDescription(postSeo.twitterDescription ?? "");
      setTwitterImage(postSeo.twitterImage ?? "");
    }
  }, [postSeo]);

  // Post fields for analysis
  const postTitle = post?.title ?? "";
  const postSlug = post?.slug ?? "";
  const postContent = post?.content ?? "";
  const postExcerpt = (post as { excerpt?: string } | undefined)?.excerpt ?? "";

  // Analysis hooks
  const seoAnalysis = useSeoAnalysis({
    content: postContent,
    title: postTitle,
    slug: postSlug,
    excerpt: postExcerpt,
    focusKeyphrase,
    metaTitle: seoTitle,
    metaDescription: seoDescription,
  });

  const readabilityAnalysis = useReadabilityAnalysis({
    content: postContent,
    title: postTitle,
  });

  // Save handler
  const handleSave = useCallback(async () => {
    try {
      await updatePostSeo({
        postId: typedPostId,
        seoTitle,
        seoDescription,
        focusKeyphrase,
        canonical,
        noindex,
        nofollow,
        cornerstone,
        ogTitle,
        ogDescription,
        ogImage,
        twitterTitle,
        twitterDescription,
        twitterImage,
        seoScore: seoAnalysis?.score,
        readabilityScore: readabilityAnalysis?.score,
      });
    } catch {
      // Error toast handled by useSeoMutations
    }
  }, [
    typedPostId, seoTitle, seoDescription, focusKeyphrase, canonical,
    noindex, nofollow, cornerstone, ogTitle, ogDescription, ogImage,
    twitterTitle, twitterDescription, twitterImage,
    seoAnalysis?.score, readabilityAnalysis?.score, updatePostSeo,
  ]);

  const url = contentType === "post"
    ? `${siteUrl}/blog/${postSlug || "..."}`
    : `${siteUrl}/${postSlug || "..."}`;

  // Score summary counts
  const seoChecks = seoAnalysis?.checks ?? [];
  const readabilityChecks = readabilityAnalysis?.checks ?? [];
  const allChecks = [...seoChecks, ...readabilityChecks];
  const poorCount = allChecks.filter((c) => c.status === "poor").length;
  const okCount = allChecks.filter((c) => c.status === "ok").length;
  const goodCount = allChecks.filter((c) => c.status === "good").length;

  if (post === undefined) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="border border-border bg-card p-4 animate-pulse">
              <div className="h-4 w-20 bg-muted mb-2" />
              <div className="h-8 w-12 bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Score Cards Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* SEO Score */}
        <ScoreCard
          label="SEO Score"
          icon={Search}
          score={seoAnalysis?.score ?? postSeo?.seoScore ?? null}
        />
        {/* Readability */}
        <ScoreCard
          label="Readability"
          icon={BookOpen}
          score={readabilityAnalysis?.score ?? postSeo?.readabilityScore ?? null}
        />
        {/* Issues */}
        <div className="border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Issues
            </span>
          </div>
          <div className="flex items-center gap-3">
            {poorCount > 0 && (
              <span className="flex items-center gap-1 text-sm font-semibold text-seo-poor">
                <AlertCircle className="size-3.5" />
                {poorCount}
              </span>
            )}
            {okCount > 0 && (
              <span className="flex items-center gap-1 text-sm font-semibold text-seo-ok">
                <Circle className="size-3.5" />
                {okCount}
              </span>
            )}
            {goodCount > 0 && (
              <span className="flex items-center gap-1 text-sm font-semibold text-seo-good">
                <CheckCircle2 className="size-3.5" />
                {goodCount}
              </span>
            )}
            {allChecks.length === 0 && (
              <span className="text-sm text-muted-foreground">Analyzing...</span>
            )}
          </div>
        </div>
        {/* Cornerstone */}
        <div className="border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Cornerstone
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cornerstone}
                onChange={(e) => {
                  setCornerstone(e.target.checked);
                  // Auto-save after toggle
                  setTimeout(handleSave, 100);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted peer-checked:bg-primary transition-colors rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-card after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-4" />
            </label>
            <span className="text-sm font-medium text-foreground">
              {cornerstone ? "Yes" : "No"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left column: Editable fields + analysis */}
        <div className="space-y-6">
          {/* Focus Keyphrase */}
          <div className="border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Focus Keyphrase</h2>
            <Input
              value={focusKeyphrase}
              onChange={(e) => setFocusKeyphrase(e.target.value)}
              onBlur={handleSave}
              placeholder="Enter your focus keyphrase..."
              maxLength={FOCUS_KEYPHRASE_MAX}
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              The keyphrase you want this {contentType} to rank for. Used for SEO analysis checks.
            </p>
          </div>

          {/* SEO Title & Description */}
          <div className="border border-border bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Search Appearance</h2>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">SEO Title</Label>
              <Input
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                onBlur={handleSave}
                placeholder={postTitle || "Enter SEO title..."}
                maxLength={SEO_TITLE_MAX}
                className="text-sm"
              />
              <CharacterCounter
                current={seoTitle.length}
                recommendedMin={SEO_TITLE_RECOMMENDED_MIN}
                recommendedMax={SEO_TITLE_RECOMMENDED_MAX}
                max={SEO_TITLE_MAX}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Meta Description</Label>
              <textarea
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                onBlur={handleSave}
                placeholder="Enter a meta description for search engines..."
                maxLength={META_DESCRIPTION_MAX}
                rows={3}
                className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors resize-y"
              />
              <CharacterCounter
                current={seoDescription.length}
                recommendedMin={META_DESCRIPTION_RECOMMENDED_MIN}
                recommendedMax={META_DESCRIPTION_RECOMMENDED_MAX}
                max={META_DESCRIPTION_MAX}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Canonical URL</Label>
              <Input
                value={canonical}
                onChange={(e) => setCanonical(e.target.value)}
                onBlur={handleSave}
                placeholder="Leave empty to use default URL"
                className="text-sm"
              />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={noindex}
                  onChange={(e) => {
                    setNoindex(e.target.checked);
                    setTimeout(handleSave, 100);
                  }}
                  className="rounded-sm border border-border"
                />
                No Index
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={nofollow}
                  onChange={(e) => {
                    setNofollow(e.target.checked);
                    setTimeout(handleSave, 100);
                  }}
                  className="rounded-sm border border-border"
                />
                No Follow
              </label>
            </div>
          </div>

          {/* SEO Analysis Results */}
          {seoAnalysis && (
            <div className="border border-border bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">SEO Analysis</h2>
              <SeoAnalysisResults
                checks={seoAnalysis.checks}
                title="SEO Checks"
                defaultExpanded={true}
              />
            </div>
          )}

          {/* Readability Analysis Results */}
          {readabilityAnalysis && (
            <div className="border border-border bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Readability Analysis</h2>
              <SeoAnalysisResults
                checks={readabilityAnalysis.checks}
                title="Readability Checks"
                defaultExpanded={true}
              />
            </div>
          )}
        </div>

        {/* Right column: Previews */}
        <div className="space-y-6">
          {/* SERP Preview */}
          <div className="border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Google Preview</h2>
            <SerpPreview
              title={seoTitle || postTitle}
              description={seoDescription || postExcerpt}
              url={url}
            />
          </div>

          {/* Facebook Preview */}
          <div className="border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Facebook Preview</h2>
            <FacebookPreview
              title={ogTitle || seoTitle || postTitle}
              description={ogDescription || seoDescription || postExcerpt}
              image={ogImage || null}
              url={url}
            />
            {/* OG Override fields */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground">OG Title Override</Label>
                <Input
                  value={ogTitle}
                  onChange={(e) => setOgTitle(e.target.value)}
                  onBlur={handleSave}
                  placeholder="Use SEO title"
                  className="text-xs h-7"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground">OG Description Override</Label>
                <Input
                  value={ogDescription}
                  onChange={(e) => setOgDescription(e.target.value)}
                  onBlur={handleSave}
                  placeholder="Use meta description"
                  className="text-xs h-7"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground">OG Image URL</Label>
                <Input
                  value={ogImage}
                  onChange={(e) => setOgImage(e.target.value)}
                  onBlur={handleSave}
                  placeholder="https://..."
                  className="text-xs h-7"
                />
              </div>
            </div>
          </div>

          {/* Twitter Preview */}
          <div className="border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Twitter Preview</h2>
            <TwitterPreview
              title={twitterTitle || ogTitle || seoTitle || postTitle}
              description={twitterDescription || ogDescription || seoDescription || postExcerpt}
              image={twitterImage || ogImage || null}
              url={url}
            />
            {/* Twitter Override fields */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground">Twitter Title Override</Label>
                <Input
                  value={twitterTitle}
                  onChange={(e) => setTwitterTitle(e.target.value)}
                  onBlur={handleSave}
                  placeholder="Use OG/SEO title"
                  className="text-xs h-7"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground">Twitter Description Override</Label>
                <Input
                  value={twitterDescription}
                  onChange={(e) => setTwitterDescription(e.target.value)}
                  onBlur={handleSave}
                  placeholder="Use OG/meta description"
                  className="text-xs h-7"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium text-muted-foreground">Twitter Image URL</Label>
                <Input
                  value={twitterImage}
                  onChange={(e) => setTwitterImage(e.target.value)}
                  onBlur={handleSave}
                  placeholder="Use OG image"
                  className="text-xs h-7"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reusable score card for the top row */
function ScoreCard({
  label,
  icon: Icon,
  score,
}: {
  label: string;
  icon: typeof Search;
  score: number | null;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <SeoScoreBadge score={score} size="lg" showLabel={true} />
    </div>
  );
}
```

- [ ] **Step 2: Create post SEO route config**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/seo.tsx`:

```typescript
/**
 * Post SEO Tab - /admin/posts/$postId/seo
 *
 * Route configuration for the SEO dashboard tab.
 * Component is lazy-loaded from seo.lazy.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/_authenticated/_admin/posts/$postId/seo",
)({
  pendingComponent: SeoTabSkeleton,
});

function SeoTabSkeleton() {
  return (
    <div className="space-y-4 max-w-5xl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create post SEO lazy component**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/seo.lazy.tsx`:

```typescript
/**
 * Post SEO Tab - Lazy-loaded component
 */

import { createLazyFileRoute, useParams } from "@tanstack/react-router";
import { SeoDashboardTab } from "@/components/seo/SeoDashboardTab";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/seo",
)({
  component: PostSeoTab,
});

function PostSeoTab() {
  const { postId } = useParams({
    from: "/_authenticated/_admin/posts/$postId/seo",
  });

  return <SeoDashboardTab postId={postId} contentType="post" />;
}
```

- [ ] **Step 4: Create page SEO route config**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/seo.tsx`:

```typescript
/**
 * Page SEO Tab - /admin/pages/$pageId/seo
 *
 * Route configuration for the SEO dashboard tab.
 * Component is lazy-loaded from seo.lazy.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/_authenticated/_admin/pages/$pageId/seo",
)({
  pendingComponent: SeoTabSkeleton,
});

function SeoTabSkeleton() {
  return (
    <div className="space-y-4 max-w-5xl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create page SEO lazy component**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/seo.lazy.tsx`:

```typescript
/**
 * Page SEO Tab - Lazy-loaded component
 */

import { createLazyFileRoute, useParams } from "@tanstack/react-router";
import { SeoDashboardTab } from "@/components/seo/SeoDashboardTab";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/pages/$pageId/seo",
)({
  component: PageSeoTab,
});

function PageSeoTab() {
  const { pageId } = useParams({
    from: "/_authenticated/_admin/pages/$pageId/seo",
  });

  return <SeoDashboardTab postId={pageId} contentType="page" />;
}
```

- [ ] **Step 6: Commit**

```bash
git add \
  ConvexPress-Admin/apps/web/src/components/seo/SeoDashboardTab.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/\$postId/seo.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/\$postId/seo.lazy.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/\$pageId/seo.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/\$pageId/seo.lazy.tsx
git commit -m "feat(seo): add full-page SEO dashboard tab with score cards, previews, and analysis"
```

---

## Task 6: Create Traffic Tab Placeholder

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/traffic.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/traffic.lazy.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/traffic.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/traffic.lazy.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/editor/TrafficTabPlaceholder.tsx`

- [ ] **Step 1: Create the shared TrafficTabPlaceholder component**

Create `ConvexPress-Admin/apps/web/src/components/editor/TrafficTabPlaceholder.tsx`:

```typescript
/**
 * TrafficTabPlaceholder - Placeholder for the Traffic analytics tab.
 *
 * Shows a friendly message and placeholder cards until the Analytics System
 * or GA4 integration is implemented.
 */

import { BarChart3, TrendingUp, Users, Eye, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrafficTabPlaceholderProps {
  contentType: "post" | "page";
}

export function TrafficTabPlaceholder({ contentType }: TrafficTabPlaceholderProps) {
  return (
    <div className="max-w-5xl space-y-6">
      {/* Status banner */}
      <div className="border border-border bg-card p-6 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mx-auto">
          <BarChart3 className="size-6 text-muted-foreground" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Traffic Analytics Coming Soon
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Connect Google Analytics or wait for the built-in tracking system to see
          pageviews, sessions, referrers, and traffic trends for this {contentType}.
        </p>
      </div>

      {/* Placeholder metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PlaceholderMetricCard icon={Eye} label="Page Views" value="--" />
        <PlaceholderMetricCard icon={Users} label="Unique Visitors" value="--" />
        <PlaceholderMetricCard icon={Clock} label="Avg. Time on Page" value="--" />
        <PlaceholderMetricCard icon={TrendingUp} label="Bounce Rate" value="--" />
      </div>

      {/* Placeholder chart area */}
      <div className="border border-dashed border-border bg-muted/20 p-8 text-center space-y-2">
        <div className="flex items-center justify-center gap-1 opacity-30">
          {[40, 65, 45, 80, 55, 70, 90, 60, 75, 85, 50, 95].map((h, i) => (
            <div
              key={i}
              className="w-6 bg-primary/20"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground pt-4">
          Traffic chart will appear here when analytics data is available.
        </p>
      </div>

      {/* Placeholder tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PlaceholderTable title="Top Referrers" rows={["Direct", "Google", "Twitter", "Facebook", "LinkedIn"]} />
        <PlaceholderTable title="Top Countries" rows={["United States", "United Kingdom", "Canada", "Germany", "India"]} />
      </div>
    </div>
  );
}

function PlaceholderMetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <span className="text-2xl font-semibold text-muted-foreground/40">
        {value}
      </span>
    </div>
  );
}

function PlaceholderTable({
  title,
  rows,
}: {
  title: string;
  rows: string[];
}) {
  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row} className="px-4 py-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground/60">{row}</span>
            <span className="text-sm text-muted-foreground/30">--</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create post traffic route config**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/traffic.tsx`:

```typescript
/**
 * Post Traffic Tab - /admin/posts/$postId/traffic
 *
 * Route configuration. Component is lazy-loaded.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/posts/$postId/traffic",
)({});
```

- [ ] **Step 3: Create post traffic lazy component**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/traffic.lazy.tsx`:

```typescript
/**
 * Post Traffic Tab - Lazy-loaded component
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { TrafficTabPlaceholder } from "@/components/editor/TrafficTabPlaceholder";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/traffic",
)({
  component: PostTrafficTab,
});

function PostTrafficTab() {
  return <TrafficTabPlaceholder contentType="post" />;
}
```

- [ ] **Step 4: Create page traffic route config**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/traffic.tsx`:

```typescript
/**
 * Page Traffic Tab - /admin/pages/$pageId/traffic
 *
 * Route configuration. Component is lazy-loaded.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/pages/$pageId/traffic",
)({});
```

- [ ] **Step 5: Create page traffic lazy component**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/traffic.lazy.tsx`:

```typescript
/**
 * Page Traffic Tab - Lazy-loaded component
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { TrafficTabPlaceholder } from "@/components/editor/TrafficTabPlaceholder";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/pages/$pageId/traffic",
)({
  component: PageTrafficTab,
});

function PageTrafficTab() {
  return <TrafficTabPlaceholder contentType="page" />;
}
```

- [ ] **Step 6: Commit**

```bash
git add \
  ConvexPress-Admin/apps/web/src/components/editor/TrafficTabPlaceholder.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/\$postId/traffic.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/\$postId/traffic.lazy.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/\$pageId/traffic.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/\$pageId/traffic.lazy.tsx
git commit -m "feat(editor): add Traffic tab placeholder with metric cards and chart preview"
```

---

## Task 7: Create Engagement Tab Placeholder

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/engagement.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/engagement.lazy.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/engagement.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/engagement.lazy.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/editor/EngagementTabPlaceholder.tsx`

- [ ] **Step 1: Create the shared EngagementTabPlaceholder component**

Create `ConvexPress-Admin/apps/web/src/components/editor/EngagementTabPlaceholder.tsx`:

```typescript
/**
 * EngagementTabPlaceholder - Placeholder for the Engagement analytics tab.
 *
 * Shows placeholder cards for comments, shares, scroll depth,
 * and engagement metrics until the Analytics System is implemented.
 */

import {
  MessageSquare,
  Share2,
  MousePointerClick,
  ArrowDown,
  Heart,
  Timer,
} from "lucide-react";

interface EngagementTabPlaceholderProps {
  contentType: "post" | "page";
}

export function EngagementTabPlaceholder({ contentType }: EngagementTabPlaceholderProps) {
  return (
    <div className="max-w-5xl space-y-6">
      {/* Status banner */}
      <div className="border border-border bg-card p-6 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mx-auto">
          <MessageSquare className="size-6 text-muted-foreground" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Engagement Metrics Coming Soon
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Track how readers interact with this {contentType}: comments, shares,
          scroll depth, clicks, and time spent reading.
        </p>
      </div>

      {/* Placeholder metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <EngagementMetricCard icon={MessageSquare} label="Comments" value="--" />
        <EngagementMetricCard icon={Share2} label="Social Shares" value="--" />
        <EngagementMetricCard icon={MousePointerClick} label="CTA Clicks" value="--" />
        <EngagementMetricCard icon={ArrowDown} label="Avg. Scroll Depth" value="--" />
        <EngagementMetricCard icon={Timer} label="Avg. Read Time" value="--" />
        <EngagementMetricCard icon={Heart} label="Reactions" value="--" />
      </div>

      {/* Placeholder engagement timeline */}
      <div className="border border-border bg-card">
        <div className="px-4 py-2.5 border-b border-border">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Engagement Timeline
          </h3>
        </div>
        <div className="p-8 text-center">
          <div className="flex items-end justify-center gap-2 opacity-20">
            {[20, 35, 25, 50, 40, 55, 30, 45, 60, 35, 50, 40, 55, 65].map((h, i) => (
              <div
                key={i}
                className="w-4 bg-primary/30 rounded-t"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-4">
            Engagement data will appear here when tracking is enabled.
          </p>
        </div>
      </div>

      {/* Comment summary placeholder */}
      <div className="border border-border bg-card">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Recent Comments
          </h3>
          <span className="text-[10px] text-muted-foreground">0 total</span>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No comments yet on this {contentType}.
          </p>
        </div>
      </div>
    </div>
  );
}

function EngagementMetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MessageSquare;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <span className="text-2xl font-semibold text-muted-foreground/40">
        {value}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create post engagement route config**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/engagement.tsx`:

```typescript
/**
 * Post Engagement Tab - /admin/posts/$postId/engagement
 *
 * Route configuration. Component is lazy-loaded.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/posts/$postId/engagement",
)({});
```

- [ ] **Step 3: Create post engagement lazy component**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/engagement.lazy.tsx`:

```typescript
/**
 * Post Engagement Tab - Lazy-loaded component
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { EngagementTabPlaceholder } from "@/components/editor/EngagementTabPlaceholder";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/engagement",
)({
  component: PostEngagementTab,
});

function PostEngagementTab() {
  return <EngagementTabPlaceholder contentType="post" />;
}
```

- [ ] **Step 4: Create page engagement route config**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/engagement.tsx`:

```typescript
/**
 * Page Engagement Tab - /admin/pages/$pageId/engagement
 *
 * Route configuration. Component is lazy-loaded.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/pages/$pageId/engagement",
)({});
```

- [ ] **Step 5: Create page engagement lazy component**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/engagement.lazy.tsx`:

```typescript
/**
 * Page Engagement Tab - Lazy-loaded component
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { EngagementTabPlaceholder } from "@/components/editor/EngagementTabPlaceholder";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/pages/$pageId/engagement",
)({
  component: PageEngagementTab,
});

function PageEngagementTab() {
  return <EngagementTabPlaceholder contentType="page" />;
}
```

- [ ] **Step 6: Commit**

```bash
git add \
  ConvexPress-Admin/apps/web/src/components/editor/EngagementTabPlaceholder.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/\$postId/engagement.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/\$postId/engagement.lazy.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/\$pageId/engagement.tsx \
  ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/\$pageId/engagement.lazy.tsx
git commit -m "feat(editor): add Engagement tab placeholder with metric cards and comment summary"
```

---

## Task 8: Add Image Picker to HeroSectionEditor

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/components/editor/structured/HeroSectionEditor.tsx`

Add an inline image picker to the hero section editor. When an image is selected, show a thumbnail preview. When no image is set, show a "Select Hero Image" button. The pattern mirrors `FeaturedImageMetabox`.

- [ ] **Step 1: Add image picker with thumbnail preview to HeroSectionEditor**

Replace the entire contents of `ConvexPress-Admin/apps/web/src/components/editor/structured/HeroSectionEditor.tsx`:

```typescript
/**
 * HeroSectionEditor - Hero section form fields
 *
 * Renders inputs for the hero section: title, subtitle, content,
 * image (with inline MediaPicker), video URL, CTA text, and CTA URL.
 */

import { useCallback, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionField } from "./SectionField";
import { MediaPicker } from "../MediaPicker";
import type { HeroFields } from "@/types/editor";

interface HeroSectionEditorProps {
  value: HeroFields;
  onChange: (hero: HeroFields) => void;
}

export function HeroSectionEditor({ value, onChange }: HeroSectionEditorProps) {
  const [showPicker, setShowPicker] = useState(false);

  const update = useCallback(
    (field: keyof HeroFields, val: string | null) => {
      onChange({ ...value, [field]: val });
    },
    [value, onChange],
  );

  // Fetch the hero image data when an imageId is set
  const mediaItem = useQuery(
    api.media.queries.get,
    value.imageId ? { mediaId: value.imageId as Id<"media"> } : "skip",
  );

  const imageUrl = mediaItem?.url ?? null;
  const hasImage = !!value.imageId;
  const isLoadingImage = !!value.imageId && mediaItem === undefined;

  return (
    <div className="space-y-3">
      <SectionField label="Hero Title">
        <input
          type="text"
          value={value.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Main headline..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <SectionField label="Hero Subtitle">
        <input
          type="text"
          value={value.subtitle}
          onChange={(e) => update("subtitle", e.target.value)}
          placeholder="Supporting tagline..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <SectionField label="Hero Content">
        <textarea
          value={value.content}
          onChange={(e) => update("content", e.target.value)}
          placeholder="Hero body text..."
          rows={4}
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors resize-y"
        />
      </SectionField>

      {/* ── Hero Image ──────────────────────────────────────────── */}
      <SectionField label="Hero Image">
        <div>
          {hasImage ? (
            <div className="space-y-2">
              {/* Thumbnail preview */}
              <div className="border border-border bg-muted/30 relative">
                {isLoadingImage ? (
                  <div className="w-full h-32 animate-pulse bg-muted" />
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Hero image"
                    className="w-full h-40 object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                    Image not found
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Change image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    update("imageId", null);
                    setShowPicker(false);
                  }}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove image
                </button>
              </div>
            </div>
          ) : (
            <div>
              {!showPicker && (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className={cn(
                    "w-full flex flex-col items-center justify-center gap-2 py-4",
                    "border border-dashed border-border",
                    "text-muted-foreground hover:text-foreground hover:border-foreground/30",
                    "transition-colors cursor-pointer",
                  )}
                >
                  <ImageIcon className="size-6 opacity-50" />
                  <span className="text-xs">Select Hero Image</span>
                </button>
              )}
            </div>
          )}

          {/* Inline MediaPicker */}
          {showPicker && (
            <div className="mt-2">
              <MediaPicker
                onSelect={(mediaId) => {
                  update("imageId", mediaId);
                  setShowPicker(false);
                }}
                onClose={() => setShowPicker(false)}
                selectedId={value.imageId ?? undefined}
                filterType="image"
              />
            </div>
          )}
        </div>
      </SectionField>

      <SectionField label="Hero Video URL">
        <input
          type="url"
          value={value.videoUrl}
          onChange={(e) => update("videoUrl", e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <div className="grid grid-cols-2 gap-3">
        <SectionField label="CTA Text">
          <input
            type="text"
            value={value.ctaText}
            onChange={(e) => update("ctaText", e.target.value)}
            placeholder="Learn More"
            className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
          />
        </SectionField>

        <SectionField label="CTA URL">
          <input
            type="url"
            value={value.ctaUrl}
            onChange={(e) => update("ctaUrl", e.target.value)}
            placeholder="/contact"
            className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
          />
        </SectionField>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/editor/structured/HeroSectionEditor.tsx
git commit -m "feat(editor): add inline image picker with thumbnail preview to HeroSectionEditor"
```

---

## Task 9: Add Image Picker to TopicSectionEditor

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/components/editor/structured/TopicSectionEditor.tsx`

Same pattern as Task 8 but for each individual topic section.

- [ ] **Step 1: Add image picker with thumbnail preview to TopicSectionEditor**

Replace the entire contents of `ConvexPress-Admin/apps/web/src/components/editor/structured/TopicSectionEditor.tsx`:

```typescript
/**
 * TopicSectionEditor - Single topic form fields
 *
 * Renders inputs for one topic: title, subtitle, content,
 * image (with inline MediaPicker), video URL.
 * Includes a remove button and optional regenerate button.
 */

import { useCallback, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { ImageIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionField } from "./SectionField";
import { RegenerateButton } from "./RegenerateButton";
import { MediaPicker } from "../MediaPicker";
import type { TopicFields } from "@/types/editor";

interface TopicSectionEditorProps {
  index: number;
  value: TopicFields;
  onChange: (topic: TopicFields) => void;
  onRemove: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function TopicSectionEditor({
  index,
  value,
  onChange,
  onRemove,
  onRegenerate,
  isRegenerating,
}: TopicSectionEditorProps) {
  const [showPicker, setShowPicker] = useState(false);

  const update = useCallback(
    (field: keyof TopicFields, val: string | null) => {
      onChange({ ...value, [field]: val });
    },
    [value, onChange],
  );

  // Fetch the topic image data when an imageId is set
  const mediaItem = useQuery(
    api.media.queries.get,
    value.imageId ? { mediaId: value.imageId as Id<"media"> } : "skip",
  );

  const imageUrl = mediaItem?.url ?? null;
  const hasImage = !!value.imageId;
  const isLoadingImage = !!value.imageId && mediaItem === undefined;

  return (
    <div className="border border-border/50 bg-muted/20 p-3 space-y-3">
      {/* Topic header with number, regenerate, and remove */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Topic {index + 1}
        </span>
        <div className="flex items-center gap-1.5">
          {onRegenerate && (
            <RegenerateButton
              onClick={onRegenerate}
              isLoading={isRegenerating}
              label="Regenerate"
            />
          )}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            title="Remove topic"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <SectionField label="Title">
        <input
          type="text"
          value={value.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder={`Topic ${index + 1} title...`}
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <SectionField label="Subtitle">
        <input
          type="text"
          value={value.subtitle}
          onChange={(e) => update("subtitle", e.target.value)}
          placeholder="Brief subtitle..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <SectionField label="Content">
        <textarea
          value={value.content}
          onChange={(e) => update("content", e.target.value)}
          placeholder="Topic content..."
          rows={4}
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors resize-y"
        />
      </SectionField>

      {/* ── Topic Image ─────────────────────────────────────────── */}
      <SectionField label="Topic Image">
        <div>
          {hasImage ? (
            <div className="space-y-2">
              {/* Thumbnail preview */}
              <div className="border border-border bg-muted/30 relative">
                {isLoadingImage ? (
                  <div className="w-full h-28 animate-pulse bg-muted" />
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={`Topic ${index + 1} image`}
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-28 text-muted-foreground text-xs">
                    Image not found
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Change image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    update("imageId", null);
                    setShowPicker(false);
                  }}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove image
                </button>
              </div>
            </div>
          ) : (
            <div>
              {!showPicker && (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className={cn(
                    "w-full flex flex-col items-center justify-center gap-2 py-3",
                    "border border-dashed border-border",
                    "text-muted-foreground hover:text-foreground hover:border-foreground/30",
                    "transition-colors cursor-pointer",
                  )}
                >
                  <ImageIcon className="size-5 opacity-50" />
                  <span className="text-xs">Select Topic Image</span>
                </button>
              )}
            </div>
          )}

          {/* Inline MediaPicker */}
          {showPicker && (
            <div className="mt-2">
              <MediaPicker
                onSelect={(mediaId) => {
                  update("imageId", mediaId);
                  setShowPicker(false);
                }}
                onClose={() => setShowPicker(false)}
                selectedId={value.imageId ?? undefined}
                filterType="image"
              />
            </div>
          )}
        </div>
      </SectionField>

      <SectionField label="Video URL">
        <input
          type="url"
          value={value.videoUrl}
          onChange={(e) => update("videoUrl", e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/editor/structured/TopicSectionEditor.tsx
git commit -m "feat(editor): add inline image picker with thumbnail preview to TopicSectionEditor"
```

---

## Task 10: Update CLAUDE.md Expert Registry

**Files:**
- Modify: `ConvexPress-Admin/../.claude/CLAUDE.md` (project root `.claude/CLAUDE.md`)

Add the Tabbed Editor Shell expert to the Expert Registry and the AI Content Generation expert (if not already present), and update the dispatch quick reference.

- [ ] **Step 1: Add Tabbed Editor Shell expert to the Admin UI Experts table**

In `.claude/CLAUDE.md`, find the Admin UI Experts table and add a row for the Tabbed Editor Shell expert:

Find:
```markdown
| 32 | Admin Settings & Forms UI Expert | `/experts:admin-settings-ui` | Complete | `.claude/docs/ADMIN-SETTINGS-UI.md` |
```

Replace with:
```markdown
| 32 | Admin Settings & Forms UI Expert | `/experts:admin-settings-ui` | Complete | `.claude/docs/ADMIN-SETTINGS-UI.md` |
| 33 | Tabbed Editor Shell Expert | `/experts:tabbed-editor-shell` | Complete | `.claude/docs/TABBED-EDITOR-SHELL.md` |
```

Then renumber the Website UI Experts that follow (33 -> 34, 34 -> 35, 35 -> 36, 36 -> 37):

Find:
```markdown
#### Website UI Experts (4)

| # | Expert | Slash Command | Status | Knowledge Doc |
|---|--------|---------------|--------|---------------|
| 33 | Website Layout & Navigation UI Expert | `/experts:website-layout-ui` | Complete | `.claude/docs/WEBSITE-LAYOUT-UI.md` |
| 34 | Website Blog & Content UI Expert | `/experts:website-blog-ui` | Complete | `.claude/docs/WEBSITE-BLOG-UI.md` |
| 35 | Website Auth Pages UI Expert | `/experts:website-auth-ui` | Complete | `.claude/docs/WEBSITE-AUTH-UI.md` |
| 36 | Website User Dashboard UI Expert | `/experts:website-dashboard-ui` | Complete | `.claude/docs/WEBSITE-DASHBOARD-UI.md` |
```

Replace with:
```markdown
#### Website UI Experts (4)

| # | Expert | Slash Command | Status | Knowledge Doc |
|---|--------|---------------|--------|---------------|
| 34 | Website Layout & Navigation UI Expert | `/experts:website-layout-ui` | Complete | `.claude/docs/WEBSITE-LAYOUT-UI.md` |
| 35 | Website Blog & Content UI Expert | `/experts:website-blog-ui` | Complete | `.claude/docs/WEBSITE-BLOG-UI.md` |
| 36 | Website Auth Pages UI Expert | `/experts:website-auth-ui` | Complete | `.claude/docs/WEBSITE-AUTH-UI.md` |
| 37 | Website User Dashboard UI Expert | `/experts:website-dashboard-ui` | Complete | `.claude/docs/WEBSITE-DASHBOARD-UI.md` |
```

Update the Infrastructure Expert numbering (37 -> 38):

Find:
```markdown
| 37 | Convex Deployment Expert | `/experts:convex-deployment` | Complete | `.claude/docs/CONVEX-DEPLOYMENT.md` |
```

Replace with:
```markdown
| 38 | Convex Deployment Expert | `/experts:convex-deployment` | Complete | `.claude/docs/CONVEX-DEPLOYMENT.md` |
```

Update the Meta Expert numbering (38 -> 39):

Find:
```markdown
| 38 | UI Expert Builder | `/experts:ui-expert-builder` | Complete |
```

Replace with:
```markdown
| 39 | UI Expert Builder | `/experts:ui-expert-builder` | Complete |
```

Update the total count in the heading from "37 Total" to "38 Total":

Find:
```markdown
### Full Expert Registry (37 Total)
```

Replace with:
```markdown
### Full Expert Registry (38 Total)
```

Update Admin UI Experts count from (4) to (5):

Find:
```markdown
#### Admin UI Experts (4)
```

Replace with:
```markdown
#### Admin UI Experts (5)
```

- [ ] **Step 2: Add tabbed editor shell to dispatch quick reference**

In the dispatch quick reference table, find:

```markdown
| Editor UI, block editor, metaboxes | `admin-editor-ui`, `content-editor-system` |
```

Replace with:

```markdown
| Editor UI, block editor, metaboxes | `admin-editor-ui`, `content-editor-system` |
| Tabbed editor shell, tab badges, editor layout routes | `tabbed-editor-shell` |
```

- [ ] **Step 3: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs: add Tabbed Editor Shell expert to registry and dispatch table"
```

---

## Summary of Files Created/Modified

### New Files (18 total)
| File | Purpose |
|------|---------|
| `components/editor/PostDetailLayout.tsx` | Shared layout with tab bar, header, outlet |
| `routes/.../posts/$postId.tsx` | Post layout route (redirect to /edit) |
| `routes/.../pages/$pageId.tsx` | Page layout route (redirect to /edit) |
| `components/seo/SeoDashboardTab.tsx` | Full-page SEO dashboard component |
| `routes/.../posts/$postId/seo.tsx` | Post SEO route config |
| `routes/.../posts/$postId/seo.lazy.tsx` | Post SEO lazy component |
| `routes/.../pages/$pageId/seo.tsx` | Page SEO route config |
| `routes/.../pages/$pageId/seo.lazy.tsx` | Page SEO lazy component |
| `components/editor/TrafficTabPlaceholder.tsx` | Traffic tab placeholder |
| `routes/.../posts/$postId/traffic.tsx` | Post traffic route config |
| `routes/.../posts/$postId/traffic.lazy.tsx` | Post traffic lazy component |
| `routes/.../pages/$pageId/traffic.tsx` | Page traffic route config |
| `routes/.../pages/$pageId/traffic.lazy.tsx` | Page traffic lazy component |
| `components/editor/EngagementTabPlaceholder.tsx` | Engagement tab placeholder |
| `routes/.../posts/$postId/engagement.tsx` | Post engagement route config |
| `routes/.../posts/$postId/engagement.lazy.tsx` | Post engagement lazy component |
| `routes/.../pages/$pageId/engagement.tsx` | Page engagement route config |
| `routes/.../pages/$pageId/engagement.lazy.tsx` | Page engagement lazy component |

### Modified Files (3 total)
| File | Change |
|------|--------|
| `components/editor/structured/HeroSectionEditor.tsx` | Added inline MediaPicker + thumbnail |
| `components/editor/structured/TopicSectionEditor.tsx` | Added inline MediaPicker + thumbnail |
| `.claude/CLAUDE.md` | Added Tabbed Editor Shell expert to registry |

### Unchanged Files (kept as-is)
| File | Reason |
|------|--------|
| `routes/.../posts/$postId/edit.tsx` | No changes needed (path still correct) |
| `routes/.../posts/$postId/edit.lazy.tsx` | No changes needed (self-contained data loading) |
| `routes/.../pages/$pageId/edit.tsx` | No changes needed |
| `routes/.../pages/$pageId/edit.lazy.tsx` | No changes needed |
| `routes/.../posts/$postId/revisions.tsx` | No changes needed (works in layout) |
| `routes/.../pages/$pageId/revisions.tsx` | No changes needed |

### Known Follow-up Items (NOT in scope for this plan)
1. **Deduplicate data loading** -- The parent layout and child edit routes both query post data. Convex deduplicates the subscription, but a future refactor could pass data via outlet context to eliminate the redundant query setup.
2. **Remove EditorHeader duplication** -- The edit route's `EditorHeader` shows a title bar that overlaps with the `PostDetailLayout` header. A cleanup pass should slim down `EditorHeader` to remove the duplicated post title and status badge.
3. **Wire live Traffic/Engagement badges** -- The tab bar shows `--` placeholders for traffic and engagement. When the Analytics System ships, update `PostDetailLayout` to query real data.
4. **Revisions tab styling** -- The revisions page renders inside the tab shell but has no active tab indicator. Consider adding a "Revisions" tab or a breadcrumb link.
