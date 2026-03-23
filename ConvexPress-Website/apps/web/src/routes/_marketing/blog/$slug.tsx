import { convexQuery } from "@convex-dev/react-query";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import type { AuthorData, PostDetail, PostCategory, PostTag, PostCard as PostCardType, BlockDocument } from "@/lib/blog/types";
import { estimateReadingTime } from "@/lib/blog/renderContent";
import { parseTipTapDocument } from "@/lib/schemas/content";
import { AuthorBox } from "@/components/blog/AuthorBox";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PasswordGate } from "@/components/blog/PasswordGate";
import { PostContent } from "@/components/blog/PostContent";
import { PostFooter } from "@/components/blog/PostFooter";
import { PostHeader } from "@/components/blog/PostHeader";
import { RelatedPosts } from "@/components/blog/RelatedPosts";
import { CommentSection } from "@/components/comments/CommentSection";
import { SeoHead } from "@/components/seo/SeoHead";
import { Skeleton } from "@/components/ui/skeleton";
import {
  resolvePostSeoFromQueries,
  buildArticleJsonLd,
  createFallbackSeo,
} from "@/lib/seo/resolve";
import type { PostSeoData, SeoSettings } from "@/lib/seo/resolve";
export const Route = createFileRoute("/_marketing/blog/$slug")({
  component: SinglePost,
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    // Pre-fetch the post data on the server for SSR
    await queryClient.ensureQueryData(
      convexQuery(api.posts.queries.getPublished, { slug }),
    );
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} - SmithHarper` },
    ],
    links: [
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: `Comments on ${params.slug} RSS Feed`,
        href: `/api/blog/${params.slug}/feed`,
      },
      {
        rel: "alternate",
        type: "application/atom+xml",
        title: `Comments on ${params.slug} Atom Feed`,
        href: `/api/blog/${params.slug}/feed/atom`,
      },
    ],
  }),
});
function SinglePost() {
  const { slug } = Route.useParams();
  const { isSignedIn, userId } = useAuth();
  // SSR-safe origin: start empty to avoid hydration mismatch
  const [siteUrl, setSiteUrl] = useState("");
  useEffect(() => {
    setSiteUrl(window.location.origin);
  }, []);
  // Fetch post by slug (public, no auth required)
  const rawPost = useQuery(api.posts.queries.getPublished, { slug });
  // Fetch taxonomies for this post (only when post is loaded)
  const taxonomies = useQuery(
    api.taxonomies.queries.getByPost,
    rawPost?._id ? { postId: rawPost._id as Id<"posts"> } : "skip",
  );
  // Fetch author profile for AuthorBox (only when post is loaded)
  const authorProfile = useQuery(
    api.profiles.queries.getUserBySlug,
    rawPost?.author?.slug ? { slug: rawPost.author.slug } : "skip",
  );
  // Fetch per-post SEO metadata (only when post is loaded)
  const postSeoData = useQuery(
    api.seo.queries.getPostSeo,
    rawPost?._id ? { postId: rawPost._id as Id<"posts"> } : "skip",
  );
  // Fetch global SEO settings (for title templates, social defaults, schema config)
  const seoSettings = useQuery(api.seo.queries.getSettings, {});
  // Fetch related posts (only when post is loaded)
  const relatedPostsRaw = useQuery(
    api.posts.queries.getRelatedPosts,
    rawPost?._id ? { postId: rawPost._id as Id<"posts">, limit: 3 } : "skip",
  );
  // Fetch adjacent posts for prev/next navigation (only when post is loaded)
  const adjacentPosts = useQuery(
    api.posts.queries.getAdjacentPosts,
    rawPost?._id ? { postId: rawPost._id as Id<"posts"> } : "skip",
  );
  // Loading state
  if (rawPost === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-3 w-48" />
        <Skeleton className="aspect-video w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }
  // Not found
  if (rawPost === null) {
    return <NotFoundPage />;
  }
  // Password-protected post (content withheld)
  // Backend password verification is not yet implemented. The PasswordGate
  // component provides the UI shell ready for when the backend adds support.
  if (rawPost.isPasswordProtected) {
    return (
      <PasswordGate
        title={rawPost.title}
        onSubmit={() => {
          // TODO: When backend supports password verification, pass the
          // password to a Convex mutation/query to unlock the content.
        }}
      />
    );
  }
  // Parse block content
  // Parse block content using Zod validation
  const blockContent = rawPost.content
    ? parseTipTapDocument(rawPost.content) as BlockDocument | null
    : null;
  // Map taxonomies to typed arrays
  const categories: PostCategory[] = (taxonomies?.categories ?? []).map((cat: (typeof taxonomies.categories)[number]) => ({
    _id: cat._id,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    parentId: cat.parentId,
    count: cat.count,
    taxonomy: "category" as const,
  }));
  const tags: PostTag[] = (taxonomies?.tags ?? []).map((tag: (typeof taxonomies.tags)[number]) => ({
    _id: tag._id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description,
    count: tag.count,
    taxonomy: "tag" as const,
  }));
  // Build PostDetail
  const post: PostDetail = {
    _id: rawPost._id,
    title: rawPost.title,
    slug: rawPost.slug,
    excerpt: rawPost.excerpt,
    content: blockContent,
    featuredImageUrl: rawPost.featuredImageUrl ?? undefined,
    featuredImageAlt: rawPost.featuredImageAlt ?? undefined,
    publishedAt: rawPost.publishedAt
      ? new Date(rawPost.publishedAt).toISOString()
      : undefined,
    readingTime: estimateReadingTime(rawPost.content),
    author: {
      _id: rawPost.author?._id ?? "",
      displayName: rawPost.author?.displayName ?? "Unknown",
      slug: rawPost.author?.slug ?? "",
      avatarUrl: rawPost.author?.avatarUrl,
    },
    primaryCategory: categories[0]
      ? { _id: categories[0]._id, name: categories[0].name, slug: categories[0].slug }
      : undefined,
    commentCount: rawPost.commentCount ?? 0,
    isSticky: rawPost.isSticky ?? false,
    categories,
    tags,
    previousPost: adjacentPosts?.previous
      ? { title: adjacentPosts.previous.title, slug: adjacentPosts.previous.slug }
      : null,
    nextPost: adjacentPosts?.next
      ? { title: adjacentPosts.next.title, slug: adjacentPosts.next.slug }
      : null,
  };
  // Build author data for AuthorBox
  const authorData: AuthorData = {
    _id: post.author._id,
    displayName: post.author.displayName,
    slug: post.author.slug,
    avatarUrl: post.author.avatarUrl,
    bio: authorProfile?.bio ?? undefined,
    websiteUrl: authorProfile?.url ?? undefined,
  };
  // Build share URL (siteUrl is already set via useEffect for SSR safety)
  const shareUrl = siteUrl ? `${siteUrl}/blog/${slug}` : `/blog/${slug}`;
  // ── SEO Resolution ──────────────────────────────────────────────────────
  // Resolve SEO data using the fallback chain when all queries have loaded.
  // While loading, use a sensible fallback based on the post title.
  const resolvedSeo = (postSeoData && seoSettings && siteUrl)
    ? resolvePostSeoFromQueries(
        {
          title: post.title,
          slug: post.slug,
          type: "post",
          excerpt: post.excerpt,
          content: rawPost.content,
          featuredImageUrl: post.featuredImageUrl,
          publishedAt: post.publishedAt,
        },
        postSeoData as PostSeoData,
        seoSettings as unknown as SeoSettings,
        siteUrl,
      )
    : createFallbackSeo(post.title, siteUrl || `/blog/${slug}`);
  // Build JSON-LD structured data graph for the article
  const jsonLdGraph = (postSeoData && seoSettings && siteUrl)
    ? buildArticleJsonLd(
        {
          title: post.title,
          slug: post.slug,
          type: "post",
          excerpt: post.excerpt,
          content: rawPost.content,
          featuredImageUrl: post.featuredImageUrl,
          publishedAt: post.publishedAt,
        },
        resolvedSeo,
        seoSettings as unknown as SeoSettings,
        siteUrl,
        {
          name: post.author.displayName,
          url: `${siteUrl}/author/${post.author.slug}`,
          imageUrl: post.author.avatarUrl,
        },
      )
    : undefined;
  // Map related posts from query to PostCardType[] for the RelatedPosts component
  const relatedPosts: PostCardType[] = (relatedPostsRaw ?? []).map((rp: NonNullable<typeof relatedPostsRaw>[number]) => ({
    _id: rp._id,
    title: rp.title,
    slug: rp.slug,
    excerpt: rp.excerpt || undefined,
    featuredImageUrl: undefined, // Related posts query returns featuredImageId, not URL
    publishedAt: rp.publishedAt
      ? new Date(rp.publishedAt).toISOString()
      : undefined,
    author: {
      _id: "",
      displayName: "",
      slug: "",
    },
    commentCount: 0,
    readingTime: undefined,
  }));
  return (
    <article
      data-slot="single-post"
      className="mx-auto flex max-w-3xl flex-col gap-8"
    >
      {/* SEO Meta Tags + JSON-LD */}
      <SeoHead
        seo={resolvedSeo}
        siteUrl={siteUrl || `/blog/${slug}`}
        jsonLdGraph={jsonLdGraph}
      />
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
      {/* Content */}
      <PostContent content={post.content} />
      {/* Footer (tags, share, nav) */}
      <PostFooter
        tags={post.tags}
        shareUrl={shareUrl}
        shareTitle={post.title}
        previousPost={post.previousPost}
        nextPost={post.nextPost}
      />
      {/* Author Box */}
      <AuthorBox author={authorData} />
      {/* Related Posts */}
      <RelatedPosts posts={relatedPosts} />
      {/* Comment Section */}
      <CommentSection
        postId={post._id}
        commentStatus={rawPost.commentStatus ?? "open"}
        isLoggedIn={!!isSignedIn}
        currentUserId={userId ?? undefined}
      />
    </article>
  );
}
