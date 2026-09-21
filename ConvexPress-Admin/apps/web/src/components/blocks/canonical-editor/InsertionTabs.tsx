import { useId, useState, type ReactNode } from "react";
/** Keep panels mounted so switching tools never discards a pending review. */
export function InsertionTabs({
	blocks,
	patterns,
	saved,
	create,
}: {
	blocks: ReactNode;
	patterns?: ReactNode;
	saved?: ReactNode;
	create?: ReactNode;
}) {
	const id = useId(),
		[active, setActive] = useState("blocks");
	const tabs = [
		{ id: "blocks", label: "Blocks", panel: blocks },
		...(patterns
			? [{ id: "patterns", label: "Patterns", panel: patterns }]
			: []),
		...(saved ? [{ id: "saved", label: "Saved", panel: saved }] : []),
		...(create ? [{ id: "create", label: "Create", panel: create }] : []),
	];
	const selected = tabs.some((tab) => tab.id === active) ? active : "blocks";
	return (
		<section
			aria-label="Add content"
			className="min-w-0 rounded-xl border border-border bg-card"
		>
			<div
				role="tablist"
				aria-label="Content sources"
				className="flex gap-1 overflow-x-auto border-b border-border p-2"
			>
				{tabs.map((tab, index) => (
					<button
						key={tab.id}
						type="button"
						id={`${id}-${tab.id}-tab`}
						role="tab"
						aria-selected={selected === tab.id}
						aria-controls={`${id}-${tab.id}-panel`}
						tabIndex={selected === tab.id ? 0 : -1}
						onClick={() => setActive(tab.id)}
						onKeyDown={(event) => {
							if (event.altKey || event.metaKey || event.ctrlKey) return;
							const next =
								event.key === "ArrowRight"
									? (index + 1) % tabs.length
									: event.key === "ArrowLeft"
										? (index + tabs.length - 1) % tabs.length
										: event.key === "Home"
											? 0
											: event.key === "End"
												? tabs.length - 1
												: null;
							if (next === null) return;
							event.preventDefault();
							setActive(tabs[next].id);
							event.currentTarget.parentElement
								?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
								[next]?.focus();
						}}
						className="min-h-10 flex-1 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted aria-selected:bg-muted aria-selected:font-medium aria-selected:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
					>
						{tab.label}
					</button>
				))}
			</div>
			{tabs.map((tab) => (
				<div
					key={tab.id}
					role="tabpanel"
					id={`${id}-${tab.id}-panel`}
					aria-labelledby={`${id}-${tab.id}-tab`}
					hidden={selected !== tab.id}
					tabIndex={0}
					className="space-y-3 p-3 focus-visible:outline focus-visible:outline-ring"
				>
					{tab.panel}
				</div>
			))}
		</section>
	);
}
