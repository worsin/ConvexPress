import { ArchiveContinuation } from "@/components/blog/ArchiveContinuation";
/**
 * Journal · blog.tag — small-caps breadcrumbs, the tag in display type with
 * its description and count, then posts as feature + rule-separated list.
 */
import type { BlogTagSurfaceData } from "@/templates/packs/core/surfaces/blog.tag";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, EmptyState, LinkButton, SectionHeading, SmallCaps } from "../parts";
import { ArchivePosts } from "../parts/extra-commerce";

export default function JournalBlogTag({ data }: SurfaceProps<BlogTagSurfaceData>) {
  const { tag, slug, posts, pagination } = data;
  return (
    <Container as="section" data-slot="tag-archive" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <header className="flex flex-col gap-8">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: `Tag: ${tag.name}` }]} />
        <SectionHeading
          level={1}
          eyebrow="Tag"
          title={tag.name}
          lede={tag.description}
          action={tag.count === undefined ? undefined :
            <SmallCaps className="tabular-nums">
              {tag.count} {tag.count === 1 ? "post" : "posts"}
            </SmallCaps>
          }
        />
      </header>

      <ArchivePosts
        posts={posts}
        pagination={pagination}
        getLink={(page) => ({ to: "/tag/$slug", params: { slug }, search: page > 1 ? { page } : {} })}
        empty={data.continuation ? <></> :
          <EmptyState
            eyebrow="Nothing yet"
            title="No posts with this tag yet."
            action={
              <LinkButton to="/blog" variant="ghost">
                Back to the blog
              </LinkButton>
            }
          />
        }
      />
      {data.continuation && <ArchiveContinuation data={data.continuation}/> }
    </Container>
  );
}
