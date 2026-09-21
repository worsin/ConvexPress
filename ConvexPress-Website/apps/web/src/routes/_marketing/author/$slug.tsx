import { useEffect } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

import { useSetting } from "@/contexts/SettingsContext";
import type {
  ArchiveData,
  PaginationData,
  PostCard as PostCardType,
} from "@/lib/blog/types";
import { estimateReadingTime } from "@/lib/blog/renderContent";
import { Skeleton } from "@/components/ui/skeleton";
import { siteTitled } from "@/lib/seo/head";
import CoreBlogAuthor from "@/templates/packs/core/surfaces/blog.author";
import CoreNotFound from "@/templates/packs/core/surfaces/system.notFound";
import { Surface } from "@/templates/sdk/Surface";

interface AuthorSearchParams {
  page?: number;
}

export const Route = createFileRoute("/_marketing/author/$slug")({
  component: AuthorArchive,
  validateSearch: (search: Record<string, unknown>): AuthorSearchParams => ({
    page: Number(search.page) || 1,
  }),
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    // Pre-fetch author profile for SSR
    await queryClient.ensureQueryData(
      convexQuery(api.profiles.queries.getUserBySlug, { slug }),
    );
  },
  head: ({ params }) => ({
    meta: [
      // Initial title uses slug as a fallback; the component updates
      // document.title with the author's display name once data loads.
      { title: siteTitled(`Author: ${params.slug}`) },
    ],
    links: [
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: `Posts by ${params.slug} RSS Feed`,
        href: `/api/author/${params.slug}/feed`,
      },
      {
        rel: "alternate",
        type: "application/atom+xml",
        title: `Posts by ${params.slug} Atom Feed`,
        href: `/api/author/${params.slug}/feed/atom`,
      },
    ],
  }),
});

function AuthorArchive() {
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();
  const postsPerPage = useSetting("postsPerPage") ?? 10;

  // Fetch author profile by slug (public, no auth required)
  const author = useQuery(api.profiles.queries.getUserBySlug, { slug });

  // Fix #23: Update document title with the author's actual display name
  // once data is loaded, replacing the slug-based fallback from head().
  useEffect(() => {
    if (author?.displayName) {
      document.title = siteTitled(`Author: ${author.displayName}`);
    }
  }, [author?.displayName]);

  // Fetch published posts by this author (only when author is loaded)
  const postsData = useQuery(
    api.posts.queries.listPublished,
    author?._id
      ? {
          authorId: author._id as Id<"users">,
          page: page ?? 1,
          perPage: postsPerPage,
        }
      : "skip",
  );

  // Loading state
  if (author === undefined || (author !== null && postsData === undefined)) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
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
  if (author === null) {
    return <Surface name="system.notFound" data={{ kind: "page" }} fallback={CoreNotFound} />;
  }

  const archiveData: ArchiveData = {
    type: "author",
    title: author.displayName ?? "Unknown Author",
    description: author.bio,
    slug: author.slug ?? slug,
    postCount: postsData?.total ?? 0,
    imageUrl: author.avatarUrl ?? undefined,
  };

  // Map posts data
  const posts: PostCardType[] | undefined = postsData?.posts?.map((post: NonNullable<NonNullable<typeof postsData>['posts']>[number]) => ({
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
      _id: post.author?._id ?? "",
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
    <Surface
      name="blog.author"
      data={{ archive: archiveData, slug, posts, pagination }}
      fallback={CoreBlogAuthor}
    />
  );
}
