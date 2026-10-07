import { PublicCanonicalBody } from "@/templates/sdk/block-public/PublicCanonicalBody";
/**
 * Journal · blog.post — a single post in the reading measure. Display title,
 * small-caps meta, a 3:2 hero image, the canonical body (or the membership gate), tags and sharing, the author as a rule-separated
 * row, related posts three-up, and comments below a rule.
 */
import { Link } from "@tanstack/react-router";

import { ShareButtons } from "@/components/blog/ShareButtons";
import { CommentSection } from "@/components/comments/CommentSection";
import type { AuthorData } from "@/lib/blog/types";
import type { BlogPostSurfaceData } from "@/templates/packs/core/surfaces/blog.post";
import CoreRestricted from "@/templates/packs/core/surfaces/system.restricted";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, PostCard, PostMetaLine, Prose, Rule, SmallCaps } from "../parts";

export default function JournalBlogPost({ data }: SurfaceProps<BlogPostSurfaceData>) {
  const { post, author, relatedPosts, shareUrl, restricted, comments } = data;

  return (
    <Container as="article" data-slot="single-post" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      {/* Header */}
      <header className="flex flex-col items-center gap-8 text-center">
        <Prose className="flex flex-col items-center gap-5">
          {post.categories.length > 0 ? (
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              {post.categories.map((category) => (
                <Link key={category._id} to="/category/$slug" params={{ slug: category.slug }} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline">
                  {category.name}
                </Link>
              ))}
            </p>
          ) : null}
          <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-5xl">{post.title}</h1>
          {post.excerpt ? <p className="text-base leading-8 text-muted-foreground md:text-[17px]">{post.excerpt}</p> : null}
          <PostMetaLine post={post} className="justify-center" />
        </Prose>
        {post.featuredImageUrl ? (
          <figure className="w-full max-w-4xl overflow-hidden rounded-2xl bg-muted">
            <img src={post.featuredImageUrl} alt={post.featuredImageAlt ?? post.title} className="aspect-[3/2] w-full object-cover" loading="eager" />
          </figure>
        ) : null}
      </header>

      {/* Body */}
      <Prose className="text-base leading-8 text-muted-foreground md:text-[17px]">
        {restricted ? (
          <Surface name="system.restricted" data={restricted} fallback={CoreRestricted} />
        ) : (
          <PublicCanonicalBody documentId={post._id} />
        )}
      </Prose>

      {/* Tags, sharing, neighbours */}
      <Prose as="footer" data-slot="post-footer" className="flex flex-col gap-8">
        <Rule />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {post.tags.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-2" aria-label="Tags">
              {post.tags.map((tag) => (
                <li key={tag._id}>
                  <Link to="/tag/$slug" params={{ slug: tag.slug }} className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">
                    {tag.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <span />
          )}
          <ShareButtons url={shareUrl} title={post.title} />
        </div>
        {post.previousPost || post.nextPost ? (
          <nav aria-label="Post navigation" className="grid grid-cols-2 gap-6 border-t border-border pt-8">
            {post.previousPost ? (
              <Link to="/blog/$slug" params={{ slug: post.previousPost.slug }} className="group/nav flex flex-col gap-2 text-left">
                <SmallCaps>Previous</SmallCaps>
                <span className="font-display text-lg leading-snug text-foreground transition-colors group-hover/nav:text-primary">{post.previousPost.title}</span>
              </Link>
            ) : (
              <div />
            )}
            {post.nextPost ? (
              <Link to="/blog/$slug" params={{ slug: post.nextPost.slug }} className="group/nav flex flex-col gap-2 text-right">
                <SmallCaps>Next</SmallCaps>
                <span className="font-display text-lg leading-snug text-foreground transition-colors group-hover/nav:text-primary">{post.nextPost.title}</span>
              </Link>
            ) : (
              <div />
            )}
          </nav>
        ) : null}
      </Prose>

      {/* Author */}
      <Prose>
        <AuthorRow author={author} />
      </Prose>

      {/* Related */}
      {relatedPosts.length > 0 ? (
        <section data-slot="related-posts" aria-label="Related posts" className="flex flex-col gap-8">
          <Rule />
          <h2 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">Related posts</h2>
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {relatedPosts.slice(0, 3).map((related) => (
              <PostCard key={related._id} post={related} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Comments */}
      <Prose className="flex flex-col gap-8">
        <Rule />
        <CommentSection postId={comments.postId} commentStatus={comments.commentStatus} isLoggedIn={comments.isLoggedIn} currentUserId={comments.currentUserId} />
      </Prose>
    </Container>
  );
}

function AuthorRow({ author }: { author: AuthorData }) {
  return (
    <div data-slot="author-box" className="flex gap-5 border-y border-border py-8">
      <div className="shrink-0">
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt={author.displayName} className="size-14 rounded-full object-cover" />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-full bg-muted font-display text-lg text-muted-foreground">{author.displayName.charAt(0).toUpperCase()}</div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <SmallCaps>Written by</SmallCaps>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link to="/author/$slug" params={{ slug: author.slug }} className="font-display text-xl text-foreground transition-colors hover:text-primary">
            {author.displayName}
          </Link>
          {author.websiteUrl ? (
            <a href={author.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
              Website
            </a>
          ) : null}
        </div>
        {author.bio ? <p className="text-sm leading-7 text-muted-foreground">{author.bio}</p> : null}
        <Link to="/author/$slug" params={{ slug: author.slug }} className="text-sm text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground">
          All posts by {author.displayName}
        </Link>
      </div>
    </div>
  );
}
