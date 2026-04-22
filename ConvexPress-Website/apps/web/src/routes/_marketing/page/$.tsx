/**
 * Single Page Route - /_marketing/page/$
 *
 * Splat route that handles both flat and hierarchical page paths:
 *   /page/about           -> slug "about", path "/about"
 *   /page/services        -> slug "services", path "/services"
 *   /page/services/web-design -> path "/services/web-design"
 *
 * Uses the Convex `pages.queries.getByPath` query for path-based lookups
 * (supports hierarchical pages) and falls back to `pages.queries.get`
 * with slug for single-segment paths.
 *
 * Supports:
 *   - Template-based rendering via PageRenderer
 *   - Password-protected pages via PagePasswordForm
 *   - Breadcrumb navigation for hierarchical pages
 *   - SEO meta tags from page data
 *
 * Pages are fetched from the shared `posts` table with `type: "page"`.
 */

import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

import { parseTipTapDocument } from "@/lib/schemas/content";
import { extractPlainText } from "@/lib/blog/renderContent";
import type { PageDetail, BlockContent } from "@/lib/blog/types";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PageRenderer } from "@/components/pages/PageRenderer";
import { PagePasswordForm } from "@/components/pages/PagePasswordForm";
import {
  RestrictedContent,
  type RestrictedTeaserMode,
} from "@/components/membership/RestrictedContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { usePageOverrides } from "@/contexts/PageOverridesContext";

export const Route = createFileRoute("/_marketing/page/$")({
  component: SinglePage,
  loader: async ({ context: { queryClient }, params }) => {
    // Extract the full path from the splat param (mirrors component logic).
    const splatPath = params._splat ?? "";
    const segments = splatPath.split("/").filter(Boolean);
    const pagePath = `/${segments.join("/")}`;
    const isSingleSegment = segments.length === 1;
    const slug = isSingleSegment ? segments[0] : undefined;

    // Prefetch page lookup so SSR has data ready.
    const pageByPath = await queryClient.ensureQueryData(
      convexQuery(api.pages.queries.getByPath, { path: pagePath }),
    );
    const pageBySlug =
      isSingleSegment && slug
        ? await queryClient.ensureQueryData(
            convexQuery(api.pages.queries.get, { slug }),
          )
        : null;
    const page = pageByPath ?? pageBySlug;

    // Prefetch the membership access decision. Same pattern as blog/$slug.
    if (page && typeof page === "object" && "_id" in page && page._id) {
      await queryClient.ensureQueryData(
        convexQuery(api.membership.queries.checkAccess, {
          resourceType: "page",
          resourceIdOrKey: page._id as string,
        }),
      );
    }
  },
  head: ({ params }) => {
    // Extract a human-readable title from the splat path
    const splatPath = params._splat ?? "";
    const segments = splatPath.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] ?? "Page";
    const displayTitle = lastSegment
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return {
      meta: [{ title: `${displayTitle} - ConvexPress` }],
    };
  },
});

function SinglePage() {
  const params = Route.useParams();
  const { isSignedIn } = useAuth();

  // ── All hooks called unconditionally at the top ──────────────────────
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submittedPassword, setSubmittedPassword] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const { setOverrides } = usePageOverrides();

  // Extract the full path from the splat param
  const splatPath = params._splat ?? "";
  const segments = splatPath.split("/").filter(Boolean);

  // Build the page path for lookup (e.g., "/services/web-design")
  const pagePath = `/${segments.join("/")}`;

  // For single-segment paths, we can also use the slug directly
  const isSingleSegment = segments.length === 1;
  const slug = isSingleSegment ? segments[0] : undefined;

  // Primary lookup: use getByPath for hierarchical path resolution
  const rawPageByPath = useQuery(api.pages.queries.getByPath, { path: pagePath });

  // Fallback: use get with slug for single-segment pages (richer response with children)
  const rawPageBySlug = useQuery(
    api.pages.queries.get,
    isSingleSegment && slug ? { slug } : "skip",
  );

  // Use path-based result preferentially; fall back to slug-based for single segments
  const rawPage = rawPageByPath ?? rawPageBySlug;

  // Propagate per-page layout overrides (hideHeader/hideFooter) to parent layout
  useEffect(() => {
    if (rawPage && "_id" in rawPage) {
      const page = rawPage as Record<string, unknown>;
      setOverrides({
        hideHeader: (page.hideHeader as boolean) ?? false,
        hideFooter: (page.hideFooter as boolean) ?? false,
        layoutId: (page.layoutId as string) ?? undefined,
      });
    }
    return () => setOverrides({});
  }, [
    rawPage && "_id" in rawPage ? (rawPage as Record<string, unknown>).hideHeader : undefined,
    rawPage && "_id" in rawPage ? (rawPage as Record<string, unknown>).hideFooter : undefined,
    rawPage && "_id" in rawPage ? (rawPage as Record<string, unknown>).layoutId : undefined,
    setOverrides,
  ]);

  // Fetch breadcrumbs if we have a page ID
  const pageId = rawPage && "_id" in rawPage ? rawPage._id : undefined;
  const breadcrumbs = useQuery(
    api.pages.queries.getBreadcrumbs,
    pageId ? { pageId: pageId as Id<"posts"> } : "skip",
  );

  // Fetch children for pages resolved via getByPath (which doesn't include children)
  // The `get` query already includes children, so we only need this for multi-segment paths
  const childPages = useQuery(
    api.pages.queries.getChildren,
    !isSingleSegment && pageId
      ? { pageId: pageId as Id<"posts">, status: "publish" as const }
      : "skip",
  );

  // Membership access check — skip until we know the page id. Backend
  // short-circuits with `reason: "plugin_disabled"` when the membership
  // plugin is off; we treat that as unrestricted (see gate logic below).
  const access = useQuery(
    api.membership.queries.checkAccess,
    pageId
      ? {
          resourceType: "page" as const,
          resourceIdOrKey: pageId as string,
        }
      : "skip",
  );

  // Password verification query (skipped until password is submitted)
  const isPasswordProtected = rawPage && "isPasswordProtected" in rawPage && rawPage.isPasswordProtected;
  const verifiedPage = useQuery(
    api.pages.queries.verifyPassword,
    isPasswordProtected && submittedPassword
      ? { pageId: rawPage._id as Id<"posts">, password: submittedPassword }
      : "skip",
  );

  // Handle password verification result via useEffect to avoid setState during render
  useEffect(() => {
    if (isPasswordProtected && submittedPassword && verifiedPage !== undefined) {
      if (verifiedPage === null && isVerifying) {
        setIsVerifying(false);
        setPasswordError("Incorrect password. Please try again.");
      } else if (verifiedPage !== null && isVerifying) {
        setIsVerifying(false);
      }
    }
  }, [isPasswordProtected, submittedPassword, verifiedPage, isVerifying]);

  // ── Render logic (conditional returns are safe after all hooks) ──────

  // Loading state (Convex returns undefined while loading)
  if (rawPageByPath === undefined) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-3/4" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
    );
  }

  // Not found
  if (rawPage === null) {
    return <NotFoundPage />;
  }

  // Password-protected page: show password form until verified
  if (isPasswordProtected) {
    if (!verifiedPage) {
      return (
        <PagePasswordForm
          pageTitle={rawPage.title}
          onSubmit={(password: string) => {
            setPasswordError(null);
            setIsVerifying(true);
            setSubmittedPassword(password);
          }}
          isLoading={isVerifying && verifiedPage === undefined}
          error={passwordError ?? undefined}
        />
      );
    }
  }

  if (!rawPage) {
    return <NotFoundPage />;
  }

  // Use verified page data when password-protected page has been unlocked
  const resolvedPage = verifiedPage ?? rawPage;

  // Extract children: from `get` query (single-segment) or `getChildren` (multi-segment)
  const children = isSingleSegment
    ? rawPageBySlug && "children" in rawPageBySlug
      ? rawPageBySlug.children?.map((c: NonNullable<typeof rawPageBySlug.children>[number]) => ({
          _id: c._id,
          title: c.title,
          slug: c.slug,
          path: c.path ?? `/${c.slug}`,
        }))
      : []
    : childPages?.map((c: NonNullable<typeof childPages>[number]) => ({
        _id: c._id,
        title: c.title,
        slug: c.slug,
        path: c.path ?? `/${c.slug}`,
      })) ?? [];


  // Parse content from JSON string to BlockDocument object using Zod validation
  const rawParsed = resolvedPage.content
    ? parseTipTapDocument(resolvedPage.content)
    : null;
  // Coerce TipTapDocument (optional content) to BlockDocument (required content)
  const parsedContent = rawParsed
    ? { type: rawParsed.type as "doc", content: (rawParsed.content ?? []) as BlockContent[] }
    : null;











  // Map Convex document to PageDetail shape
  const page: PageDetail = {
    _id: resolvedPage._id,
    title: resolvedPage.title,
    slug: resolvedPage.slug,
    path: resolvedPage.path ?? pagePath,
    content: parsedContent,
    featuredImageUrl: (resolvedPage as { featuredImageUrl?: string }).featuredImageUrl ?? undefined,
    featuredImageAlt: (resolvedPage as { featuredImageAlt?: string }).featuredImageAlt ?? undefined,
    template: (resolvedPage.pageTemplate as PageDetail["template"]) ?? "default",
    parentId: resolvedPage.parentId as string | undefined,
    menuOrder: ("menuOrder" in resolvedPage ? resolvedPage.menuOrder : undefined) as
      | number
      | undefined,
    depth: ("depth" in resolvedPage ? resolvedPage.depth : undefined) as
      | number
      | undefined,
    isPasswordProtected: false,
    breadcrumbs: breadcrumbs ?? [],
    children: children ?? [],
  };

  // Membership gate: if the access check returned denied and the plugin is
  // enabled, render a restricted view instead of the full page template.
  // The page header (title + featured image handled inside PageContent) is
  // replaced with a lightweight header so the title still appears.
  const isAccessRestricted = Boolean(
    access && access.allowed === false && access.reason !== "plugin_disabled",
  );
  if (isAccessRestricted && access) {
    const teaserMode =
      (access.teaserMode as RestrictedTeaserMode | null | undefined) ?? "hide";
    const restrictedExcerpt =
      teaserMode === "excerpt"
        ? extractPlainText(resolvedPage.content).slice(0, 400)
        : undefined;

    return (
      <div
        data-slot="restricted-page"
        className="mx-auto flex max-w-3xl flex-col gap-6 px-4"
      >
        <h1 className="text-lg font-bold leading-tight md:text-xl">
          {page.title}
        </h1>
        <RestrictedContent
          mode={teaserMode}
          rule={{
            teaserMode: access.teaserMode as RestrictedTeaserMode | null,
            customMessage: access.customMessage,
            matchingPlanIds: access.matchingPlanIds as Id<"membership_plans">[] | null,
          }}
          excerpt={restrictedExcerpt}
          userState={isSignedIn ? "logged_in_non_member" : "logged_out"}
        />
      </div>
    );
  }

  return <PageRenderer page={page} />;
}
