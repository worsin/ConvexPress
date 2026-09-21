export interface UsageDocument {
	_id: string;
	title: string;
	slug: string;
	type: "page" | "post";
	status: string;
	updatedAt?: number;
	blockNames: readonly string[];
}
export type UsageLoadStatus =
	| "LoadingFirstPage"
	| "CanLoadMore"
	| "LoadingMore"
	| "Incomplete"
	| "Exhausted";
/** Recompute from the current reactive pages. Never append old counts across refreshes. */
export function summarizeUsage(rows: readonly UsageDocument[]) {
	const documents = [
		...new Map(rows.map((row) => [row._id, row])).values(),
	].sort(
		(a, b) =>
			(b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a._id.localeCompare(b._id),
	);
	const counts = new Map<string, number>();
	for (const doc of documents)
		for (const name of new Set(doc.blockNames))
			counts.set(name, (counts.get(name) ?? 0) + 1);
	return { documents, counts };
}
export function usageLabel(count: number, status: UsageLoadStatus) {
	if (status === "LoadingFirstPage") return "Checking document usage…";
	if (status === "Exhausted")
		return `Used on ${count} document${count === 1 ? "" : "s"}.`;
	return count
		? `Used on at least ${count} document${count === 1 ? "" : "s"} (partial).`
		: "No matching documents in the loaded results (partial).";
}
export function usageProgressLabel(loaded: number, status: UsageLoadStatus) {
	if (status === "Incomplete")
		return `Usage is incomplete: ${loaded} editable documents checked, but some stored block trees need repair. Open block diagnostics for details.`;
	if (status === "LoadingFirstPage")
		return "Loading the first page of document usage…";
	return status === "Exhausted"
		? `Usage scan complete: ${loaded} content documents checked.`
		: `Partial usage: ${loaded} content documents checked. ${status === "LoadingMore" ? "Loading more…" : "Load more to finish the scan."}`;
}
