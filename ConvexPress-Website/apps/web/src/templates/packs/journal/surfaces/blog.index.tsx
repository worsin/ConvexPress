/**
 * Journal · blog.index — page one leads with a full-width feature (image
 * left, text right), a rule, then a two-column list; later pages are the list
 * alone. Author, date and reading time set in small caps. Pagination as
 * Previous / page / Next text links under a rule.
 */
import type { BlogIndexSurfaceData } from "@/templates/packs/core/surfaces/blog.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, Pagination, PostCard, Rule, SectionHeading } from "../parts";

export default function JournalBlogIndex({ data }: SurfaceProps<BlogIndexSurfaceData>) {
  const { posts, pagination, page } = data;
  const featureFirst = page === 1 && posts.length > 0;
  const feature = featureFirst ? posts[0] : null;
  const list = featureFirst ? posts.slice(1) : posts;

  return (
    <Container as="section" data-slot="blog-index" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <SectionHeading
        level={1}
        eyebrow="The journal"
        title="Blog"
        lede="Latest articles and insights"
        action={
          pagination.totalItems > 0 ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] tabular-nums text-muted-foreground">
              {pagination.totalItems} {pagination.totalItems === 1 ? "story" : "stories"}
            </p>
          ) : undefined
        }
      />

      {posts.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title="No posts yet. Check back soon."
          action={
            <LinkButton to="/" variant="ghost">
              Back to the front page
            </LinkButton>
          }
        />
      ) : (
        <div className="flex flex-col gap-14">
          {feature ? <PostCard post={feature} variant="feature" /> : null}
          {feature && list.length > 0 ? <Rule /> : null}
          {list.length > 0 ? (
            <div className="grid gap-x-10 gap-y-2 md:grid-cols-2">
              {list.map((post) => (
                <PostCard key={post._id} post={post} />
              ))}
            </div>
          ) : null}
          <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} getLink={(target) => ({ to: "/blog", search: target > 1 ? { page: target } : {} })} />
        </div>
      )}
    </Container>
  );
}
