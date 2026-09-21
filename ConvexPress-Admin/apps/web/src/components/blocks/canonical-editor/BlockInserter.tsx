import { useId, useMemo, useRef, useState } from "react";

export interface InserterBlock {
	name: string;
	title: string;
	category?: string;
	description?: string;
	keywords?: readonly string[];
	thumbnail?: string;
}
const categoryLabels: Record<string, string> = {
	text: "Text & editorial",
	layout: "Layout",
	media: "Images & media",
	openers: "Opening sections",
	marketing: "Marketing",
	social: "Social",
	commerce: "Commerce",
	discovery: "Content discovery",
	forms: "Forms",
	plugin: "Plugin content",
	site: "Site essentials",
};
export function filterInserterBlocks(
	blocks: readonly InserterBlock[],
	search: string,
	category: string,
) {
	const words = search.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
	return blocks.filter(
		(block) =>
			(category === "all" || block.category === category) &&
			words.every((word) =>
				`${block.title} ${block.name} ${block.description ?? ""} ${(block.keywords ?? []).join(" ")}`
					.toLocaleLowerCase()
					.includes(word),
			),
	);
}
/** Uses only the current authorized catalog; screenshots are visual examples, never insertion payloads. */
export function BlockInserter({
	blocks,
	selected,
	onSelect,
	disabled,
}: {
	blocks: readonly InserterBlock[];
	selected: string;
	onSelect(name: string): void;
	disabled: boolean;
}) {
	const id = useId(),
		[search, setSearch] = useState(""),
		[category, setCategory] = useState("all"),
		[limit, setLimit] = useState(24);
	const disclosure = useRef<HTMLDetailsElement>(null),
		searchField = useRef<HTMLInputElement>(null);
	const chosen = blocks.find((b) => b.name === selected);
	const categories = useMemo(
		() =>
			[
				...new Set(
					blocks.map((b) => b.category).filter((v): v is string => !!v),
				),
			].sort((a, b) =>
				(categoryLabels[a] ?? a).localeCompare(categoryLabels[b] ?? b),
			),
		[blocks],
	);
	const visible = filterInserterBlocks(
		blocks,
		search,
		categories.includes(category) ? category : "all",
	);
	return (
		<details
			ref={disclosure}
			className="group w-full rounded-lg border border-border bg-card"
			onToggle={(e) => {
				if (e.currentTarget.open) searchField.current?.focus();
			}}
		>
			<summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm focus-visible:outline focus-visible:outline-ring">
				<span className="font-medium">Browse blocks</span>
				<span className="truncate text-muted-foreground">
					{chosen?.title ?? `${blocks.length} available`}
				</span>
				<span
					aria-hidden="true"
					className="text-muted-foreground group-open:rotate-45"
				>
					+
				</span>
			</summary>
			<div className="border-t border-border p-4">
				<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
					<label
						className="grid gap-1 text-xs font-medium"
						htmlFor={`${id}-search`}
					>
						Find a block
						<input
							ref={searchField}
							id={`${id}-search`}
							type="search"
							value={search}
							maxLength={150}
							placeholder="Search by name or purpose"
							onChange={(e) => {
								setSearch(e.target.value);
								setLimit(24);
							}}
							className="min-h-11 min-w-0 rounded-md border border-border bg-background px-3 text-sm font-normal focus-visible:outline focus-visible:outline-ring"
						/>
					</label>
					<label
						className="grid gap-1 text-xs font-medium"
						htmlFor={`${id}-category`}
					>
						Category
						<select
							id={`${id}-category`}
							value={categories.includes(category) ? category : "all"}
							onChange={(e) => {
								setCategory(e.target.value);
								setLimit(24);
							}}
							className="min-h-11 rounded-md border border-border bg-background px-3 text-sm font-normal"
						>
							<option value="all">All categories</option>
							{categories.map((c) => (
								<option key={c} value={c}>
									{categoryLabels[c] ?? c}
								</option>
							))}
						</select>
					</label>
				</div>
				<div className="my-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
					<p role="status">
						{visible.length} {visible.length === 1 ? "block" : "blocks"}
					</p>
					{(search || category !== "all") && (
						<button
							type="button"
							onClick={() => {
								setSearch("");
								setCategory("all");
								setLimit(24);
							}}
							className="min-h-8 underline underline-offset-4"
						>
							Clear filters
						</button>
					)}
				</div>
				<div
					className="max-h-[28rem] overflow-y-auto overscroll-contain p-1"
					role="region"
					aria-label="Available blocks"
					tabIndex={0}
				>
					{visible.length === 0 ? (
						<p className="py-10 text-center text-sm text-muted-foreground">
							No blocks match these filters.
						</p>
					) : (
						<ul className="grid grid-cols-2 gap-3">
							{visible.slice(0, limit).map((block) => (
								<li key={block.name}>
									<button
										type="button"
										disabled={disabled}
										aria-label={`Choose ${block.title}`}
										aria-pressed={selected === block.name}
										onClick={() => onSelect(block.name)}
										className="group/block flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-background text-left transition-colors hover:border-primary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary disabled:opacity-50"
									>
										<div
											className="relative flex aspect-[5/3] w-full items-center justify-center overflow-hidden border-b border-border bg-muted/30"
											aria-hidden="true"
										>
											<span className="px-3 text-center text-xs text-muted-foreground">
												{categoryLabels[block.category ?? ""] ?? "Block"}
											</span>
											{block.thumbnail && (
												<img
													src={block.thumbnail}
													alt=""
													loading="lazy"
													decoding="async"
													onError={(e) => {
														e.currentTarget.style.visibility = "hidden";
													}}
													className="absolute inset-0 h-full w-full object-cover object-top"
												/>
											)}
										</div>
										<span className="block p-3">
											<span className="block text-sm font-medium">
												{block.title}
											</span>
											{block.description && (
												<span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
													{block.description}
												</span>
											)}
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
					{visible.length > limit && (
						<button
							type="button"
							onClick={() => setLimit((n) => n + 24)}
							className="mt-3 min-h-11 w-full rounded-md border border-border text-sm"
						>
							Show more blocks
						</button>
					)}
				</div>
				<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
					Previews show example content in your template. Add a block, then make
					it yours.
				</p>
			</div>
		</details>
	);
}
