/**
 * Depot · blog.post — a post in the reading measure: small title, a meta row
 * of labels, an inline 16:9 hero, the body (blocks / structured / TipTap, or
 * the membership gate — same chain as Core), tags and sharing, the author as
 * a card, related posts as a four-up card row, comments in a card.
 */
import { Link } from "@tanstack/react-router";

import { PostContent } from "@/components/blog/PostContent";
import { PostFooter } from "@/components/blog/PostFooter";
import { StructuredContent } from "@/components/blog/StructuredContent";
import { BlockListRenderer } from "@/components/blocks/BlockListRenderer";
import { CommentSection } from "@/components/comments/CommentSection";
import type { BlogPostSurfaceData } from "@/templates/packs/core/surfaces/blog.post";
import CoreRestricted from "@/templates/packs/core/surfaces/system.restricted";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, Container, Label, PostCard, Prose, SectionHeading, formatDate } from "../parts";

export default function DepotBlogPost({ data }: SurfaceProps<BlogPostSurfaceData>) {
  const { post, author, relatedPosts, shareUrl, structured, restricted, comments } = data;
  const date = formatDate(post.publishedAt);

  return (
    <Container padded={false} className="flex flex-col gap-6 py-6 md:py-8">
      <Prose as="article" data-slot="single-post" className="flex flex-col gap-5">
        <header data-slot="post-header" className="flex flex-col gap-3">
          {post.categories.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {post.categories.map((category) => (
                <Link key={category._id} to="/category/$slug" params={{ slug: category.slug }} className="text-[11px] font-semibold uppercase tracking-wide text-primary hover:underline">
                  {category.name}
                </Link>
              ))}
            </div>
          )}
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/author/$slug" params={{ slug: post.author.slug }} className="flex items-center gap-1.5">
              {post.author.avatarUrl ? <img src={post.author.avatarUrl} alt="" className="size-5 rounded-md object-cover" /> : null}
              <Label className="text-foreground">{post.author.displayName}</Label>
            </Link>
            {date && (
              <Label as="time" dateTime={post.publishedAt}>
                {date}
              </Label>
            )}
            {post.readingTime ? <Label>{post.readingTime} min read</Label> : null}
            {post.commentCount > 0 ? <Label>{post.commentCount} comments</Label> : null}
          </div>
          {post.featuredImageUrl && (
            <figure className="overflow-hidden rounded-md border border-border bg-muted">
              <img src={post.featuredImageUrl} alt={post.featuredImageAlt ?? post.title} className="aspect-video w-full object-cover" loading="eager" />
            </figure>
          )}
        </header>

        {restricted ? (
          <Surface name="system.restricted" data={restricted} fallback={CoreRestricted} />
        ) : post.contentMode === "blocks" && post.blocks && post.blocks.length > 0 ? (
          <BlockListRenderer blocks={post.blocks} />
        ) : structured ? (
          <StructuredContent hero={structured.hero} topics={structured.topics} summary={structured.summary} sources={structured.sources} tableOfContents={structured.tableOfContents} />
        ) : (
          <PostContent content={post.content} />
        )}

        <PostFooter tags={post.tags} shareUrl={shareUrl} shareTitle={post.title} previousPost={post.previousPost} nextPost={post.nextPost} />

        <Card data-slot="author-box" className="flex gap-3 p-3">
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt={author.displayName} className="size-12 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">{author.displayName.charAt(0).toUpperCase()}</div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Label>Written by</Label>
              <Link to="/author/$slug" params={{ slug: author.slug }} className="text-sm font-semibold text-foreground hover:text-primary">
                {author.displayName}
              </Link>
              {author.websiteUrl && (
                <a href={author.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground hover:text-foreground">
                  Website
                </a>
              )}
            </div>
            {author.bio ? <p className="text-[13px] leading-5 text-muted-foreground">{author.bio}</p> : null}
            <Link to="/author/$slug" params={{ slug: author.slug }} className="text-[13px] font-medium text-primary hover:underline">
              View all posts
            </Link>
          </div>
        </Card>
      </Prose>

      {relatedPosts.length > 0 && (
        <section data-slot="related-posts" aria-label="Related posts" className="flex flex-col gap-3">
          <SectionHeading title="Related posts" action={{ label: "All posts", to: "/blog" }} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {relatedPosts.slice(0, 4).map((related) => (
              <PostCard
                key={related._id}
                layout="tile"
                post={{
                  title: related.title,
                  slug: related.slug,
                  excerpt: related.excerpt,
                  imageUrl: related.featuredImageUrl,
                  imageAlt: related.featuredImageAlt,
                  date: related.publishedAt,
                  category: related.primaryCategory,
                  readingTime: related.readingTime,
                }}
              />
            ))}
          </div>
        </section>
      )}

      <Prose>
        <Card id="comments" className="p-4">
          <CommentSection postId={comments.postId} commentStatus={comments.commentStatus} isLoggedIn={comments.isLoggedIn} currentUserId={comments.currentUserId} />
        </Card>
      </Prose>
    </Container>
  );
}
