/**
 * Core · home — the front page. Renders the configured static front page
 * through the `page` surface, or the latest-posts feed when none is set.
 */
import { Link } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { estimateReadingTime, extractPlainText } from "@/lib/blog/renderContent";
import type { PageDetail } from "@/lib/blog/types";
import CorePage from "@/templates/packs/core/surfaces/page";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface HomeLatestPost {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  publishedAt?: number | null;
}

export interface HomeSurfaceData {
  /** `undefined` while loading, `null` when no static front page is configured. */
  frontPage: PageDetail | null | undefined;
  /** Latest published posts for the feed; `undefined` while loading. Only fetched when there is no front page. */
  latestPosts: HomeLatestPost[] | undefined;
}

export default function CoreHome({ data }: SurfaceProps<HomeSurfaceData>) {
  const { frontPage, latestPosts } = data;

  if (frontPage === undefined) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  if (frontPage) {
    return <Surface name="page" data={{ page: frontPage }} fallback={CorePage} />;
  }

  const posts = latestPosts ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10 sm:py-14">
      <section className="flex flex-col gap-5 border-b border-border pb-10">
        <p className="text-xs font-semibold uppercase text-primary">
          ConvexPress
        </p>
        <div className="flex max-w-3xl flex-col gap-4">
          <h1 className="text-3xl font-semibold text-foreground sm:text-5xl">
            Latest updates
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            Published articles from the site. Configure a static front page in
            Admin Settings to replace this feed with a custom homepage.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/blog"
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all posts
          </Link>
          <Link
            to="/search"
            className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Search site
          </Link>
        </div>
      </section>

      {latestPosts === undefined ? (
        <LatestPostsSkeleton />
      ) : posts.length === 0 ? (
        <section className="rounded-md border border-dashed border-border p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            No published posts yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Once posts are published, they will appear here automatically.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold text-foreground">
              Recent writing
            </h2>
            <Link
              to="/blog"
              className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              All posts
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article
                key={post._id}
                className="flex min-h-52 flex-col gap-4 rounded-md border border-border bg-card p-5"
              >
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold leading-snug text-card-foreground">
                    <Link
                      to="/blog/$slug"
                      params={{ slug: post.slug }}
                      className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {post.title}
                    </Link>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {post.publishedAt
                      ? new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date(post.publishedAt))
                      : "Published"}{" "}
                    · {estimateReadingTime(post.content)} min read
                  </p>
                </div>
                <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {post.excerpt || generateExcerpt(post.content) || "Read the full article."}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LatestPostsSkeleton() {
  return (
    <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex min-h-52 flex-col gap-4 rounded-md border border-border bg-card p-5"
        >
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </section>
  );
}

function generateExcerpt(content: string | undefined | null): string | undefined {
  if (!content) return undefined;
  const plainText = extractPlainText(content);
  if (!plainText) return undefined;
  return plainText.length <= 160
    ? plainText
    : `${plainText.slice(0, 160).trimEnd()}...`;
}
