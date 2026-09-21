import {
	validateBlockAuthoringAttrs,
	validateBlockField,
} from "../../../../../../../blocks/.generated/schemas";
import type { EditorField, EditorDefinition } from "../../../../../../../blocks/.generated/editor-metadata";
export interface BlockEditorContract {
  name: string;
  definition: EditorDefinition;
  validateAttrs(value: unknown): Draft;
  validateField(path: Path, value: unknown): unknown;
}
export type Path = readonly (string | number)[];
export type Draft = Record<string, unknown>;
export interface Scope {
	websiteKey: string;
	instanceKey: string;
}
export interface PickerRequest {
	blockId: string;
	name: string;
	path: Path;
	scope: Scope;
	revision: string;
}
export interface PickerResult {
  /** Display label only; never authorization or provider metadata. */
  label?: string;
	scope: Scope;
	value: unknown;
	syncedRevision?: { revisionPolicy: "latest" | "pinned"; revision: number };
}
export const sameScope = (a: Scope, b: Scope) =>
	Boolean(
		a.websiteKey &&
			a.instanceKey &&
			a.websiteKey === b.websiteKey &&
			a.instanceKey === b.instanceKey,
	);
const safe = (part: string | number) =>
	typeof part === "number"
		? Number.isSafeInteger(part) && part >= 0
		: !["__proto__", "constructor", "prototype"].includes(part);
export function draftAt(value: unknown, path: Path): unknown {
	for (const part of path) {
		if (!safe(part) || !value || typeof value !== "object") return undefined;
		value = (value as Record<string | number, unknown>)[part];
	}
	return value;
}
export function updateDraft(draft: Draft, path: Path, value: unknown): Draft {
	if (!path.length || !path.every(safe))
		throw new Error("Invalid editor field path");
	const result = structuredClone(draft);
	let current: any = result;
	path.forEach((part, index) => {
		if (
			!current ||
			typeof current !== "object" ||
			(Array.isArray(current) &&
				(typeof part !== "number" || part >= current.length))
		)
			throw new Error("Editor field no longer exists");
		if (index === path.length - 1) {
			if (value === undefined) {
				if (Array.isArray(current))
					throw new Error("Remove array rows explicitly");
				delete current[part];
			} else current[part] = structuredClone(value);
		} else {
			if (!Object.hasOwn(current, part) || current[part] === null)
				current[part] = typeof path[index + 1] === "number" ? [] : {};
			current = current[part];
		}
	});
	return result;
}
export function moveRow(
	draft: Draft,
	path: Path,
	from: number,
	to: number,
): Draft {
	const rows = draftAt(draft, path);
	if (
		!Array.isArray(rows) ||
		![from, to].every(
			(index) => Number.isInteger(index) && index >= 0 && index < rows.length,
		)
	)
		throw new Error("Invalid row move");
	const next = [...rows];
	const [row] = next.splice(from, 1);
	next.splice(to, 0, row);
	return updateDraft(draft, path, next);
}
export function initialFieldValue(field: EditorField): unknown {
	if (Object.hasOwn(field, "default")) return structuredClone(field.default);
	if (field.type === "object")
		return Object.fromEntries(
			(field.fields ?? [])
				.filter((child) => Object.hasOwn(child, "default"))
				.map((child) => [child.id, initialFieldValue(child)]),
		);
	if (field.type === "repeater") return [];
	if (field.type === "richtext") return { type: "doc", content: [] };
	if (field.type === "boolean") return false;
	if (field.type === "link" && field.storage !== "href")
		return { label: "", href: "" };
	return undefined;
}
export interface FieldIssue {
	path: Path;
	message: string;
}
export type DraftValidation =
	| { ok: true; attrs: Draft; issues: readonly [] }
	| { ok: false; issues: FieldIssue[] };
export function validateDraft(name: string, draft: Draft, contract?: BlockEditorContract): DraftValidation {
	try {
		if (contract && contract.name !== name) throw new Error("Mismatched block contract");
		return {
			ok: true,
			attrs: contract ? contract.validateAttrs(draft) : validateBlockAuthoringAttrs(name, draft) as Draft,
			issues: [],
		};
	} catch (error) {
		const issues = (error as { issues?: { path?: Path; message?: string }[] })
			?.issues;
		return {
			ok: false,
			issues: issues?.map((issue) => ({
				path: issue.path ?? [],
				message: issue.message ?? "Invalid value",
			})) ?? [{ path: [], message: "This block contract is unavailable." }],
		};
	}
}
export function acceptPickerResult(
	request: PickerRequest,
	result: PickerResult,
	current: PickerRequest,
	contract?: BlockEditorContract,
): unknown {
	if (
		!request.blockId ||
		!request.revision ||
		request.blockId !== current.blockId ||
		request.name !== current.name ||
		request.revision !== current.revision ||
		JSON.stringify(request.path) !== JSON.stringify(current.path) ||
		!sameScope(request.scope, current.scope) ||
		!sameScope(request.scope, result.scope)
	)
		throw new Error(
			"The selection belongs to a different or changed environment. Select it again.",
		);
	if (contract && contract.name !== request.name) throw new Error("Mismatched picker contract");
	return contract ? contract.validateField(request.path, result.value) : validateBlockField(request.name, request.path, result.value);
}

/** A reusable reference and its revision are a single choice. Never expose an
 * intermediate draft that points at the new source with the old source's pin. */
export function applyPickerResult(request: PickerRequest, result: PickerResult, current: PickerRequest, draft: Draft, contract?: BlockEditorContract): Draft {
  const value = acceptPickerResult(request, result, current, contract);
  const synced = request.name === "core/synced" && request.path.length === 1 && request.path[0] === "syncedBlock";
  if (!synced) {
    if (result.syncedRevision !== undefined) throw new Error("Unexpected reusable revision metadata");
    return updateDraft(draft, request.path, value);
  }
  const choice = result.syncedRevision;
  if (!choice || !["latest", "pinned"].includes(choice.revisionPolicy) || !Number.isInteger(choice.revision) || choice.revision < 1 || choice.revision > 1000000)
    throw new Error("Choose a published reusable revision");
  let next = updateDraft(draft, request.path, value);
  next = updateDraft(next, ["revisionPolicy"], choice.revisionPolicy);
  next = updateDraft(next, ["revision"], choice.revisionPolicy === "pinned" ? choice.revision : undefined);
  return validateBlockAuthoringAttrs(request.name, next) as Draft;
}
