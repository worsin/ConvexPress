import { useId, useMemo, useState } from "react";
import { changeOriginalText, readOriginalText } from "./original-text";

/** Compatibility editing until the user reviews conversion to canonical blocks. */
export function OriginalTextEditor({
	value,
	onChange,
	disabled,
}: {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	const id = useId(),
		parsed = useMemo(() => readOriginalText(value), [value]);
	const [visible, setVisible] = useState(50);
	const fieldClass =
		"mt-2 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm leading-6 focus-visible:outline focus-visible:outline-ring";
	return (
		<section
			className="space-y-4 rounded-lg border border-border bg-card p-5"
			aria-labelledby={`${id}-title`}
		>
			<div>
				<h2 id={`${id}-title`} className="font-semibold">
					Original text
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Edit the wording while keeping its formatting and media. Use the block
					editor conversion above to change the document structure.
				</p>
			</div>
			{parsed.kind === "plain" ? (
				<div className="text-sm font-medium">
					<label htmlFor={`${id}-body`}>Body</label>
					<textarea
						id={`${id}-body`}
						className={fieldClass}
						value={value}
						disabled={disabled}
						onChange={(e) => onChange(e.target.value)}
					/>
				</div>
			) : parsed.kind === "unsupported" ? (
				<p role="status">
					This original document needs a conversion review before it can be
					edited. Its saved content has been kept intact.
				</p>
			) : (
				<>
					{parsed.segments.length === 0 && (
						<p className="text-sm text-muted-foreground">
							This document has no text to edit. Its media and structure are
							preserved.
						</p>
					)}
					{parsed.segments.slice(0, visible).map((segment, index) => (
						<div
							key={segment.path.join(".")}
							className="block text-sm font-medium"
						>
							<label htmlFor={`${id}-text-${index}`}>Text {index + 1}</label>
							<textarea
								id={`${id}-text-${index}`}
								className={fieldClass}
								value={segment.text}
								disabled={disabled}
								onChange={(e) =>
									onChange(
										changeOriginalText(value, segment.path, e.target.value),
									)
								}
							/>
						</div>
					))}
					{visible < parsed.segments.length && (
						<button
							type="button"
							className="min-h-11 rounded-md border px-4 text-sm"
							onClick={() => setVisible((n) => n + 50)}
						>
							Show more text
						</button>
					)}
				</>
			)}
		</section>
	);
}
