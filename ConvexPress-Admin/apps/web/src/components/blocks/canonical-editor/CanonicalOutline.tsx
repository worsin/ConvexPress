import { editorDefinitions } from "../../../../../../../blocks/.generated/editor-metadata";
import { outline, type TreeAdapter } from "./tree";
export interface BlockLabel {
	name: string;
	version: number;
	title?: string;
	supported?: boolean;
}
/** Native list semantics intentionally avoid an incomplete ARIA tree widget. */
export function CanonicalOutline<N>({
	nodes,
	adapter,
	describe,
	selectedId,
	selectedIds,
	hoveredId,
	onToggle,
	onSelectAll,
	onRemove,
	onSelect,
}: {
	nodes: readonly N[];
	adapter: TreeAdapter<N>;
	describe: (node: N) => BlockLabel;
	selectedId: string | null;
	hoveredId?: string | null;
	selectedIds?: readonly string[];
	onToggle?: (id: string) => void;
	onSelectAll?: () => void;
	onRemove?: () => void;
	onSelect: (
		id: string,
		gesture?: { extend?: boolean; toggle?: boolean },
	) => void;
}) {
	const rows = outline(nodes, adapter);
	return (
		<nav aria-label="Page outline" className="space-y-3">
			<div className="flex items-baseline justify-between border-b border-border pb-3">
				<h2 className="text-sm font-semibold">Page outline</h2>
				<span className="text-xs text-muted-foreground">
					{rows.length} {rows.length === 1 ? "block" : "blocks"}
				</span>
			</div>
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					This page has no blocks yet.
				</p>
			) : (
				<ol className="space-y-1">
					{rows.map(({ node, depth }, rowIndex) => {
						const id = adapter.id(node),
							meta = describe(node);
						const definition = Object.hasOwn(editorDefinitions, meta.name)
							? editorDefinitions[meta.name as keyof typeof editorDefinitions]
							: undefined;
						const supported =
							meta.supported ?? definition?.version === meta.version;
						return (
							<li
								key={id}
								className="flex items-center gap-2"
								style={{ paddingInlineStart: `${(depth - 1) * 12}px` }}
							>
								{onToggle && (
									<input
										type="checkbox"
										className="size-4 shrink-0 accent-primary"
										aria-label={`Select block ${rowIndex + 1}: ${meta.title ?? definition?.title ?? meta.name}`}
										checked={selectedIds?.includes(id) ?? id === selectedId}
										onChange={() => onToggle(id)}
									/>
								)}
								<button
									type="button"
									aria-current={id === selectedId ? "true" : undefined}
									data-preview-hovered={id === hoveredId ? "true" : undefined}
									style={
										id === hoveredId
											? {
													outline: "1px dashed var(--primary)",
													outlineOffset: -2,
												}
											: undefined
									}
									onClick={(event) =>
										onSelect(id, {
											extend: event.shiftKey,
											toggle: event.metaKey || event.ctrlKey,
										})
									}
									onKeyDown={(event) => {
										if (
											(event.metaKey || event.ctrlKey) &&
											event.key.toLowerCase() === "a" &&
											!event.altKey
										) {
											event.preventDefault();
											onSelectAll?.();
											return;
										}
										if (
											(event.key === "Delete" || event.key === "Backspace") &&
											!event.metaKey &&
											!event.ctrlKey &&
											!event.altKey
										) {
											event.preventDefault();
											onRemove?.();
											return;
										}
										if (event.altKey || event.metaKey || event.ctrlKey) return;
										const index = rows.findIndex(
											(row) => adapter.id(row.node) === id,
										);
										const target =
											event.key === "ArrowDown"
												? Math.min(rows.length - 1, index + 1)
												: event.key === "ArrowUp"
													? Math.max(0, index - 1)
													: event.key === "Home"
														? 0
														: event.key === "End"
															? rows.length - 1
															: null;
										if (target === null) return;
										event.preventDefault();
										onSelect(adapter.id(rows[target].node), {
											extend: event.shiftKey,
										});
										event.currentTarget
											.closest("ol")
											?.querySelectorAll<HTMLButtonElement>("button")
											[target]?.focus();
									}}
									className={`min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${(selectedIds?.includes(id) ?? id === selectedId) ? "border-primary/30 bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}
								>
									<span className="block font-medium">
										{meta.title ?? definition?.title ?? meta.name}
									</span>
									{!supported && (
										<span className="block text-xs">
											Schema update required
										</span>
									)}
								</button>
							</li>
						);
					})}
				</ol>
			)}
		</nav>
	);
}
