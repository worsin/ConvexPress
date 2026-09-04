import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { useSetting } from "@/contexts/SettingsContext";
import type { PaginationData, PostCard as PostCardType } from "@/lib/blog/types";
import { estimateReadingTime, extractPlainText } from "@/lib/blog/renderContent";
import { PostCardSkeletonGrid } from "@/components/blog/PostCardSkeleton";
import { buildSeoHead, siteTitled } from "@/lib/seo/head";
import CoreBlogIndex from "@/templates/packs/core/surfaces/blog.index";
import { Surface } from "@/templates/sdk/Surface";

// PostCardSkeletonGrid is used as the pending component during SSR loader

interface BlogSearchParams {
  page?: number;
}

export const Route = createFileRoute("/_marketing/blog/")({
  component: BlogIndex,
  pendingComponent: () => <PostCardSkeletonGrid count={6} />,
  validateSearch: (search: Record<string, unknown>): BlogSearchParams => ({
    page: Number(search.page) || 1,
  }),
  loaderDeps: ({ search: { page } }) => ({ page: page ?? 1 }),
  loader: async ({ context: { queryClient }, deps: { page } }) => {
    await queryClient.ensureQueryData(
      convexQuery(api.posts.queries.listPublished, {
        page,
        perPage: 10,
      }),
    );
    return {
      seoHead: buildSeoHead({
        title: siteTitled("Blog"),
        description: "Read the latest articles, tutorials, and insights from ConvexPress.",
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
});

function BlogIndex() {
  const { page } = Route.useSearch();
  const postsPerPage = useSetting("postsPerPage") ?? 10;

  // SSR-compatible: data is pre-fetched in the loader via ensureQueryData.
  // useSuspenseQuery suspends until data is ready (no undefined state).
  const { data: postsData } = useSuspenseQuery(
    // @ts-expect-error - Convex query type mismatch with useSuspenseQuery
    convexQuery(api.posts.queries.listPublished, {
      page: page ?? 1,
      perPage: postsPerPage,
    }),
  );

  // Map Convex response to PostCard type expected by components
  const posts: PostCardType[] = (postsData?.posts ?? []).map((post: NonNullable<NonNullable<typeof postsData>['posts']>[number]) => ({
    _id: post._id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt || generateExcerpt(post.content),
    featuredImageUrl: post.featuredImageUrl ?? undefined,
    featuredImageAlt: post.featuredImageAlt ?? undefined,
    publishedAt: post.publishedAt
      ? new Date(post.publishedAt).toISOString()
      : undefined,
    author: {
      _id: post.author?._id ?? "",
      displayName: post.author?.displayName ?? "Unknown",
      slug: post.author?.slug ?? "unknown",
      avatarUrl: post.author?.avatarUrl,
    },
    primaryCategory: post.primaryCategory
      ? {
          _id: post.primaryCategory._id,
          name: post.primaryCategory.name,
          slug: post.primaryCategory.slug,
        }
      : undefined,
    commentCount: post.commentCount ?? 0,
    isSticky: post.isSticky ?? false,
    readingTime: estimateReadingTime(post.content),
  }));

  const pagination: PaginationData = {
    currentPage: postsData?.page ?? 1,
    totalPages: postsData?.totalPages ?? 1,
    totalItems: postsData?.total ?? 0,
    perPage: postsData?.perPage ?? postsPerPage,
    hasNextPage: (postsData?.page ?? 1) < (postsData?.totalPages ?? 1),
    hasPreviousPage: (postsData?.page ?? 1) > 1,
  };

  return (
    <Surface
      name="blog.index"
      data={{ posts, pagination, page: page ?? 1 }}
      fallback={CoreBlogIndex}
    />
  );
}

/**
 * Generate an excerpt from block editor content (first 150 chars of plain text).
 */
function generateExcerpt(content: string | undefined | null): string | undefined {
  if (!content) return undefined;
  const plainText = extractPlainText(content);
  if (!plainText) return undefined;
  if (plainText.length <= 150) return plainText;
  return plainText.slice(0, 150).trimEnd() + "...";
}
