/**
 * Depot · home — the configured front page through the `page` surface, or
 * a "news" list of the latest posts in a two-column grid when the front page
 * is the latest-posts feed. Same links as Core (blog, search).
 */
import { estimateReadingTime, extractPlainText } from "@/lib/blog/renderContent";
import CorePage from "@/templates/packs/core/surfaces/page";
import type { HomeSurfaceData } from "@/templates/packs/core/surfaces/home";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, Label, LinkButton, PostCard, SectionHeading, Skeleton } from "../parts";

export default function DepotHome({ data }: SurfaceProps<HomeSurfaceData>) {
  const { frontPage, latestPosts } = data;

  if (frontPage === undefined) {
    return (
      <Container padded={false} className="flex flex-col gap-4 py-6 md:py-8">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28" />
          ))}
        </div>
      </Container>
    );
  }

  if (frontPage) {
    return <Surface name="page" data={{ page: frontPage }} fallback={CorePage} />;
  }

  const posts = latestPosts ?? [];

  return (
    <Container as="div" padded={false} className="flex flex-col gap-6 py-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <Label>News</Label>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Latest updates</h1>
          <p className="max-w-2xl text-[13px] text-muted-foreground">
            Published articles from the site. Configure a static front page in Admin Settings to replace this feed with a custom homepage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/blog">View all posts</LinkButton>
          <LinkButton to="/search" variant="secondary">
            Search site
          </LinkButton>
        </div>
      </div>

      {latestPosts === undefined ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState title="No published posts yet" description="Once posts are published, they will appear here automatically." />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeading title="Recent writing" action={{ label: "All posts", to: "/blog" }} />
          <div className="grid gap-3 md:grid-cols-2">
            {posts.map((post) => (
              <PostCard
                key={post._id}
                post={{
                  title: post.title,
                  slug: post.slug,
                  excerpt: post.excerpt || excerptFrom(post.content) || "Read the full article.",
                  date: post.publishedAt ?? null,
                  readingTime: estimateReadingTime(post.content),
                }}
              />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}

function excerptFrom(content: string | undefined | null): string | undefined {
  if (!content) return undefined;
  const text = extractPlainText(content);
  if (!text) return undefined;
  return text.length <= 160 ? text : `${text.slice(0, 160).trimEnd()}...`;
}
