import { canonicalPaginationSearch } from "@/templates/sdk/block-public/pagination-search";
import { loadAnonymousCanonical } from "@/templates/sdk/block-public/anonymous-loader";
import { PublicCanonicalScope } from "@/templates/sdk/block-public/PublicCanonicalBody";
import { parseTipTapDocument } from "@/lib/schemas/content";
/**
 * Home Page Route - /_marketing/
 *
 * Supports two modes based on Reading Settings:
 *   1. Static Front Page: If settings have `showOnFront: "page"` and a designated
 *      `pageOnFront`, renders that page through the `page` surface.
 *   2. Default: Shows a real visitor-facing latest-posts home when no front
 *      page has been configured yet.
 *
 * The `getFrontPage` query handles all settings lookup internally. Rendering
 * belongs to the `home` surface of the active template pack.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { useAuth } from "@/lib/auth/clerk";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import CorePasswordGate from "@/templates/packs/core/surfaces/system.passwordGate";
import CoreRestricted from "@/templates/packs/core/surfaces/system.restricted";

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import type { PageDetail, BlockDocument } from "@/lib/blog/types";
import { buildIndexablePageHead } from "@/lib/seo/head";
import CoreHome, { type HomeLatestPost } from "@/templates/packs/core/surfaces/home";
import { Surface } from "@/templates/sdk/Surface";

const frontPageQuery = convexQuery(api.pages.queries.getFrontPage, {});
const latestPostsQuery = convexQuery(api.posts.queries.listPublished, {
  page: 1,
  perPage: 6,
});

export const Route = createFileRoute("/_marketing/")({
  validateSearch: canonicalPaginationSearch,
  loaderDeps: ({ search }) => ({ request: search.blockPages }),
	loader: async ({ context: { queryClient }, deps }) => {
		// Shops land visitors on the catalog (Reading settings → "The shop").
		const publicSettings = (await queryClient.ensureQueryData(
			convexQuery(api.settings.queries.getPublic, {}),
		)) as { homepageDisplays?: string; siteTitle?: string } | null;
		if (publicSettings?.homepageDisplays === "shop") {
			throw redirect({ to: "/products" });
		}
		const siteTitle = publicSettings?.siteTitle || "ConvexPress";
		const frontPage = await queryClient.ensureQueryData(frontPageQuery);
		if (!frontPage) {
			await queryClient.ensureQueryData(latestPostsQuery);
		}

		return {
      canonical: await loadAnonymousCanonical(frontPage, deps.request),
			seoHead: buildIndexablePageHead({
				title: frontPage?.title
					? `${frontPage.title} – ${siteTitle}`
					: siteTitle,
				description:
					frontPage?.excerpt ??
					`Read the latest published articles from ${siteTitle}.`,
				path: "/",
			}),
		};
	},
	head: ({ loaderData }) => loaderData?.seoHead ?? {},
	component: HomeComponent,
});

function HomeComponent() {
  const {canonical} = Route.useLoaderData();
  const {blockPages: request} = Route.useSearch();
  const { data: rawFrontPage } = useTanStackQuery(frontPageQuery);
  const { isSignedIn } = useAuth();
  const [attempt, setAttempt] = useState<{ pageId: string; password: string } | null>(null);
  const submitted = attempt?.pageId === rawFrontPage?._id ? attempt : null;
  const verifiedPage = useQuery(api.pages.queries.verifyPassword,
    rawFrontPage?.isPasswordProtected && submitted
      ? { pageId: rawFrontPage._id as Id<"posts">, password: submitted.password }
      : "skip");
  const frontPage = verifiedPage ?? rawFrontPage;
  const { data: latestPosts } = useTanStackQuery({
    ...latestPostsQuery,
    enabled: frontPage === null,
  });

  if (rawFrontPage?.isPasswordProtected && !verifiedPage) {
    return <Surface name="system.passwordGate" data={{
      kind: "page", title: rawFrontPage.title,
      onSubmit: (password: string) => setAttempt({ pageId: rawFrontPage._id, password }),
      isVerifying: !!submitted && verifiedPage === undefined,
      error: submitted && verifiedPage === null ? "Incorrect password. Please try again." : undefined,
    }} fallback={CorePasswordGate} />;
  }
  if (frontPage?.isMembershipRestricted && frontPage.membershipAccess) {
    const access = frontPage.membershipAccess;
    return <Surface name="system.restricted" data={{
      title: frontPage.title, mode: access.teaserMode ?? "hide", rule: access,
      excerpt: frontPage.excerpt, userState: isSignedIn ? "logged_in_non_member" : "logged_out",
    }} fallback={CoreRestricted} />;
  }

  // Map the configured front page to the Page System's PageDetail shape.
  const page: PageDetail | null | undefined = frontPage
    ? {
        _id: frontPage._id,
        title: frontPage.title,
        excerpt: frontPage.excerpt,
        featuredImageUrl: (frontPage as { featuredImageUrl?: string }).featuredImageUrl,
        featuredImageAlt: (frontPage as { featuredImageAlt?: string }).featuredImageAlt,
        slug: frontPage.slug,
        path: frontPage.path ?? "/",
        content: frontPage.content ? (parseTipTapDocument(frontPage.content) as BlockDocument | null) : null,
        template: (frontPage.pageTemplate as PageDetail["template"]) ?? "full-width",
        contentMode: (frontPage as { contentMode?: PageDetail["contentMode"] }).contentMode,
        blocks: (frontPage as { blocks?: PageDetail["blocks"] }).blocks,
        blocksVersion: (frontPage as { blocksVersion?: number }).blocksVersion,
        blocksRevision: (frontPage as { blocksRevision?: number }).blocksRevision,
        parentId: frontPage.parentId as string | undefined,
        isPasswordProtected: false,
      }
    : frontPage;

  const posts: HomeLatestPost[] | undefined = latestPosts
    ? (latestPosts.posts ?? []).map((post: HomeLatestPost) => ({
        _id: post._id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        publishedAt: post.publishedAt,
      }))
    : undefined;

  return <PublicCanonicalScope request={request} documentId={page?._id ?? ""} initial={canonical} password={submitted?.password}><Surface name="home" data={{ frontPage: page, latestPosts: posts }} fallback={CoreHome} /></PublicCanonicalScope>;
}
