/**
 * Depot · blog.tag — a tag archive: breadcrumbs, a title row with the count,
 * then the posts as `PostCard` rows in two columns with numbered pagination.
 */
import type { BlogTagSurfaceData } from "@/templates/packs/core/surfaces/blog.tag";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, Pagination } from "../parts";
import { PageHeader, PostRows } from "../parts/extra-commerce";

export default function DepotBlogTag({ data }: SurfaceProps<BlogTagSurfaceData>) {
  const { tag, slug, posts, pagination } = data;
  return (
    <Container padded={false} data-slot="tag-archive" className="flex flex-col gap-4 py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: `Tag: ${tag.name}` }]} />

      <PageHeader label="Tag" title={tag.name} description={tag.description} meta={`${tag.count} ${tag.count === 1 ? "post" : "posts"}`} />

      <PostRows posts={posts} empty={<EmptyState title="No posts with this tag yet." />} />

      {pagination && pagination.totalPages > 1 && (
        <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} linkFor={(page) => (page === 1 ? { to: `/tag/${slug}` } : { to: `/tag/${slug}`, search: { page } })} />
      )}
    </Container>
  );
}
