import { useId } from "react";
import { INLINE_MARK_TYPES } from "../../../../../../../blocks/.generated/field-runtime.mjs";
import type {
	RichTextDoc,
	RichTextInline,
	RichTextMark,
} from "../../../../../../../blocks/.generated/field-runtime.mjs";
const inputClass =
	"w-full rounded border border-border bg-background px-2 py-1.5 text-sm";
export function RichTextField({
	value,
	onChange,
	disabled,
	inline,
	label,
}: {
	value: RichTextDoc;
	onChange: (doc: RichTextDoc) => void;
	disabled?: boolean;
	inline?: boolean;
	label: string;
}) {
	const uid = useId();
	const update = (
		paragraph: number,
		node: number,
		next: RichTextInline | null,
	) => {
		const doc = structuredClone(value);
		if (next) doc.content[paragraph].content![node] = next;
		else doc.content[paragraph].content!.splice(node, 1);
		onChange(doc);
	};
	return (
		<fieldset disabled={disabled} className="grid gap-3" aria-label={label}>
			<legend className="sr-only">{label}</legend>
			{value.content.map((paragraph, p) => (
				<fieldset
					key={p}
					className="grid gap-2 rounded border border-border p-3"
				>
					<legend className="px-1 text-xs">Paragraph {p + 1}</legend>
					{(paragraph.content ?? []).map((node, n) =>
						node.type === "hardBreak" ? (
							<div key={n} className="flex justify-between text-sm">
								<span>Line break</span>
								<button
									type="button"
									onClick={() => update(p, n, null)}
									aria-label={`Remove line break ${n + 1} in paragraph ${p + 1}`}
								>
									Remove
								</button>
							</div>
						) : (
							<div key={n} className="grid gap-2">
								<label htmlFor={`${uid}-${p}-${n}`}>Text segment {n + 1}</label>
								<textarea
									id={`${uid}-${p}-${n}`}
									className={inputClass}
									value={node.text}
									onChange={(event) =>
										update(p, n, { ...node, text: event.target.value })
									}
								/>
								<div
									role="group"
									aria-label={`Formatting for paragraph ${p + 1} segment ${n + 1}`}
									className="flex flex-wrap gap-2"
								>
									{INLINE_MARK_TYPES.map((type) => (
										<button
											type="button"
											key={type}
											aria-pressed={
												node.marks?.some((mark) => mark.type === type) ?? false
											}
											onClick={() => {
												const present = node.marks?.some(
													(mark) => mark.type === type,
												);
												const marks: RichTextMark[] = present
													? (node.marks ?? []).filter(
															(mark) => mark.type !== type,
														)
													: [...(node.marks ?? []), { type }];
												update(p, n, { ...node, marks });
											}}
										>
											{type}
										</button>
									))}
									<button
										type="button"
										aria-pressed={
											node.marks?.some((mark) => mark.type === "link") ?? false
										}
										onClick={() =>
											update(p, n, {
												...node,
												marks: node.marks?.some((mark) => mark.type === "link")
													? node.marks.filter((mark) => mark.type !== "link")
													: [
															...(node.marks ?? []),
															{ type: "link", attrs: { href: "" } },
														],
											})
										}
									>
										Link
									</button>
								</div>
								{node.marks?.map((mark, m) =>
									mark.type === "link" ? (
										<div key={m} className="grid gap-2">
											<label htmlFor={`${uid}-${p}-${n}-link`}>
												Link destination
											</label>
											<input
												id={`${uid}-${p}-${n}-link`}
												className={inputClass}
												value={mark.attrs.href}
												onChange={(event) => {
													const marks = structuredClone(node.marks!);
													marks[m] = {
														...mark,
														attrs: { ...mark.attrs, href: event.target.value },
													};
													update(p, n, { ...node, marks });
												}}
											/>
											<label>
												<input
													type="checkbox"
													checked={mark.attrs.target === "_blank"}
													onChange={(event) => {
														const marks = structuredClone(node.marks!);
														marks[m] = {
															...mark,
															attrs: {
																...mark.attrs,
																target: event.target.checked
																	? "_blank"
																	: "_self",
															},
														};
														update(p, n, { ...node, marks });
													}}
												/>{" "}
												Open in a new tab
											</label>
										</div>
									) : null,
								)}
								<button
									type="button"
									onClick={() => update(p, n, null)}
									aria-label={`Remove text segment ${n + 1} in paragraph ${p + 1}`}
								>
									Remove segment
								</button>
							</div>
						),
					)}
					<div className="flex gap-3">
						<button
							type="button"
							onClick={() => {
								const doc = structuredClone(value);
								(doc.content[p].content ??= []).push({
									type: "text",
									text: "",
								});
								onChange(doc);
							}}
						>
							Add text to paragraph {p + 1}
						</button>
						<button
							type="button"
							onClick={() => {
								const doc = structuredClone(value);
								(doc.content[p].content ??= []).push({ type: "hardBreak" });
								onChange(doc);
							}}
						>
							Add line break to paragraph {p + 1}
						</button>
						<button
							type="button"
							onClick={() => {
								const doc = structuredClone(value);
								doc.content.splice(p, 1);
								onChange(doc);
							}}
						>
							Remove paragraph {p + 1}
						</button>
					</div>
				</fieldset>
			))}
			<button
				type="button"
				disabled={disabled || Boolean(inline && value.content.length)}
				onClick={() =>
					onChange({
						...value,
						content: [
							...value.content,
							{ type: "paragraph", content: [{ type: "text", text: "" }] },
						],
					})
				}
			>
				Add paragraph
			</button>
		</fieldset>
	);
}
