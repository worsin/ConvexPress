/**
 * REFERENCE — Archive template (list/index of posts)
 *
 * Read by `design:archive`. Not part of the production build.
 *
 * Covers: /blog (post index), /category/$slug, /tag/$slug, /author/$slug.
 * The same skill targets all four — the data source changes, the shape
 * stays the same.
 *
 * What this reference demonstrates:
 *   1. Paginated query with cursor
 *   2. PostCard grid composition
 *   3. Filter/category pill row (optional)
 *   4. Pagination controls (cursor-based)
 *   5. Empty state when no posts exist
 */

import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/blog/")({
	loader: async ({ context: { queryClient } }) => {
		await Promise.all([
			queryClient.ensureQueryData(convexQuery(api.settings.queries.getBySection, { section: "brand" })),
			queryClient.ensureQueryData(
				convexQuery(api.posts.queries.listPublished, { paginationOpts: { numItems: 12, cursor: null } }),
			),
		]);
	},

	head: () => ({
		meta: [
			{ title: "Blog" },
			{ name: "description", content: "All posts." },
			{ property: "og:type", content: "website" },
		],
		links: [{ rel: "canonical", href: "/blog" }],
	}),

	component: BlogIndex,
});

// ─── Component ────────────────────────────────────────────────────────────────

function BlogIndex() {
	const { data: result } = useTanStackQuery(
		convexQuery(api.posts.queries.listPublished, { paginationOpts: { numItems: 12, cursor: null } }),
	);

	if (result === undefined) {
		return <ArchiveSkeleton />;
	}

	const posts = result?.page ?? [];

	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 md:py-16">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
					Blog
				</h1>
				<p className="text-muted-foreground">Notes, essays, and posts.</p>
			</header>

			{posts.length === 0 ? (
				<EmptyState />
			) : (
				<ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{posts.map((post) => (
						<li key={post._id}>
							<PostCard post={post} />
						</li>
					))}
				</ul>
			)}

			{/* Cursor-based pagination. Real implementation should track cursor
			    state and call queryClient.fetchQuery with the next cursor on
			    "Load more". Pattern shown statically here. */}
			{result?.continueCursor ? (
				<div className="flex justify-center">
					<button
						type="button"
						className={cn(
							"rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground",
							"hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
					>
						Load more
					</button>
				</div>
			) : null}
		</main>
	);
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function PostCard({ post }: { post: any }) {
	return (
		<article className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/50">
			{post.featuredImageUrl ? (
				<img
					src={post.featuredImageUrl}
					alt={post.featuredImageAlt ?? ""}
					width={640}
					height={360}
					loading="lazy"
					className="aspect-video w-full rounded-md object-cover"
				/>
			) : null}
			<h2 className="text-lg font-medium text-card-foreground">
				<Link to="/blog/$slug" params={{ slug: post.slug }} className="hover:underline">
					{post.title}
				</Link>
			</h2>
			{post.excerpt ? (
				<p className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>
			) : null}
		</article>
	);
}

// ─── Empty / Skeleton ────────────────────────────────────────────────────────

function EmptyState() {
	return (
		<div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
			<p className="text-base font-medium text-foreground">No posts yet.</p>
			<p className="mt-1 text-sm text-muted-foreground">Posts you publish in the admin will appear here.</p>
		</div>
	);
}

function ArchiveSkeleton() {
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12">
			<Skeleton className="h-10 w-32" />
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<div key={i} className="flex flex-col gap-3 rounded-lg border border-border p-5">
						<Skeleton className="aspect-video w-full" />
						<Skeleton className="h-5 w-3/4" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
					</div>
				))}
			</div>
		</main>
	);
}
