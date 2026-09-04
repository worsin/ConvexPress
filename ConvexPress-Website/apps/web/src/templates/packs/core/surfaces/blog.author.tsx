/** Core · blog.author — an author's profile header and their published posts. */
import { ArchiveHeader } from "@/components/blog/ArchiveHeader";
import { PostGrid } from "@/components/blog/PostGrid";
import { PostPagination } from "@/components/blog/PostPagination";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArchiveData, PaginationData, PostCard } from "@/lib/blog/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface BlogAuthorSurfaceData {
  archive: ArchiveData;
  /** Author slug from the URL (pagination base). */
  slug: string;
  /** `undefined` while the author's posts are loading. */
  posts: PostCard[] | undefined;
  pagination: PaginationData | undefined;
}

export default function CoreBlogAuthor({ data }: SurfaceProps<BlogAuthorSurfaceData>) {
  const { archive, slug, posts, pagination } = data;
  return (
    <div data-slot="author-archive" className="flex flex-col gap-8">
      <ArchiveHeader archive={archive} />

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
      ) : posts.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            This author hasn't published any posts yet.
          </p>
        </div>
      ) : (
        <>
          <PostGrid posts={posts} layout="grid" />

          {pagination && pagination.totalPages > 1 && (
            <PostPagination
              pagination={pagination}
              baseUrl={`/author/${slug}`}
              className="pt-4"
            />
          )}
        </>
      )}
    </div>
  );
}
