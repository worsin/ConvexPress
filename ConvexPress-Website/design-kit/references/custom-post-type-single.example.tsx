/**
 * REFERENCE — Custom Post Type single
 *
 * Read by `design:custom-post-type`. Not part of the production build.
 *
 * Example uses a hypothetical "caseStudies" CPT. Substitute names for
 * your actual CPT.
 *
 * What this reference demonstrates (unique to CPT singles):
 *   1. Zod-validated `slug` param
 *   2. Pulling getBySlug from a CPT-specific Convex namespace
 *   3. JSON-LD typed for the CPT (CreativeWork / Article / Event etc.)
 *   4. CPT-specific structured fields (e.g., outcome metrics on case
 *      studies, dates on events, role on team members)
 *
 * Substitute everywhere you see:
 *   api.caseStudies.queries.getBySlug → api.<cpt>.queries.getBySlug
 *   "/case-studies/$slug"             → "/<plural-slug>/$slug"
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

export const Route = createFileRoute("/_marketing/case-studies/$slug")({
	params: { parse: (raw) => paramsSchema.parse(raw) },

	loader: async ({ context: { queryClient }, params: { slug } }) => {
		await Promise.all([
			queryClient.ensureQueryData(
				convexQuery(api.settings.queries.getBySection, { section: "brand" }),
			),
			queryClient.ensureQueryData(
				// NOTE: substitute api.<cpt>.queries.getBySlug for your CPT
				convexQuery(api.posts.queries.getPublished, { slug }),
			),
		]);
	},

	head: ({ params }) => ({
		meta: [
			{ title: `${params.slug} — Case Studies` },
			{ name: "description", content: "A customer success story." },
			{ property: "og:type", content: "article" },
		],
		links: [{ rel: "canonical", href: `/case-studies/${params.slug}` }],
	}),

	component: CaseStudyDetail,
});

// ─── Component ────────────────────────────────────────────────────────────────

function CaseStudyDetail() {
	const { slug } = Route.useParams();
	const { data: item } = useTanStackQuery(
		// NOTE: substitute api.<cpt>.queries.getBySlug for your CPT
		convexQuery(api.posts.queries.getPublished, { slug }),
	);

	if (item === undefined) return <DetailSkeleton />;
	if (item === null) throw notFound();

	return (
		<article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 md:py-16">
			<header className="flex flex-col gap-4">
				{/* CPT-specific eyebrow.
				    Case studies → industry. Events → date+venue.
				    Team members → role+department. */}
				{item.categories && item.categories.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{item.categories.map((cat: any) => (
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
					{item.title}
				</h1>

				{item.excerpt ? (
					<p className="text-lg text-muted-foreground">{item.excerpt}</p>
				) : null}
			</header>

			{item.featuredImageUrl ? (
				<img
					src={item.featuredImageUrl}
					alt={item.featuredImageAlt ?? ""}
					width={1200}
					height={630}
					className="aspect-[1200/630] w-full rounded-lg object-cover"
				/>
			) : null}

			{/* CPT-specific structured fields.
			    Adapt per CPT:
			      - Case studies → metric tiles ("3x ROI", "60% faster onboarding")
			      - Events       → date / time / venue / register CTA
			      - Team members → social links / contact
			      - Locations    → address / hours / map embed */}
			<section
				aria-label="At a glance"
				className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-3"
			>
				<div>
					<div className="text-xs uppercase tracking-wide text-muted-foreground">
						Industry
					</div>
					<div className="mt-1 text-base font-medium text-card-foreground">
						—
					</div>
				</div>
				<div>
					<div className="text-xs uppercase tracking-wide text-muted-foreground">
						Team size
					</div>
					<div className="mt-1 text-base font-medium text-card-foreground">
						—
					</div>
				</div>
				<div>
					<div className="text-xs uppercase tracking-wide text-muted-foreground">
						Outcome
					</div>
					<div className="mt-1 text-base font-medium text-card-foreground">
						—
					</div>
				</div>
			</section>

			<div
				className={cn(
					"prose prose-neutral max-w-none",
					"prose-headings:text-foreground prose-headings:tracking-tight",
					"prose-p:text-foreground prose-a:text-primary",
				)}
				dangerouslySetInnerHTML={{ __html: item.contentHtml ?? "" }}
			/>
		</article>
	);
}

function DetailSkeleton() {
	return (
		<article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
			<Skeleton className="h-6 w-24" />
			<Skeleton className="h-10 w-3/4" />
			<Skeleton className="h-5 w-1/2" />
			<Skeleton className="aspect-[1200/630] w-full" />
			<Skeleton className="h-32 w-full" />
			<div className="space-y-3">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-4/5" />
			</div>
		</article>
	);
}
