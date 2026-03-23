/**
 * Category Archive Page - /category/$slug
 *
 * SSR category archive page with breadcrumbs, archive header,
 * post grid, subcategory list, pagination, and SEO.
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
import { SubcategoryList } from "@/components/taxonomy/SubcategoryList";

interface CategorySearchParams {
  page?: number;
}

export const Route = createFileRoute("/_marketing/category/$slug")({
  component: CategoryArchive,
  validateSearch: (search: Record<string, unknown>): CategorySearchParams => ({
    page: Number(search.page) || 1,
  }),
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    // Pre-fetch category data for SSR
    await queryClient.ensureQueryData(
      convexQuery(api.taxonomies.queries.getBySlug, {
        slug,
        taxonomy: "category" as const,
      }),
    );
  },
  head: ({ params }) => ({
    meta: [
      { title: `Category: ${params.slug} - SmithHarper` },
    ],
    links: [
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: `${params.slug} Category RSS Feed`,
        href: `/api/category/${params.slug}/feed`,
      },
      {
        rel: "alternate",
        type: "application/atom+xml",
        title: `${params.slug} Category Atom Feed`,
        href: `/api/category/${params.slug}/feed/atom`,
      },
    ],
  }),
});

function CategoryArchive() {
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();
  const postsPerPage = useSetting("postsPerPage") ?? 10;

  // Fetch the category by slug
  const category = useQuery(api.taxonomies.queries.getBySlug, {
    slug,
    taxonomy: "category" as const,
  });

  // Fetch posts for this category (only when category is loaded)
  const postsData = useQuery(
    api.taxonomies.queries.getPostsByTerm,
    category?._id
      ? {
          termId: category._id as never,
          page: page ?? 1,
          perPage: postsPerPage,
        }
      : "skip",
  );

  // Fetch the category tree for breadcrumbs and subcategories
  const categoryTree = useQuery(api.taxonomies.queries.getCategoryTree);

  // Loading state
  if (category === undefined) {
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
  if (category === null) {
    return <NotFoundPage />;
  }

  // Build ancestor chain for breadcrumbs
  const ancestors = buildAncestorChain(category._id, category.parentId, categoryTree);

  // Find subcategories
  const subcategories = findSubcategories(category._id, categoryTree);

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
    <div data-slot="category-archive" className="flex flex-col gap-8">
      {/* Breadcrumbs */}
      <TaxonomyBreadcrumbs
        type="category"
        termName={category.name}
        termSlug={category.slug}
        ancestors={ancestors}
      />

      {/* Archive Header */}
      <ArchiveHeader
        name={category.name}
        type="category"
        description={category.description}
        postCount={category.count}
      />

      {/* Subcategories */}
      {subcategories.length > 0 && (
        <SubcategoryList subcategories={subcategories} />
      )}

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
              baseUrl={`/category/${slug}`}
              className="pt-4"
            />
          )}
        </>
      )}
    </div>
  );
}

// --- Helpers ---

interface TreeNode {
  _id: string;
  name: string;
  slug: string;
  count: number;
  isDefault: boolean;
  depth: number;
  children: TreeNode[];
}

function buildAncestorChain(
  _termId: string,
  parentId: string | undefined,
  tree: TreeNode[] | undefined,
): Array<{ name: string; slug: string }> {
  if (!tree || !parentId) return [];

  const ancestors: Array<{ name: string; slug: string }> = [];
  const nodeMap = new Map<string, TreeNode>();

  function mapNodes(nodes: TreeNode[]) {
    for (const node of nodes) {
      nodeMap.set(node._id, node);
      mapNodes(node.children);
    }
  }
  mapNodes(tree);

  // Walk up the parent chain
  let currentParentId: string | undefined = parentId;
  while (currentParentId) {
    const parent = nodeMap.get(currentParentId);
    if (!parent) break;
    ancestors.unshift({ name: parent.name, slug: parent.slug });
    // Find parent's parent by searching the tree
    currentParentId = findParentId(parent._id, tree);
  }

  return ancestors;
}

function findParentId(
  childId: string,
  tree: TreeNode[],
): string | undefined {
  for (const node of tree) {
    for (const child of node.children) {
      if (child._id === childId) return node._id;
      const found = findParentId(childId, node.children);
      if (found) return found;
    }
  }
  return undefined;
}

function findSubcategories(
  parentId: string,
  tree: TreeNode[] | undefined,
): Array<{ _id: string; name: string; slug: string; count: number }> {
  if (!tree) return [];

  function findNode(nodes: TreeNode[]): TreeNode | undefined {
    for (const node of nodes) {
      if (node._id === parentId) return node;
      const found = findNode(node.children);
      if (found) return found;
    }
    return undefined;
  }

  const node = findNode(tree);
  if (!node) return [];

  return node.children.map((child) => ({
    _id: child._id,
    name: child.name,
    slug: child.slug,
    count: child.count,
  }));
}
