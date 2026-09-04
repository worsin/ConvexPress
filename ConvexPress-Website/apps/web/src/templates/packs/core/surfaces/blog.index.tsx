/** Core · blog.index — the blog front: featured lead on page one, post grid, pagination. */
import { PostGrid } from "@/components/blog/PostGrid";
import { PostPagination } from "@/components/blog/PostPagination";
import type { PaginationData, PostCard } from "@/lib/blog/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface BlogIndexSurfaceData {
  posts: PostCard[];
  pagination: PaginationData;
  /** Current page number (1-based). */
  page: number;
}

export default function CoreBlogIndex({ data }: SurfaceProps<BlogIndexSurfaceData>) {
  const { posts, pagination, page } = data;
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
