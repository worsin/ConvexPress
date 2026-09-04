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
	loader: async ({ context: { queryClient } }) => {
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
  const { data: frontPage } = useTanStackQuery(frontPageQuery);
  const { data: latestPosts } = useTanStackQuery({
    ...latestPostsQuery,
    enabled: frontPage === null,
  });

  // Map the configured front page to the Page System's PageDetail shape.
  const page: PageDetail | null | undefined = frontPage
    ? {
        _id: frontPage._id,
        title: frontPage.title,
        slug: frontPage.slug,
        path: frontPage.path ?? "/",
        content: frontPage.content ? (frontPage.content as BlockDocument) : null,
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

  return <Surface name="home" data={{ frontPage: page, latestPosts: posts }} fallback={CoreHome} />;
}
