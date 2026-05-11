/**
 * REFERENCE — Admin list route (Layer 4)
 *
 * Example uses the "events" extension.
 *
 * Path in real code:
 *   apps/web/src/routes/_authenticated/_admin/events/index.tsx
 *
 * What this reference demonstrates:
 *   1. createFileRoute under the _authenticated/_admin layout group
 *   2. PluginGuard wrapping the route for fail-closed when disabled
 *   3. Capability check (useCan) for conditional UI
 *   4. Cached query via convex-helpers/react/cache
 *   5. Standard list-table primitives composition pattern
 *   6. No popups for content management — Add New / Edit are full-page
 *      navigations to separate routes
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { Plus, Calendar } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { useCan } from "@/hooks/useCan";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/_admin/events/")({
	component: EventsListPage,
});

function EventsListPage() {
	return (
		// PluginGuard is non-negotiable for toggleable extensions. When the
		// "events" plugin is disabled in /plugins, this fails closed and
		// renders the kit's standard "extension disabled" state.
		<PluginGuard pluginId="events">
			<EventsListContent />
		</PluginGuard>
	);
}

function EventsListContent() {
	const navigate = useNavigate();
	const canCreate = useCan("event.create");

	// Cached, paginated query. The convex-helpers cache keeps the data
	// stable across route transitions.
	const result = useQuery(api.events.queries.list, {
		paginationOpts: { numItems: 20, cursor: null },
	});

	if (result === undefined) return <ListSkeleton />;

	const events = result.page;

	return (
		<div className="flex flex-col gap-6 p-6">
			{/* Page header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
						<Calendar className="size-5 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold text-foreground">
							Events
						</h1>
						<p className="text-sm text-muted-foreground">
							Manage events, dates, and venues.
						</p>
					</div>
				</div>

				{/* Add New is full-page navigation. Per the kit standard,
				    no modal-based content creation. */}
				{canCreate ? (
					<Button onClick={() => navigate({ to: "/events/new" })}>
						<Plus className="size-4" data-icon="inline-start" />
						Add New
					</Button>
				) : null}
			</div>

			{/* List */}
			{events.length === 0 ? (
				<EmptyState canCreate={canCreate} onCreate={() => navigate({ to: "/events/new" })} />
			) : (
				<div className="rounded-lg border border-border overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-muted/50">
							<tr className="text-left text-xs text-muted-foreground">
								<th className="px-3 py-2 font-medium">Title</th>
								<th className="px-3 py-2 font-medium">Starts</th>
								<th className="px-3 py-2 font-medium">Venue</th>
								<th className="px-3 py-2 font-medium">Status</th>
								<th className="px-3 py-2 font-medium" aria-label="actions" />
							</tr>
						</thead>
						<tbody>
							{events.map((evt) => (
								<tr key={evt._id} className="border-t border-border">
									<td className="px-3 py-2 font-medium text-foreground">
										<Link
											to="/events/$eventId/edit"
											params={{ eventId: evt._id }}
											className="hover:underline"
										>
											{evt.title}
										</Link>
									</td>
									<td className="px-3 py-2 text-muted-foreground">
										{new Date(evt.startsAt).toLocaleDateString()}
									</td>
									<td className="px-3 py-2 text-muted-foreground">
										{evt.venue ?? "—"}
									</td>
									<td className="px-3 py-2">
										<StatusBadge status={evt.status} />
									</td>
									<td className="px-3 py-2 text-right text-muted-foreground">
										<Link
											to="/events/$eventId/edit"
											params={{ eventId: evt._id }}
											className="text-xs hover:underline"
										>
											Edit
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function StatusBadge({ status }: { status: string }) {
	// Status-driven color via CSS variables — never hardcoded color names.
	const tone =
		status === "published"
			? "bg-primary/10 text-primary"
			: status === "scheduled"
				? "bg-muted text-foreground"
				: status === "archived"
					? "bg-muted/50 text-muted-foreground"
					: "bg-muted text-muted-foreground";

	return (
		<span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
			{status}
		</span>
	);
}

function EmptyState({
	canCreate,
	onCreate,
}: {
	canCreate: boolean;
	onCreate: () => void;
}) {
	return (
		<div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
			<Calendar className="mx-auto mb-3 size-8 text-muted-foreground/40" />
			<p className="text-sm font-medium text-foreground">No events yet.</p>
			<p className="mt-1 text-xs text-muted-foreground">
				Create your first event to get started.
			</p>
			{canCreate ? (
				<Button variant="outline" size="sm" onClick={onCreate} className="mt-4">
					<Plus className="size-3.5" data-icon="inline-start" />
					Create Event
				</Button>
			) : null}
		</div>
	);
}

function ListSkeleton() {
	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="flex items-center justify-between">
				<Skeleton className="h-10 w-48" />
				<Skeleton className="h-9 w-32" />
			</div>
			<div className="rounded-lg border border-border overflow-hidden">
				{[0, 1, 2, 3].map((i) => (
					<div key={i} className="border-t border-border p-3 first:border-t-0">
						<Skeleton className="h-4 w-3/4" />
					</div>
				))}
			</div>
		</div>
	);
}
