/**
 * Journal · home — the front page. A configured static page renders through
 * the `page` surface; otherwise the latest-posts feed leads with a full-width
 * feature (image left, text right), a rule, then a two-column list.
 */
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { estimateReadingTime, extractPlainText } from "@/lib/blog/renderContent";
import type { HomeSurfaceData } from "@/templates/packs/core/surfaces/home";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, PostCard, Rule, SectionHeading, SkeletonBlock, SkeletonText, type JournalPostLike } from "../parts";
import JournalPage from "./page";

export default function JournalHome({ data }: SurfaceProps<HomeSurfaceData>) {
  const { frontPage, latestPosts } = data;
  const siteIdentity = useSiteIdentity();

  if (frontPage === undefined) {
    return (
      <Container className="flex flex-col gap-10 py-14 md:py-20">
        <SkeletonBlock className="h-10 w-2/3 max-w-lg" />
        <SkeletonText lines={3} className="max-w-[68ch]" />
      </Container>
    );
  }

  if (frontPage) {
    return <Surface name="page" data={{ page: frontPage }} fallback={JournalPage} />;
  }

  const posts: JournalPostLike[] = (latestPosts ?? []).map((post) => ({
    _id: post._id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt || excerptFrom(post.content),
    publishedAt: post.publishedAt ?? null,
    readingTime: estimateReadingTime(post.content),
  }));
  const [feature, ...rest] = posts;

  return (
    <Container as="div" className="flex flex-col gap-14 py-14 md:gap-20 md:py-20">
      <SectionHeading
        level={1}
        eyebrow={siteIdentity?.title}
        title="Latest updates"
        lede="Published articles from the site. Configure a static front page in Admin Settings to replace this feed with a custom homepage."
        action={
          <div className="flex items-center gap-5">
            <LinkButton to="/blog" variant="link">
              View all posts
            </LinkButton>
            <LinkButton to="/search" variant="link" className="text-muted-foreground decoration-transparent hover:text-foreground hover:decoration-foreground">
              Search site
            </LinkButton>
          </div>
        }
      />

      {latestPosts === undefined ? (
        <FeedSkeleton />
      ) : posts.length === 0 || !feature ? (
        <EmptyState eyebrow="Nothing yet" title="Once posts are published, they will appear here." />
      ) : (
        <div className="flex flex-col gap-14">
          <PostCard post={feature} variant="feature" />
          {rest.length > 0 ? (
            <>
              <Rule />
              <section className="flex flex-col gap-8" aria-label="Recent writing">
                <div className="flex items-end justify-between gap-6">
                  <h2 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">Recent writing</h2>
                  <LinkButton to="/blog" variant="link" className="text-sm">
                    All posts
                  </LinkButton>
                </div>
                <div className="grid gap-x-10 gap-y-2 md:grid-cols-2">
                  {rest.map((post) => (
                    <PostCard key={post._id} post={post} />
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </div>
      )}
    </Container>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-14" aria-hidden="true">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <SkeletonBlock className="aspect-[3/2] rounded-2xl lg:col-span-7" />
        <div className="flex flex-col justify-center gap-5 lg:col-span-5">
          <SkeletonBlock className="h-3 w-24 rounded-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonText lines={4} />
        </div>
      </div>
      <Rule />
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
        {[0, 1].map((item) => (
          <div key={item} className="flex flex-col gap-4">
            <SkeletonBlock className="h-3 w-20 rounded-full" />
            <SkeletonBlock className="h-7 w-3/4" />
            <SkeletonText lines={3} />
          </div>
        ))}
      </div>
    </div>
  );
}

function excerptFrom(content: string | null | undefined): string | undefined {
  if (!content) return undefined;
  const text = extractPlainText(content);
  if (!text) return undefined;
  return text.length <= 160 ? text : `${text.slice(0, 160).trimEnd()}...`;
}
