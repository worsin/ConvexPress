/** Editor state only. T is the authoritative decoded document value supplied by
 * the backend contract adapter; this module defines no stored block schema. */
export interface DocumentKey {
	websiteKey: string;
	instanceKey: string;
	documentId: string;
	/** Native connection/auth generation, never a bearer or authorization claim. */
	generation: string;
}
export interface Snapshot<T> {
	key: DocumentKey;
	revision: number;
	value: T;
}
export interface SaveRequest<T> extends Snapshot<T> {
	operation: number;
}
interface HistoryEntry<T> {
	value: T;
	bytes: number;
}
interface EditGroup {
	group: string;
	at: number;
}
export interface EditorSession<T> {
	history: {
		past: HistoryEntry<T>[];
		future: HistoryEntry<T>[];
		group: EditGroup | null;
	};
	base: Snapshot<T>;
	draft: T;
	dirty: boolean;
	operation: number;
	pending: SaveRequest<T> | null;
	conflict: Snapshot<T> | null;
	error: string | null;
	recoveryNotice?: string;
}
export const sameDocument = (a: DocumentKey, b: DocumentKey): boolean =>
	a.websiteKey === b.websiteKey &&
	a.instanceKey === b.instanceKey &&
	a.documentId === b.documentId &&
	a.generation === b.generation;
// Field validation can reorder keys in nested repeater objects. JSON transport
// does not give those keys semantic order; arrays and actual values still do.
const comparable = (value: unknown): string | undefined =>
	JSON.stringify(value, (_key, item) =>
		item && typeof item === "object" && !Array.isArray(item)
			? Object.fromEntries(
					Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
				)
			: item,
	);
export const sameDraft = (a: unknown, b: unknown): boolean =>
	comparable(a) === comparable(b);
const equal = sameDraft;
const HISTORY_BYTES = 4 * 1024 * 1024;
function appendHistory<T>(
	entries: HistoryEntry<T>[],
	value: T,
): HistoryEntry<T>[] {
	const entry = {
		value,
		bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength,
	};
	const next = [...entries, entry].slice(-100);
	let bytes = next.reduce((sum, item) => sum + item.bytes, 0);
	while (next.length && bytes > HISTORY_BYTES) bytes -= next.shift()!.bytes;
	return next;
}
export function openDocument<T>(snapshot: Snapshot<T>): EditorSession<T> {
	return {
		base: snapshot,
		history: { past: [], future: [], group: null },
		draft: snapshot.value,
		dirty: false,
		operation: 0,
		pending: null,
		conflict: null,
		error: null,
	};
}
/** Called only by the current window's operator/site-scoped recovery store,
 * after the new connection has independently authorized and decoded a read.
 * A retained draft is input, never authorization or a reusable save request. */
export function resumeDocument<T>(
	state: EditorSession<T>,
	next: Snapshot<T>,
): EditorSession<T> {
	const old = state.base;
	if (
		old.key.websiteKey !== next.key.websiteKey ||
		old.key.instanceKey !== next.key.instanceKey ||
		old.key.documentId !== next.key.documentId
	)
		return openDocument(next);
	if (equal(state.draft, next.value)) return openDocument(next);
	const resumed: EditorSession<T> = {
		...state,
		history: { past: [], future: [], group: null },
		base: { ...old, key: next.key },
		pending: null,
		conflict: state.conflict ? { ...state.conflict, key: next.key } : null,
		error: null,
		recoveryNotice:
			"Your unsaved changes were recovered after reconnecting. Review them before saving.",
	};
	// A fresh read can confirm the content of an uncertain save without replaying
	// it. Edits made after that request remain unsaved against the current revision.
	if (
		state.pending &&
		next.revision > old.revision &&
		equal(next.value, state.pending.value)
	)
		return { ...resumed, base: next, conflict: null, dirty: true };
	if (next.revision === old.revision && equal(next.value, old.value))
		return resumed;
	return { ...resumed, conflict: next };
}
export function editDocument<T>(
	state: EditorSession<T>,
	value: T,
	options?: EditGroup | { record: false },
): EditorSession<T> {
	// Schema controls announce their initial value on mount. That is not a user
	// edit and must not erase a recovery notice or an unresolved save error.
	if (equal(value, state.draft)) return state;
	const group = options && "group" in options ? options : null;
	const previous = state.history.group;
	const grouped =
		group &&
		previous &&
		group.group === previous.group &&
		group.at >= previous.at &&
		group.at - previous.at < 800;
	const record = !(options && "record" in options && !options.record);
	return {
		...state,
		draft: value,
		history: record
			? {
					past: grouped
						? state.history.past
						: appendHistory(state.history.past, state.draft),
					future: [],
					group,
				}
			: { ...state.history, group: null },
		dirty: !equal(value, state.base.value),
		error: null,
		recoveryNotice: undefined,
	};
}
/** History changes local input only; it never rolls back the saved CAS base. */
export function undoDocument<T>(state: EditorSession<T>): EditorSession<T> {
	if (state.pending || state.conflict || !state.history.past.length)
		return state;
	const entry = state.history.past.at(-1)!;
	return {
		...state,
		draft: entry.value,
		dirty: !equal(entry.value, state.base.value),
		error: null,
		recoveryNotice: undefined,
		history: {
			past: state.history.past.slice(0, -1),
			future: appendHistory(state.history.future, state.draft),
			group: null,
		},
	};
}
export function redoDocument<T>(state: EditorSession<T>): EditorSession<T> {
	if (state.pending || state.conflict || !state.history.future.length)
		return state;
	const entry = state.history.future.at(-1)!;
	return {
		...state,
		draft: entry.value,
		dirty: !equal(entry.value, state.base.value),
		error: null,
		recoveryNotice: undefined,
		history: {
			past: appendHistory(state.history.past, state.draft),
			future: state.history.future.slice(0, -1),
			group: null,
		},
	};
}
export function receiveDocument<T>(
	state: EditorSession<T>,
	next: Snapshot<T>,
): EditorSession<T> {
	if (!sameDocument(state.base.key, next.key)) return openDocument(next);
	if (next.revision < state.base.revision) return state;
	if (next.revision === state.base.revision) {
		if (!equal(next.value, state.base.value))
			return {
				...state,
				error:
					"The server returned inconsistent content for this revision. Reload the document.",
			};
		return state;
	}
	// A save's reactive result can precede its mutation receipt. Wait for the
	// exact receipt before treating it as ours; remote edits are never discarded.
	if (state.dirty || state.pending) return { ...state, conflict: next };
	return openDocument(next);
}
export function beginSave<T>(state: EditorSession<T>): EditorSession<T> {
	if (state.pending || state.conflict || !state.dirty) return state;
	const operation = state.operation + 1;
	return {
		...state,
		operation,
		history: { ...state.history, group: null },
		error: null,
		pending: {
			key: state.base.key,
			revision: state.base.revision,
			value: state.draft,
			operation,
		},
	};
}
export function acceptSave<T>(
	state: EditorSession<T>,
	request: SaveRequest<T>,
	receipt: Snapshot<T>,
): EditorSession<T> {
	if (
		!state.pending ||
		state.pending.operation !== request.operation ||
		!sameDocument(request.key, state.base.key)
	)
		return state;
	if (
		!sameDocument(receipt.key, request.key) ||
		receipt.revision <= request.revision ||
		!equal(receipt.value, request.value)
	)
		return {
			...state,
			pending: null,
			error: "The save could not be verified. Reload before saving again.",
		};
	const conflict =
		state.conflict && state.conflict.revision > receipt.revision
			? state.conflict
			: null;
	return {
		...state,
		base: receipt,
		pending: null,
		conflict,
		dirty: !equal(state.draft, receipt.value),
		error: null,
	};
}
export function rejectSave<T>(
	state: EditorSession<T>,
	request: SaveRequest<T>,
	message: string,
): EditorSession<T> {
	if (
		!state.pending ||
		request.operation !== state.pending.operation ||
		!sameDocument(request.key, state.base.key)
	)
		return state;
	return { ...state, pending: null, error: message };
}
/** Explicit UI action: never call automatically when a subscription changes. */
export function reloadDocument<T>(state: EditorSession<T>): EditorSession<T> {
	return openDocument(state.conflict ?? state.base);
}
