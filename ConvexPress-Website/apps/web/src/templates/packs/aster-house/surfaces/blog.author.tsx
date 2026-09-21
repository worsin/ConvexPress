/**
 * Aster · blog.author — the author as a masthead (portrait, name in display
 * type, bio in the reading measure, post count in small caps), then their
 * posts as feature + rule-separated list with Previous / page / Next.
 */
import type { BlogAuthorSurfaceData } from "@/templates/packs/core/surfaces/blog.author";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, Eyebrow, LinkButton, SmallCaps } from "../parts";
import { ArchivePosts } from "../parts/extra-commerce";

export default function AsterBlogAuthor({ data }: SurfaceProps<BlogAuthorSurfaceData>) {
  const { archive, slug, posts, pagination } = data;
  return (
    <Container as="section" data-slot="author-archive" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <header className="flex flex-col items-center gap-5 text-center">
        <Eyebrow>Author</Eyebrow>
        {archive.imageUrl ? <img src={archive.imageUrl} alt={archive.title} className="size-24 rounded-full object-cover" width={96} height={96} /> : null}
        <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-6xl">{archive.title}</h1>
        {archive.description ? <p className="max-w-[60ch] text-base leading-8 text-muted-foreground text-balance md:text-[17px]">{archive.description}</p> : null}
        <SmallCaps className="tabular-nums">
          {archive.postCount} {archive.postCount === 1 ? "post" : "posts"}
        </SmallCaps>
      </header>

      <ArchivePosts
        posts={posts}
        pagination={pagination}
        getLink={(page) => ({ to: "/author/$slug", params: { slug }, search: page > 1 ? { page } : {} })}
        empty={
          <EmptyState
            eyebrow="Nothing yet"
            title="This author hasn't published any posts yet."
            action={
              <LinkButton to="/blog" variant="ghost">
                Back to the blog
              </LinkButton>
            }
          />
        }
      />
    </Container>
  );
}
