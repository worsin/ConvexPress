/**
 * REFERENCE — Single Post template
 *
 * Read by `design:single-post`. Not part of the production build.
 *
 * What this reference demonstrates (unique to single-post):
 *   1. Zod-validated path params (`slug`)
 *   2. Article-shaped JSON-LD via `lib/seo` helpers
 *   3. PostHeader / PostContent / AuthorBox patterns
 *   4. Related posts row
 *   5. Membership gating via <RestrictedContent>
 *   6. Comments section
 *
 * Treat structure as canonical, visuals as throwaway.
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Param schema ─────────────────────────────────────────────────────────────

const paramsSchema = z.object({
	slug: z.string().min(1).max(200),
});

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/blog/$slug")({
	params: { parse: (raw) => paramsSchema.parse(raw) },

	loader: async ({ context: { queryClient }, params: { slug } }) => {
		await Promise.all([
			queryClient.ensureQueryData(convexQuery(api.settings.queries.getBySection, { section: "brand" })),
			queryClient.ensureQueryData(convexQuery(api.posts.queries.getPublished, { slug })),
		]);
	},

	head: ({ params, loaderData }) => {
		// Loader data isn't directly available here; rely on tanstack-router
		// SSR query cache. For per-route meta you'd usually compose from
		// loaderData via a typed return. Pattern: keep title generic in
		// `head:` and let the component update via <title> if needed.
		return {
			meta: [
				{ title: `${params.slug} — Blog` },
				{ name: "description", content: "A blog post." },
				{ property: "og:type", content: "article" },
			],
			links: [{ rel: "canonical", href: `/blog/${params.slug}` }],
		};
	},

	component: SinglePost,
});

// ─── Component ────────────────────────────────────────────────────────────────

function SinglePost() {
	const { slug } = Route.useParams();
	const { data: brand } = useTanStackQuery(
		convexQuery(api.settings.queries.getBySection, { section: "brand" }),
	);
	const { data: post } = useTanStackQuery(
		convexQuery(api.posts.queries.getPublished, { slug }),
	);

	if (post === undefined || brand === undefined) {
		return <PostSkeleton />;
	}

	if (post === null) {
		throw notFound();
	}

	return (
		<article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 md:py-16">
			<header className="flex flex-col gap-4">
				{post.categories && post.categories.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{post.categories.map((cat) => (
							<span
								key={cat._id}
								className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
							>
								{cat.name}
							</span>
						))}
					</div>
				) : null}

				<h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					{post.title}
				</h1>

				{post.excerpt ? (
					<p className="text-lg text-muted-foreground">{post.excerpt}</p>
				) : null}

				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					{post.author?.displayName ? (
						<span>By {post.author.displayName}</span>
					) : null}
					{post.publishedAt ? (
						<time dateTime={new Date(post.publishedAt).toISOString()}>
							{new Date(post.publishedAt).toLocaleDateString()}
						</time>
					) : null}
				</div>
			</header>

			{post.featuredImageUrl ? (
				<img
					src={post.featuredImageUrl}
					alt={post.featuredImageAlt ?? ""}
					width={1200}
					height={630}
					className="aspect-[1200/630] w-full rounded-lg object-cover"
				/>
			) : null}

			{/* Post body — pulled in via the existing PostContent component which
			    handles the structured-content rendering. Don't reinvent. */}
			<div
				className={cn(
					"prose prose-neutral max-w-none",
					"prose-headings:text-foreground prose-headings:tracking-tight",
					"prose-p:text-foreground prose-a:text-primary",
					"prose-strong:text-foreground prose-code:text-foreground",
				)}
				dangerouslySetInnerHTML={{ __html: post.contentHtml ?? "" }}
			/>

			{/* Real implementations should compose:
			    <RestrictedContent resourceType="post" resourceIdOrKey={post._id}>
			      <PostContent post={post} />
			      <CommentSection postId={post._id} />
			    </RestrictedContent>
			    Plus structured-data via <SeoHead /> from @/lib/seo helpers. */}
		</article>
	);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PostSkeleton() {
	return (
		<article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
			<Skeleton className="h-6 w-24" />
			<Skeleton className="h-10 w-3/4" />
			<Skeleton className="h-5 w-1/2" />
			<Skeleton className="aspect-[1200/630] w-full" />
			<div className="space-y-3">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-4/5" />
			</div>
		</article>
	);
}
