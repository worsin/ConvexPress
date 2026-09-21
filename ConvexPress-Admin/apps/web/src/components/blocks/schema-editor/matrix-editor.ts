import type { EditorDefinition } from "../../../../../../../blocks/.generated/editor-metadata";
import {
	draftAt,
	initialFieldValue,
	updateDraft,
	type Draft,
	type Path,
} from "./model";

export type RepeaterEdit =
	| { kind: "move"; from: number; to: number }
	| { kind: "remove"; index: number }
	| { kind: "append"; value: unknown };
interface MatrixRule {
	kind: "matrix";
	headers: string;
	rows: string;
	rowField?: string;
	headerOffset?: number;
}
function matrices(definition: EditorDefinition): MatrixRule[] {
	return definition.constraints.filter((value): value is MatrixRule => {
		if (!value || typeof value !== "object") return false;
		const rule = value as Record<string, unknown>;
		return (
			rule.kind === "matrix" &&
			typeof rule.headers === "string" &&
			typeof rule.rows === "string" &&
			(rule.rowField === undefined || typeof rule.rowField === "string") &&
			(rule.headerOffset === undefined ||
				rule.headerOffset === 0 ||
				rule.headerOffset === 1)
		);
	});
}
const cellsAt = (row: unknown, rule: MatrixRule): unknown =>
	rule.rowField ? draftAt(row, [rule.rowField]) : row;
function cellValue(definition: EditorDefinition, rule: MatrixRule): unknown {
	const rows = definition.fields.find((field) => field.id === rule.rows);
	const cells = rule.rowField
		? rows?.fields?.find((field) => field.id === rule.rowField)
		: rows?.item;
	return cells?.item
		? (initialFieldValue(cells.item) ??
				(cells.item.type === "text" ? "" : null))
		: "";
}
function effective(
	draft: Draft,
	definition: EditorDefinition,
	field: string,
): unknown {
	if (Object.hasOwn(draft, field)) return draft[field];
	const descriptor = definition.fields.find((item) => item.id === field);
	return descriptor ? initialFieldValue(descriptor) : undefined;
}
function editArray(rows: unknown[], edit: RepeaterEdit): unknown[] {
	const next = [...rows];
	if (edit.kind === "append") next.push(structuredClone(edit.value));
	else if (edit.kind === "remove") next.splice(edit.index, 1);
	else {
		const [item] = next.splice(edit.from, 1);
		next.splice(edit.to, 0, item);
	}
	return next;
}
/** Column operations use the generated matrix relationship, never block names.
 * Invalid existing rows are retained for correction, not padded or truncated. */
export function repeaterEditAllowed(
	draft: Draft,
	path: Path,
	edit: RepeaterEdit,
	definition: EditorDefinition,
): boolean {
	const rows = draftAt(draft, path);
	if (!Array.isArray(rows)) return false;
	if (
		edit.kind !== "append" &&
		!(edit.kind === "move" ? [edit.from, edit.to] : [edit.index]).every(
			(index) => Number.isInteger(index) && index >= 0 && index < rows.length,
		)
	)
		return false;
	if (path.length !== 1) return true;
	for (const rule of matrices(definition).filter(
		(rule) => rule.headers === path[0],
	)) {
		const offset = rule.headerOffset ?? 0;
		if (edit.kind === "move" && (edit.from < offset || edit.to < offset))
			return false;
		if (edit.kind === "remove" && edit.index < offset) return false;
		const body = effective(draft, definition, rule.rows);
		if (
			!Array.isArray(body) ||
			body.some((row) => {
				const cells = cellsAt(row, rule);
				return (
					!Array.isArray(cells) ||
					cells.length !== Math.max(0, rows.length - offset)
				);
			})
		)
			return false;
	}
	return true;
}
export function matrixEditorHint(
	definition: EditorDefinition,
	path: Path,
): string | undefined {
	const rule =
		path.length === 1
			? matrices(definition).find((rule) => rule.headers === path[0])
			: undefined;
	return rule
		? `Moving or removing a column also moves or removes its values.${rule.headerOffset ? " The row-label column stays first." : ""} Complete existing rows before changing columns.`
		: undefined;
}
export function editRepeater(
	draft: Draft,
	path: Path,
	operation: RepeaterEdit,
	definition: EditorDefinition,
): Draft {
	if (!repeaterEditAllowed(draft, path, operation, definition))
		throw new Error(
			"Complete the table rows before changing columns; the row-label column stays first.",
		);
	const rows = draftAt(draft, path) as unknown[];
	const rules = path.length === 1 ? matrices(definition) : [];
	let edit = operation;
	// A newly added table row starts with one editable cell per data column.
	const rowRule = rules.find((rule) => rule.rows === path[0]);
	if (rowRule && edit.kind === "append") {
		const headers = effective(draft, definition, rowRule.headers);
		if (Array.isArray(headers)) {
			const cells = Array.from(
				{ length: Math.max(0, headers.length - (rowRule.headerOffset ?? 0)) },
				() => cellValue(definition, rowRule),
			);
			const value = rowRule.rowField
				? { ...(edit.value as Draft), [rowRule.rowField]: cells }
				: cells;
			edit = { kind: "append", value };
		}
	}
	let next = updateDraft(draft, path, editArray(rows, edit));
	for (const rule of rules.filter((rule) => rule.headers === path[0])) {
		const offset = rule.headerOffset ?? 0;
		if (operation.kind === "append" && rows.length < offset) continue;
		const cellEdit: RepeaterEdit =
			operation.kind === "move"
				? {
						kind: "move",
						from: operation.from - offset,
						to: operation.to - offset,
					}
				: operation.kind === "remove"
					? { kind: "remove", index: operation.index - offset }
					: { kind: "append", value: cellValue(definition, rule) };
		const body = effective(draft, definition, rule.rows) as unknown[];
		next = updateDraft(
			next,
			[rule.rows],
			body.map((row) => {
				const cells = editArray(cellsAt(row, rule) as unknown[], cellEdit);
				return rule.rowField
					? { ...(row as Draft), [rule.rowField]: cells }
					: cells;
			}),
		);
	}
	return next;
}
