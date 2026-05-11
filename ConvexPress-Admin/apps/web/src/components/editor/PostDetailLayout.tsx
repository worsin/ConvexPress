/**
 * PostDetailLayout - Tabbed layout wrapper for post/page detail views.
 *
 * Loads post data once at the layout level, renders a tab bar with
 * Content/SEO/Traffic/Engagement tabs, and passes data to child routes
 * via React context (TanStack Router's Outlet does not support context props).
 */

import { createContext, useContext, useMemo } from "react";
import { Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
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

/** Data passed to child routes via React context */
export interface PostDetailContext {
  contentType: ContentType;
  postId: string;
  post: Record<string, unknown>;
  postSeo: ReturnType<typeof usePostSeo>;
}

/** React context for PostDetailLayout outlet data */
const PostDetailCtx = createContext<PostDetailContext | null>(null);

/** Hook for child routes to consume PostDetailLayout context */
export function usePostDetailContext(): PostDetailContext {
  const ctx = useContext(PostDetailCtx);
  if (!ctx) {
    throw new Error(
      "usePostDetailContext must be used within a PostDetailLayout",
    );
  }
  return ctx;
}

interface TabDef {
  id: string;
  label: string;
  icon: typeof FileText;
  path: string;
  badge?: React.ReactNode;
}

export function PostDetailLayout({ contentType }: PostDetailLayoutProps) {
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

  // Use separate queries for posts and pages to maintain type safety.
  // Only one will be active at a time; the other is skipped.
  const postData = useQuery(
    api.posts.queries.get,
    contentType === "post" ? { postId: postId as Id<"posts"> } : "skip",
  );
  const pageData = useQuery(
    api.pages.queries.get,
    contentType === "page" ? { pageId: postId as Id<"posts"> } : "skip",
  );

  const post = contentType === "post" ? postData : pageData;

  const postSeo = usePostSeo(postId as Id<"posts">);

  const basePath = contentType === "post"
    ? `/posts/${postId}`
    : `/pages/${postId}`;

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

  const lastSaved = post._creationTime
    ? new Date(post._creationTime).toLocaleString()
    : null;

  const outletContext: PostDetailContext = {
    contentType,
    postId,
    post: post as Record<string, unknown>,
    postSeo,
  };

  return (
    <PostDetailCtx.Provider value={outletContext}>
      <div className="space-y-0">
        {/* Header bar */}
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

        {/* Tab navigation bar */}
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
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Child route content */}
        <div className="pt-4">
          <Outlet />
        </div>
      </div>
    </PostDetailCtx.Provider>
  );
}

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
