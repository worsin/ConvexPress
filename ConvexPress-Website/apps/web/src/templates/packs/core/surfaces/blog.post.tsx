import { PublicCanonicalBody } from "@/templates/sdk/block-public/PublicCanonicalBody";
/**
 * Core · blog.post — a single post: header, body (blocks / structured /
 * TipTap, or the membership gate), footer, author box, related posts,
 * comments. SEO head tags are emitted by the route so every pack keeps them.
 */
import { AuthorBox } from "@/components/blog/AuthorBox";
import { PostContent } from "@/components/blog/PostContent";
import { PostFooter } from "@/components/blog/PostFooter";
import { PostHeader } from "@/components/blog/PostHeader";
import { RelatedPosts } from "@/components/blog/RelatedPosts";
import { StructuredContent, type StructuredContentProps } from "@/components/blog/StructuredContent";
import { BlockListRenderer } from "@/components/blocks/BlockListRenderer";
import { CommentSection } from "@/components/comments/CommentSection";
import type { AuthorData, PostCard, PostDetail } from "@/lib/blog/types";
import CoreRestricted, { type RestrictedSurfaceData } from "@/templates/packs/core/surfaces/system.restricted";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface BlogPostSurfaceData {
  post: PostDetail;
  author: AuthorData;
  relatedPosts: PostCard[];
  /** Absolute share URL once the origin is known on the client; path-only during SSR. */
  shareUrl: string;
  /** AI structured content present on the post (takes priority over TipTap content); null when absent. */
  structured: StructuredContentProps | null;
  /** Membership gate replacing the body when the visitor lacks access; null when unrestricted. */
  restricted: RestrictedSurfaceData | null;
  comments: {
    postId: string;
    commentStatus: "open" | "closed";
    isLoggedIn: boolean;
    currentUserId?: string;
  };
}

export default function CoreBlogPost({ data }: SurfaceProps<BlogPostSurfaceData>) {
  const { post, author, relatedPosts, shareUrl, structured, restricted, comments } = data;
  return (
    <article
      data-slot="single-post"
      className="mx-auto flex max-w-3xl flex-col gap-8"
    >
      {/* Header */}
      <PostHeader
        title={post.title}
        author={post.author}
        publishedAt={post.publishedAt}
        readingTime={post.readingTime}
        categories={post.categories}
        featuredImageUrl={post.featuredImageUrl}
        featuredImageAlt={post.featuredImageAlt}
      />
      {/* Content: gated by membership when a restriction rule applies.
          Otherwise blocks, then structured (AI-generated), then TipTap. */}
      {restricted ? (
        <Surface name="system.restricted" data={restricted} fallback={CoreRestricted} />
      ) : post.blocksVersion === 2 ? (
          <PublicCanonicalBody documentId={post._id} />
        ) : post.contentMode === "blocks" && post.blocks && post.blocks.length > 0 ? (
        <BlockListRenderer blocks={post.blocks} />
      ) : structured ? (
        <StructuredContent
          hero={structured.hero}
          topics={structured.topics}
          summary={structured.summary}
          sources={structured.sources}
          tableOfContents={structured.tableOfContents}
        />
      ) : (
        <PostContent content={post.content} />
      )}
      {/* Footer (tags, share, nav) */}
      <PostFooter
        tags={post.tags}
        shareUrl={shareUrl}
        shareTitle={post.title}
        previousPost={post.previousPost}
        nextPost={post.nextPost}
      />
      {/* Author Box */}
      <AuthorBox author={author} />
      {/* Related Posts */}
      <RelatedPosts posts={relatedPosts} />
      {/* Comment Section */}
      <CommentSection
        postId={comments.postId}
        commentStatus={comments.commentStatus}
        isLoggedIn={comments.isLoggedIn}
        currentUserId={comments.currentUserId}
      />
    </article>
  );
}
