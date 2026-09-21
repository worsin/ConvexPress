import { ArchiveContinuation, type ArchiveContinuationData } from "@/components/blog/ArchiveContinuation";
/** Core · blog.tag — tag archive with breadcrumbs and the post grid. */
import { PostGrid } from "@/components/blog/PostGrid";
import { PostPagination } from "@/components/blog/PostPagination";
import { ArchiveHeader } from "@/components/taxonomy/ArchiveHeader";
import { TaxonomyBreadcrumbs } from "@/components/taxonomy/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import type { PaginationData, PostCard } from "@/lib/blog/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface BlogTagSurfaceData {
  tag: {
    _id: string;
    name: string;
    slug: string;
    description?: string;
    count?: number;
  };
  /** Tag slug from the URL (pagination base). */
  slug: string;
  /** `undefined` while the tag's posts are loading. */
  posts: PostCard[] | undefined;
  pagination: PaginationData | undefined;
  continuation?: ArchiveContinuationData;
}

export default function CoreBlogTag({ data }: SurfaceProps<BlogTagSurfaceData>) {
  const { tag, slug, posts, pagination } = data;
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
          {posts.length || !data.continuation ? <PostGrid posts={posts} layout="grid" /> : null}

          {data.continuation && <ArchiveContinuation data={data.continuation}/> }
          {!data.continuation && pagination && pagination.totalPages > 1 && (
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
