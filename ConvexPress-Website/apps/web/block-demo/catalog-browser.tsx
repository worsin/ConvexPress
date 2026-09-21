import { useEffect, useMemo, useRef, useState } from "react";
import { catalogThumbnail } from "./catalog-thumbnails";

type CatalogEntry = {
	name: string;
	title: string;
	description: string;
	category: string;
	keywords: string[];
	examples: unknown[];
};
const labels: Record<string, string> = {
	openers: "Opening sections",
	layout: "Layout",
	text: "Text & editorial",
	media: "Images & media",
	marketing: "Marketing",
	commerce: "Commerce",
	forms: "Forms",
	discovery: "Content discovery",
	site: "Site essentials",
	social: "Social",
	plugin: "Plugin content",
};

export function CatalogBrowser({
	entries,
	selected,
	onSelect,
	packId,
}: {
	entries: readonly CatalogEntry[];
	selected: string;
	packId: string;
	onSelect(name: string, focus: boolean): void;
}) {
	const [category, setCategory] = useState("all");
	const [search, setSearch] = useState("");
	const results = useRef<HTMLDivElement>(null);
	useEffect(() => {
		results.current?.scrollTo({ top: 0, behavior: "instant" });
	}, [category, search]);
	const categories = useMemo(
		() =>
			[...new Set(entries.map((entry) => entry.category))].sort((a, b) =>
				(labels[a] ?? a).localeCompare(labels[b] ?? b),
			),
		[entries],
	);
	const terms = search.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
	const visible = entries
		.filter(
			(entry) =>
				(category === "all" || entry.category === category) &&
				terms.every((term) =>
					`${entry.title} ${entry.name} ${entry.description} ${entry.keywords.join(" ")}`
						.toLocaleLowerCase()
						.includes(term),
				),
		)
		.sort((a, b) => a.title.localeCompare(b.title));
	return (
		<div className="block-index" id="block-library">
			<div className="block-index-heading">
				<div>
					<p className="lab-kicker">The complete collection</p>
					<h2>
						Every block, <em>in its place.</em>
					</h2>
					<p>
						Browse by purpose. Open a study, try its examples, and see it
						through each template.
					</p>
				</div>
				<label className="block-index-search">
					Find a block
					<input
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Try pricing, gallery, or navigation"
						maxLength={150}
					/>
				</label>
			</div>
			<div className="block-index-layout">
				<nav aria-label="Block categories" className="block-categories">
					<button
						type="button"
						aria-pressed={category === "all"}
						onClick={() => setCategory("all")}
					>
						<span>All blocks</span>
						<span>{entries.length}</span>
					</button>
					{categories.map((value) => (
						<button
							key={value}
							type="button"
							aria-pressed={category === value}
							onClick={() => setCategory(value)}
						>
							<span>{labels[value] ?? value}</span>
							<span>
								{entries.filter((entry) => entry.category === value).length}
							</span>
						</button>
					))}
				</nav>
				<div className="block-index-results">
					<div className="block-index-summary">
						<p role="status">
							{visible.length} {visible.length === 1 ? "block" : "blocks"}
							{category === "all"
								? " in the library"
								: ` in ${labels[category] ?? category}`}
							{search.trim() ? ` matching “${search.trim()}”` : ""}
						</p>
						{(search || category !== "all") && (
							<button
								type="button"
								onClick={() => {
									setSearch("");
									setCategory("all");
								}}
							>
								Clear filters
							</button>
						)}
					</div>
					{visible.length ? (
						<div
							ref={results}
							className="block-index-scroll"
							role="region"
							aria-label="Block catalog results"
							tabIndex={0}
						>
							<ul className="block-index-cards">
								{visible.map((entry) => {
									const query = new URLSearchParams(window.location.search);
									query.set("block", entry.name);
									query.set(
										"example",
										String(Math.min(1, entry.examples.length - 1)),
									);
									return (
										<li key={entry.name}>
											<a
												href={`?${query}#block-study`}
												aria-current={
													selected === entry.name ? "true" : undefined
												}
												data-block-study={entry.name}
												onClick={(event) => {
													if (
														event.metaKey ||
														event.ctrlKey ||
														event.shiftKey ||
														event.altKey ||
														event.button !== 0
													)
														return;
													event.preventDefault();
													onSelect(entry.name, true);
												}}
											>
												<img
													className="block-card-preview"
													src={catalogThumbnail(packId, entry.name)}
													alt=""
													width="360"
													height="240"
													loading="lazy"
													decoding="async"
													data-preview-pack={packId}
												/>
												<span className="block-card-category">
													{labels[entry.category] ?? entry.category}
												</span>
												<h3>
													{entry.title}
													<span aria-hidden="true">↗</span>
												</h3>
												<p>{entry.description}</p>
												<span className="block-card-meta">
													{entry.examples.length}{" "}
													{entry.examples.length === 1 ? "example" : "examples"}
													<span>
														{selected === entry.name ? "Viewing" : "Open study"}
													</span>
												</span>
											</a>
										</li>
									);
								})}
							</ul>
						</div>
					) : (
						<div className="block-index-empty">
							<h3>No blocks found.</h3>
							<p>Try a shorter search or choose another category.</p>
							<button
								type="button"
								onClick={() => {
									setSearch("");
									setCategory("all");
								}}
							>
								Show all blocks
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
