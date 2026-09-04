/** Depot · blog.index — a two-column list of post rows with compact pagination. */
import type { BlogIndexSurfaceData } from "@/templates/packs/core/surfaces/blog.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, Label, Pagination, PostCard } from "../parts";

export default function DepotBlogIndex({ data }: SurfaceProps<BlogIndexSurfaceData>) {
  const { posts, pagination } = data;
  return (
    <Container padded={false} data-slot="blog-index" className="flex flex-col gap-4 py-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <Label>Blog</Label>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Latest articles and insights</h1>
        </div>
        {pagination.totalItems > 0 && (
          <p className="text-[13px] tabular-nums text-muted-foreground">
            {pagination.totalItems} {pagination.totalItems === 1 ? "post" : "posts"}
          </p>
        )}
      </div>

      {posts.length === 0 ? (
        <EmptyState title="No posts yet" description="Check back soon." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {posts.map((post) => (
              <PostCard
                key={post._id}
                post={{
                  title: post.title,
                  slug: post.slug,
                  excerpt: post.excerpt,
                  imageUrl: post.featuredImageUrl,
                  imageAlt: post.featuredImageAlt,
                  date: post.publishedAt,
                  category: post.primaryCategory,
                  readingTime: post.readingTime,
                  commentCount: post.commentCount,
                }}
              />
            ))}
          </div>
          <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} linkFor={(page) => (page === 1 ? { to: "/blog" } : { to: "/blog", search: { page } })} />
        </>
      )}
    </Container>
  );
}
