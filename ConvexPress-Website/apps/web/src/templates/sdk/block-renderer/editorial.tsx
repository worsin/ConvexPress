import { useId, useRef, useState, type ReactNode } from "react";
import "./editorial.css";

/** Internal Library composition: canonical attrs are validated before constructing panels. */
export function EditorialTabs({
	label,
	panels,
}: {
	label: string;
	panels: readonly { label: string; content: ReactNode }[];
}) {
	const instance = useId();
	const [chosen, setChosen] = useState(0);
	const buttons = useRef<Array<HTMLButtonElement | null>>([]);
	const active = chosen < panels.length ? chosen : 0;
	if (panels.length === 0) return null;
	return (
		<div className="cp-editorial-tabs">
			<div role="tablist" aria-label={label}>
				{panels.map((panel, index) => (
					// Canonical tabs have positional identity; labels can repeat and are editable.
					<button
						// biome-ignore lint/suspicious/noArrayIndexKey: Validated canonical tabs have positional identity, not item IDs.
						key={index}
						ref={(node) => {
							buttons.current[index] = node;
						}}
						type="button"
						role="tab"
						id={`${instance}-tab-${index}`}
						aria-controls={`${instance}-panel-${index}`}
						aria-selected={active === index}
						tabIndex={active === index ? 0 : -1}
						onClick={() => setChosen(index)}
						onKeyDown={(event) => {
							const rtl =
								getComputedStyle(event.currentTarget).direction === "rtl";
							const delta =
								event.key === "ArrowRight"
									? rtl
										? -1
										: 1
									: event.key === "ArrowLeft"
										? rtl
											? 1
											: -1
										: 0;
							const next = delta
								? (index + delta + panels.length) % panels.length
								: event.key === "Home"
									? 0
									: event.key === "End"
										? panels.length - 1
										: null;
							if (next !== null) {
								event.preventDefault();
								setChosen(next);
								buttons.current[next]?.focus();
							}
						}}
					>
						{panel.label.trim() || `Section ${index + 1}`}
					</button>
				))}
			</div>
			{panels.map((panel, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: Validated canonical tabs have positional identity, not item IDs.
					key={index}
					role="tabpanel"
					id={`${instance}-panel-${index}`}
					aria-labelledby={`${instance}-tab-${index}`}
					hidden={active !== index}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: ARIA tabpanel is the keyboard entry point for its content.
					tabIndex={0}
				>
					{panel.content}
				</div>
			))}
		</div>
	);
}
