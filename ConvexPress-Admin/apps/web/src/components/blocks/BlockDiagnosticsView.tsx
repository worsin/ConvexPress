import { useState } from "react";
import { rendererCoverage } from "../../../../../../blocks/.generated/renderer-coverage";
import { dependencyDescriptors } from "../../../../../../blocks/.generated/metadata";
import thumbnails from "./canonical-editor/block-thumbnails.generated.json";
import {
	summarizeUsage,
	usageProgressLabel,
	type UsageLoadStatus,
} from "@/lib/blocks/usage";
import {
	diagnosticUsageStatus,
	diagnosisLabel,
	insertionReasons,
	type DiagnosticDocument,
	type DiagnosticReadiness,
} from "@/lib/blocks/diagnostics";
const inputClass =
	"min-h-11 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline focus-visible:outline-ring";
export function BlockDiagnosticsView({
	documents,
	status,
	readiness,
	syncedStatus,
	loadMore,
}: {
	documents: readonly DiagnosticDocument[];
	status: Exclude<UsageLoadStatus, "Incomplete">;
	readiness?: DiagnosticReadiness;
	syncedStatus?: string;
	loadMore: () => void;
}) {
	const [packId, setPackId] = useState<string | null>(null),
		[query, setQuery] = useState(""),
		[filter, setFilter] = useState("attention");
	const pack = rendererCoverage.find(
		(item) => item.id === (packId ?? readiness?.presentation.packId),
	);
	const counts = summarizeUsage(documents).counts,
		scanStatus = diagnosticUsageStatus(status, documents);
	const issues = documents.filter(
		(doc) =>
			doc.diagnosis.state === "invalid" ||
			doc.diagnosis.state === "unsupported",
	);
	const shown = documents.filter((doc) =>
		filter === "all" || filter === "attention"
			? filter === "all" ||
				doc.diagnosis.state === "invalid" ||
				doc.diagnosis.state === "unsupported"
			: doc.diagnosis.state === filter,
	);
	return (
		<div className="space-y-6 p-6">
			<header className="space-y-2">
				<a
					href="#/pages/blocks"
					className="text-sm underline underline-offset-4"
				>
					Back to blocks
				</a>
				<h1 className="text-2xl font-semibold">Block diagnostics</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">
					Inspect template support, insertion availability, and saved content
					you can edit. Checks do not change your website.
				</p>
			</header>
			<section
				aria-label="Site readiness"
				className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5"
			>
				<div>
					<h2 className="font-medium">Current site</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{readiness
							? `Active template: ${rendererCoverage.find((item) => item.id === readiness.presentation.packId)?.title ?? readiness.presentation.packId}`
							: "Checking the active template…"}
					</p>
				</div>
				<div>
					<h3 className="text-sm font-medium">Reusable content</h3>
					<p className="mt-1 text-sm text-muted-foreground" role="status">
						{syncedStatus === "ready"
							? "Page dependencies verified"
							: syncedStatus
								? "Verification required before insertion"
								: "Checking page dependencies…"}
					</p>
					{syncedStatus && syncedStatus !== "ready" && (
						<a
							href="#/synced-content"
							className="mt-2 inline-block text-sm underline underline-offset-4"
						>
							Review reusable content
						</a>
					)}
				</div>
			</section>
			<section
				aria-label="Template coverage"
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<div>
					<h2 className="font-medium">Template coverage</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Installed renderer coverage. Visual quality, live data, and
						interactions require separate verification.
					</p>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<caption className="sr-only">
							Installed block renderers by template
						</caption>
						<thead>
							<tr className="border-b border-border">
								{[
									"Template",
									"Supported",
									"Template renderers",
									"Shared renderers",
									"Missing",
								].map((label) => (
									<th key={label} scope="col" className="p-3 font-medium">
										{label}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rendererCoverage.map((item) => (
								<tr
									key={item.id}
									className="border-b border-border last:border-0"
								>
									<th scope="row" className="p-3 font-medium">
										{item.title}
									</th>
									<td className="p-3">
										{
											item.blocks.filter(
												(block) => block.renderer !== "missing",
											).length
										}{" "}
										/ {item.blocks.length}
									</td>
									<td className="p-3">
										{
											item.blocks.filter((block) => block.renderer === "owned")
												.length
										}
									</td>
									<td className="p-3">
										{
											item.blocks.filter(
												(block) => block.renderer === "library",
											).length
										}
									</td>
									<td className="p-3">
										{
											item.blocks.filter(
												(block) => block.renderer === "missing",
											).length
										}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<div className="flex flex-wrap gap-3">
					<label className="space-y-1 text-sm">
						<span className="block">Inspect template</span>
						<select
							aria-label="Inspect template"
							className={inputClass}
							value={pack?.id ?? ""}
							onChange={(event) => setPackId(event.target.value)}
						>
							<option value="" disabled>
								Choose a template
							</option>
							{rendererCoverage.map((item) => (
								<option key={item.id} value={item.id}>
									{item.title}
								</option>
							))}
						</select>
					</label>
					<label className="flex-1 space-y-1 text-sm">
						<span className="block">Find a block</span>
						<input
							type="search"
							className={`${inputClass} w-full`}
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
					</label>
				</div>
				{pack ? (
					<div className="max-h-96 overflow-auto rounded-lg border border-border">
						<table className="w-full text-left text-sm">
							<caption className="sr-only">
								Block support and usage for {pack.title}
							</caption>
							<thead className="sticky top-0 bg-card">
								<tr>
									{[
										"Block",
										"Renderer",
										"Preview",
										"New insertion",
										"Editable documents",
									].map((label) => (
										<th key={label} scope="col" className="p-3 font-medium">
											{label}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{pack.blocks
									.filter((block) =>
										`${block.title} ${block.name}`
											.toLowerCase()
											.includes(query.toLowerCase().trim()),
									)
									.map((block) => {
										const descriptor =
											dependencyDescriptors[
												block.name as keyof typeof dependencyDescriptors
											];
										const reasons = insertionReasons(
											block.name,
											block.hidden,
											descriptor?.requires ?? { plugins: [], capabilities: [] },
											readiness,
											syncedStatus,
										);
										if (block.renderer === "missing")
											reasons.push("Renderer missing");
										const preview =
											thumbnails[block.name as keyof typeof thumbnails]
												?.previews;
										return (
											<tr key={block.name} className="border-t border-border">
												<th scope="row" className="p-3 font-normal">
													<span className="block font-medium">
														{block.title}
													</span>
													<span className="text-xs text-muted-foreground">
														{block.name}
													</span>
												</th>
												<td className="p-3">
													{block.renderer === "owned"
														? "Template"
														: block.renderer === "library"
															? "Shared"
															: "Missing"}
												</td>
												<td className="p-3">
													{preview && Object.hasOwn(preview, pack.id)
														? "Available"
														: "Missing"}
												</td>
												<td className="p-3">
													{reasons.join(" · ") || "Available"}
												</td>
												<td className="p-3">
													{status === "LoadingFirstPage"
														? "Checking…"
														: `${scanStatus === "Exhausted" ? "" : "At least "}${counts.get(block.name) ?? 0}`}
												</td>
											</tr>
										);
									})}
							</tbody>
						</table>
						{!pack.blocks.some((block) =>
							`${block.title} ${block.name}`
								.toLowerCase()
								.includes(query.toLowerCase().trim()),
						) && (
							<p className="p-4 text-sm text-muted-foreground">
								No blocks match this search.
							</p>
						)}
					</div>
				) : (
					<p role="status" className="text-sm text-muted-foreground">
						Select an installed template to inspect its blocks.
					</p>
				)}
			</section>
			<section
				aria-label="Saved document checks"
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<div>
					<h2 className="font-medium">Saved document checks</h2>
					<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
						Canonical checks validate stored structure and exact
						custom-definition snapshots. They do not check resource availability
						or publication approval. Legacy documents need migration review.
						Usage counts stored block references, not expanded reusable
						sections.
					</p>
				</div>
				<p role="status" className="text-sm">
					{usageProgressLabel(documents.length, scanStatus)}{" "}
					{status !== "LoadingFirstPage" &&
						`${issues.length} ${status === "Exhausted" ? "documents need attention." : "documents need attention so far."}`}
				</p>
				<label className="block space-y-1 text-sm">
					<span className="block">Show documents</span>
					<select
						aria-label="Show documents"
						className={inputClass}
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
					>
						<option value="attention">Needs attention</option>
						<option value="legacy">Legacy documents</option>
						<option value="valid">Structure valid</option>
						<option value="all">All checked documents</option>
					</select>
				</label>
				<ul className="divide-y divide-border">
					{shown.map((doc) => (
						<li
							key={doc._id}
							className="flex flex-wrap items-center justify-between gap-3 py-3"
						>
							<div>
								<a
									href={`#/${doc.type === "page" ? "pages" : "posts"}/${encodeURIComponent(doc._id)}/edit`}
									className="text-sm font-medium underline underline-offset-4"
								>
									{doc.title || "Untitled"}
								</a>
								<p className="mt-1 text-sm text-muted-foreground">
									{diagnosisLabel(doc.diagnosis.state)}
									{doc.diagnosis.issue &&
										` · First issue: ${doc.diagnosis.issue.path}`}
									{!doc.diagnosis.usageComplete && " · Usage incomplete"}
								</p>
							</div>
							<span className="text-xs text-muted-foreground">
								{doc.status}
							</span>
						</li>
					))}
				</ul>
				{!shown.length && status !== "LoadingFirstPage" && (
					<p className="text-sm text-muted-foreground">
						No matching documents in the checked results.
					</p>
				)}
				{status !== "Exhausted" && (
					<button
						type="button"
						disabled={status !== "CanLoadMore"}
						onClick={loadMore}
						className={`${inputClass} disabled:opacity-50`}
					>
						{status === "LoadingMore"
							? "Checking more documents…"
							: "Check more documents"}
					</button>
				)}
			</section>
		</div>
	);
}
