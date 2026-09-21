import { useConvex, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { useVerifiedSiteRuntime } from "@/control/SiteRuntimeProvider";
import { BlockDiagnosticsView } from "./BlockDiagnosticsView";
export function BlockDiagnostics() {
	const { can, isLoading, user } = useAuth(),
		runtime = useVerifiedSiteRuntime(),
		client = useConvex();
	if (isLoading)
		return (
			<p role="status" className="p-6">
				Checking access…
			</p>
		);
	if (!can("manage_options"))
		return (
			<p role="alert" className="p-6">
				You do not have permission to inspect block diagnostics.
			</p>
		);
	if (!runtime?.target.websiteKey)
		return (
			<p role="status" className="p-6">
				Select a website environment to inspect its blocks.
			</p>
		);
	return (
		<Diagnostics key={`${client.url}:${user?._id}:${runtime.generation}`} />
	);
}
function Diagnostics() {
	const documents = usePaginatedQuery(
		api.blocks.diagnostics.documents,
		{},
		{ initialNumItems: 25 },
	);
	const readiness = useQuery(api.blocks.diagnostics.readiness, {});
	const index = useQuery(api.syncedBlocks.consumerIndex.status, {});
	return (
		<BlockDiagnosticsView
			documents={documents.results}
			status={documents.status}
			readiness={readiness}
			syncedStatus={index?.status}
			loadMore={() => documents.loadMore(25)}
		/>
	);
}
