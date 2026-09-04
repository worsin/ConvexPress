/** Core · blog.category — category archive with breadcrumbs, subcategories and the post grid. */
import { PostGrid } from "@/components/blog/PostGrid";
import { PostPagination } from "@/components/blog/PostPagination";
import { ArchiveHeader } from "@/components/taxonomy/ArchiveHeader";
import { TaxonomyBreadcrumbs } from "@/components/taxonomy/Breadcrumbs";
import { SubcategoryList } from "@/components/taxonomy/SubcategoryList";
import { Skeleton } from "@/components/ui/skeleton";
import type { PaginationData, PostCard } from "@/lib/blog/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface BlogCategorySurfaceData {
  category: {
    _id: string;
    name: string;
    slug: string;
    description?: string;
    count: number;
  };
  /** Category slug from the URL (pagination base). */
  slug: string;
  /** Ancestor chain from the root category down to the immediate parent. */
  ancestors: Array<{ name: string; slug: string }>;
  subcategories: Array<{ _id: string; name: string; slug: string; count: number }>;
  /** `undefined` while the category's posts are loading. */
  posts: PostCard[] | undefined;
  pagination: PaginationData | undefined;
}

export default function CoreBlogCategory({ data }: SurfaceProps<BlogCategorySurfaceData>) {
  const { category, slug, ancestors, subcategories, posts, pagination } = data;
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
      {posts === undefined ? (
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
