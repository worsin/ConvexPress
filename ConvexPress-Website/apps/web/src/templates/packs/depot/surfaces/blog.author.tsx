/**
 * Depot · blog.author — an author's profile row (avatar, name, count, bio)
 * then their posts as `PostCard` rows in two columns with numbered pagination.
 */
import type { BlogAuthorSurfaceData } from "@/templates/packs/core/surfaces/blog.author";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, Label, Pagination } from "../parts";
import { PostRows } from "../parts/extra";

export default function DepotBlogAuthor({ data }: SurfaceProps<BlogAuthorSurfaceData>) {
  const { archive, slug, posts, pagination } = data;
  return (
    <Container padded={false} data-slot="author-archive" className="flex flex-col gap-4 py-6 md:py-8">
      <header data-slot="archive-header" className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          {archive.imageUrl && <img src={archive.imageUrl} alt="" className="size-14 shrink-0 rounded-md object-cover" />}
          <div className="flex min-w-0 flex-col gap-1">
            <Label>Author</Label>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{archive.title}</h1>
            {archive.description ? <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">{archive.description}</p> : null}
          </div>
        </div>
        <p className="text-[13px] tabular-nums text-muted-foreground">
          {archive.postCount} {archive.postCount === 1 ? "post" : "posts"}
        </p>
      </header>

      <PostRows posts={posts} empty={<EmptyState title="This author hasn't published any posts yet." />} />

      {pagination && pagination.totalPages > 1 && (
        <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} linkFor={(page) => (page === 1 ? { to: `/author/${slug}` } : { to: `/author/${slug}`, search: { page } })} />
      )}
    </Container>
  );
}
