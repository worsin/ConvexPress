import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { useSetting } from "@/contexts/SettingsContext";
import type { PaginationData, PostCard as PostCardType } from "@/lib/blog/types";
import { estimateReadingTime, extractPlainText } from "@/lib/blog/renderContent";
import { PostGrid } from "@/components/blog/PostGrid";
import { PostPagination } from "@/components/blog/PostPagination";
import { PostCardSkeletonGrid } from "@/components/blog/PostCardSkeleton";

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
  },
  head: () => ({
    meta: [
      { title: "Blog - ConvexPress" },
      {
        name: "description",
        content: "Read the latest articles, tutorials, and insights from ConvexPress.",
      },
    ],
  }),
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
    <div data-slot="blog-index" className="flex flex-col gap-8">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold">Blog</h1>
        <p className="text-xs text-muted-foreground">
          Latest articles and insights
        </p>
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No posts yet. Check back soon!
          </p>
        </div>
      ) : (
        <>
          <PostGrid
            posts={posts}
            layout="grid"
            showFeatured={page === 1}
          />

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <PostPagination
              pagination={pagination}
              baseUrl="/blog"
              className="pt-4"
            />
          )}
        </>
      )}
    </div>
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
