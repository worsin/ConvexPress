/**
 * Tag Archive Page - /tag/$slug
 *
 * SSR tag archive page with breadcrumbs, archive header,
 * post grid, pagination, and SEO.
 * 404 if slug not found.
 */

import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { api } from "@convexpress-website/backend/generated/api";
import { useSetting } from "@/contexts/SettingsContext";
import type {
  PaginationData,
  PostCard as PostCardType,
} from "@/lib/blog/types";
import { estimateReadingTime } from "@/lib/blog/renderContent";
import { ArchiveHeader } from "@/components/taxonomy/ArchiveHeader";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PostGrid } from "@/components/blog/PostGrid";
import { PostPagination } from "@/components/blog/PostPagination";
import { Skeleton } from "@/components/ui/skeleton";
import { TaxonomyBreadcrumbs } from "@/components/taxonomy/Breadcrumbs";

interface TagSearchParams {
  page?: number;
}

export const Route = createFileRoute("/_marketing/tag/$slug")({
  component: TagArchive,
  validateSearch: (search: Record<string, unknown>): TagSearchParams => ({
    page: Number(search.page) || 1,
  }),
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    // Pre-fetch tag data for SSR
    await queryClient.ensureQueryData(
      convexQuery(api.taxonomies.queries.getBySlug, {
        slug,
        taxonomy: "post_tag" as const,
      }),
    );
  },
  head: ({ params }) => ({
    meta: [
      { title: `Tag: ${params.slug} - ConvexPress` },
    ],
    links: [
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: `${params.slug} Tag RSS Feed`,
        href: `/api/tag/${params.slug}/feed`,
      },
      {
        rel: "alternate",
        type: "application/atom+xml",
        title: `${params.slug} Tag Atom Feed`,
        href: `/api/tag/${params.slug}/feed/atom`,
      },
    ],
  }),
});

function TagArchive() {
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();
  const postsPerPage = useSetting("postsPerPage") ?? 10;

  // Fetch the tag by slug
  const tag = useQuery(api.taxonomies.queries.getBySlug, {
    slug,
    taxonomy: "post_tag" as const,
  });

  // Fetch posts for this tag (only when tag is loaded)
  const postsData = useQuery(
    api.taxonomies.queries.getPostsByTerm,
    tag?._id
      ? {
          termId: tag._id as never,
          page: page ?? 1,
          perPage: postsPerPage,
        }
      : "skip",
  );

  // Loading state
  if (tag === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-24" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Not found
  if (tag === null) {
    return <NotFoundPage />;
  }

  // Map posts data (getPostsByTerm returns raw post docs without denormalized author)
  const posts: PostCardType[] = (postsData?.posts ?? []).map((post: NonNullable<NonNullable<typeof postsData>['posts']>[number]) => ({
    _id: post._id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    featuredImageUrl: post.featuredImageUrl ?? undefined,
    featuredImageAlt: post.featuredImageAlt ?? undefined,
    publishedAt: post.publishedAt
      ? new Date(post.publishedAt).toISOString()
      : undefined,
    author: {
      _id: post.author?._id ?? post.authorId ?? "",
      displayName: post.author?.displayName ?? "Unknown",
      slug: post.author?.slug ?? "",
      avatarUrl: post.author?.avatarUrl,
    },
    primaryCategory: undefined,
    commentCount: post.commentCount ?? 0,
    isSticky: post.isSticky ?? false,
    readingTime: estimateReadingTime(post.content),
  }));
  const pagination: PaginationData | undefined = postsData
    ? {
        currentPage: postsData.page,
        totalPages: postsData.totalPages,
        totalItems: postsData.total,
        perPage: postsData.perPage,
        hasNextPage: postsData.page < postsData.totalPages,
        hasPreviousPage: postsData.page > 1,
      }
    : undefined;

  return (
    <div data-slot="tag-archive" className="flex flex-col gap-8">
      {/* Breadcrumbs */}
      <TaxonomyBreadcrumbs
        type="tag"
        termName={tag.name}
        termSlug={tag.slug}
      />

      {/* Archive Header */}
      <ArchiveHeader
        name={tag.name}
        type="tag"
        description={tag.description}
        postCount={tag.count}
      />

      {/* Posts */}
      {postsData === undefined ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <PostGrid posts={posts} layout="grid" />

          {pagination && pagination.totalPages > 1 && (
            <PostPagination
              pagination={pagination}
              baseUrl={`/tag/${slug}`}
              className="pt-4"
            />
          )}
        </>
      )}
    </div>
  );
}
