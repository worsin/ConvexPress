import { BlockVisibilityControls, type BlockVisibility } from "./BlockVisibilityControls";
import { InsertionTabs } from "./InsertionTabs";
import { TreatmentControls, type TreatmentOption } from "./TreatmentControls";
import { BlockLockControls, type BlockLockOperation } from "./BlockLockControls";
import { BlockInserter, type InserterBlock } from "./BlockInserter";
import {
	useId,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type ComponentProps,
	type ReactNode,
} from "react";
import { SchemaBlockForm } from "../schema-editor/SchemaBlockForm";
import {
	validateDraft,
	type Draft,
	type BlockEditorContract,
} from "../schema-editor/model";
import { CanonicalOutline, type BlockLabel } from "./CanonicalOutline";
import { changeNode, removeNodes, moveNode, outline, type TreeAdapter } from "./tree";
import { useEditorRecovery } from "./EditorRecoveryProvider";
import { useSiteDraft, type SiteDraftClient } from "./site-draft";
import {
	openDocument,
	editDocument,
	undoDocument,
	redoDocument,
	sameDraft,
	receiveDocument,
	resumeDocument,
	beginSave,
	acceptSave,
	rejectSave,
	reloadDocument,
	keepDraftAgainstCurrent,
	type Snapshot,
	type SaveRequest,
	type EditorSession,
} from "./session";
export interface CanonicalEditorAdapter<N, V> extends TreeAdapter<N> {
	nodes(value: V): readonly N[];
	withNodes(value: V, nodes: N[]): V;
	describe(node: N): BlockLabel;
	contract?(node: N): BlockEditorContract | undefined;
	attrs(node: N): Draft;
	withAttrs(node: N, attrs: Draft): N;
	styleOptions?(node: N): readonly string[];
	styleValue?(node: N): string;
	withStyle?(node: N, style: string): N;
	treatmentOptions?(node: N): readonly TreatmentOption[];
	treatmentValue?(node: N): string;
	treatmentAxisValue?(node: N, field: string): string;
	withTreatment?(node: N, value: string): N;
	withTreatmentAxis?(node: N, field: string, value: string): N;
	layoutOptions?(node: N): Readonly<Record<string, readonly string[]>>;
	layoutValue?(node: N, field: string): string;
	withLayout?(node: N, field: string, value: string): N;
	anchorValue?(node: N): string | undefined;
	withAnchor?(node: N, value: string): N;
	visibilityValue?(node: N): BlockVisibility | undefined;
	withVisibility?(node: N, value: BlockVisibility): N;
	lockValue?(node: N, operation: BlockLockOperation): boolean;
	withLock?(node: N, operation: BlockLockOperation, enabled: boolean): N;
	lockedInDocument?(value: V, id: string, operation: BlockLockOperation): boolean;
	validateTransition?(previous: V, next: V): string | null;
	title?(value: V): string;
	withTitle?(value: V, title: string): V;
	validate?(value: V): string | null;
	/** Structural decoder for device drafts; invalid field input remains editable. */
	recover?(value: unknown): V;
	prepareSave?(value: V): V;
	availableBlocks?: readonly InserterBlock[];
	createBlock?(name: string): N;
	availablePatterns?: readonly {
		id: string;
		title: string;
		description: string;
		category: string;
	}[];
	createPattern?(id: string): N[];
	supportsChildren?(node: N): boolean;
	locked?(node: N, operation: BlockLockOperation): boolean;
}
type Picker = ComponentProps<typeof SchemaBlockForm>["pickResource"];
export interface CanonicalEditorProps<N, V> {
	/** Already decoded by the backend contract; null removes the editor from view.
	 * Native recovery is separately scoped to the current operator/environment. */
	snapshot: Snapshot<V> | null;
	authorityReady: boolean;
	adapter: CanonicalEditorAdapter<N, V>;
	adapterForDraft?: (draft: V) => CanonicalEditorAdapter<N, V>;
	additionalInsertion?: (options: {
		revision: number;
		disabled: boolean;
		insert: (transform: (draft: V) => { draft: V; id: string }) => boolean;
	}) => ReactNode;
	save: (request: SaveRequest<V>) => Promise<Snapshot<V>>;
	pickResource: NonNullable<Picker>;
	onPreview?: () => void;
	livePreview?: (state: {
		draft: V;
		revision: number;
		available: boolean;
		selectedId: string | null;
		onSelect: (id: string) => void;
		onHover: (id: string | null) => void;
	}) => ReactNode;
	/** Proposal review starts from the saved revision but never uses its native
	 * recovery slot. Only explicit acceptance invokes the supplied save action. */
	proposal?: { initialDraft: V; onPreview: (draft: V) => void };
	contentLocked?: boolean;
	siteDraft?: SiteDraftClient<V>;
	onDirtyChange?: (dirty: boolean) => void;
	creationActions?: (state: {
		disabled: boolean;
		insertionDisabled: boolean;
		revision: number;
		insert: (transform: (draft: V) => { draft: V; id: string }) => boolean;
	}) => ReactNode;
	publicationActions?: (state: { disabled: boolean }) => ReactNode;
}
/** Native authoring state uses the decoded backend contract and explicit CAS
 * saves. Undo/redo changes local input only; it never writes a saved revision. */
export function CanonicalEditor<N, V>(props: CanonicalEditorProps<N, V>) {
	if (!props.authorityReady || !props.snapshot)
		return <p role="status">Select an authorized document to begin editing.</p>;
	const key = JSON.stringify(props.snapshot.key);
	return <EditorBody key={key} {...props} snapshot={props.snapshot} />;
}
function EditorBody<N, V>({
	snapshot,
	adapter: savedAdapter,
	adapterForDraft,
	additionalInsertion,
	save,
	pickResource,
	onPreview,
	livePreview,
	proposal,
	publicationActions,
	creationActions,
	contentLocked: externallyLocked = false,
	siteDraft,
	onDirtyChange,
}: CanonicalEditorProps<N, V> & { snapshot: Snapshot<V> }) {
	const styleControlId = useId();
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const editorElement = useRef<HTMLElement>(null);
	const [formGeneration, setFormGeneration] = useState(0);
	const formGenerationRef = useRef(0);
	const typingGroup = useRef(0);
	const restoreFocus = useRef<{
		path: string | null;
		index: number;
		start: number | null;
		end: number | null;
	} | null>(null);
	useLayoutEffect(() => {
		const wanted = restoreFocus.current;
		restoreFocus.current = null;
		if (!wanted || !editorElement.current) return;
		const group =
			wanted.path === null
				? editorElement.current
				: Array.from(
						editorElement.current.querySelectorAll<HTMLElement>(
							"[data-field-path]",
						),
					).find((el) => el.dataset.fieldPath === wanted.path);
		const control = group?.querySelectorAll<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>("input,textarea,select")[wanted.index];
		control?.focus({ preventScroll: true });
		if (
			control &&
			"setSelectionRange" in control &&
			wanted.start !== null &&
			wanted.end !== null
		) {
			try {
				control.setSelectionRange(
					Math.min(wanted.start, control.value.length),
					Math.min(wanted.end, control.value.length),
				);
			} catch {
				/* Numeric controls have no text selection. */
			}
		}
	}, [formGeneration]);
	const recovery = useEditorRecovery();
	const [recovered] = useState(() =>
		proposal ? undefined : recovery?.open(snapshot, savedAdapter.recover),
	);
	const [needsRecoveryChoice, setNeedsRecoveryChoice] = useState(!!recovered?.fromDevice);
	const recoveryChoicePending = useRef(needsRecoveryChoice);
	const [storedState, setState] = useState(() =>
		proposal
			? editDocument(openDocument(snapshot), proposal.initialDraft)
			: (needsRecoveryChoice ? openDocument(snapshot) : recovered?.state ?? openDocument(snapshot)),
	);
	// Preserve an already-open development session across adding history support.
	const state = storedState.history
		? storedState
		: { ...storedState, history: { past: [], future: [], group: null } };
	const current = useRef(state);
	if (!current.current.history) current.current = state;
	const mounted = useRef(true);
	const adapter = adapterForDraft?.(state.draft) ?? savedAdapter;
	const update = (next: EditorSession<V>) => {
		current.current = next;
		if (!recoveryChoicePending.current) recovered?.retain(next);
		setState(next);
	};
	const chooseRecovery = (restore: boolean) => {
		if (externallyLocked || !recovered || !recoveryChoicePending.current) return;
		recoveryChoicePending.current = false;
		setNeedsRecoveryChoice(false);
		update(restore ? resumeDocument(recovered.state, current.current.base) : openDocument(current.current.base));
	};
	const privateDraft = useSiteDraft({
		client: proposal ? undefined : siteDraft,
		session: state,
		paused: externallyLocked || needsRecoveryChoice || !!state.pending || !!state.conflict,
		restore: (draft, revision) => {
			const base = current.current.base;
			update({ ...editDocument(openDocument(base), draft),
				conflict: revision === base.revision ? null : base,
				recoveryNotice: "Your private Website draft is in the editor. Review it before saving changes." });
		},
	});
	const contentLocked = externallyLocked || needsRecoveryChoice || privateDraft.locked;
	const lockedNow = useRef(contentLocked);
	lockedNow.current = contentLocked;
	useEffect(() => {
		mounted.current = true;
		recovered?.activate();
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		update(receiveDocument(current.current, snapshot));
	}, [snapshot]);
	const hasUnsavedWork = state.dirty || !!state.pending || needsRecoveryChoice || !!privateDraft.offered;
	useEffect(() => {
		onDirtyChange?.(hasUnsavedWork);
	}, [onDirtyChange, hasUnsavedWork]);
	useEffect(
		() => () => {
			onDirtyChange?.(false);
		},
		[onDirtyChange],
	);
	const nodes = adapter.nodes(state.draft);
	const rows = outline(nodes, adapter);
	const [selection, setPrimarySelection] = useState<string | null>(() =>
		rows[0] ? adapter.id(rows[0].node) : null,
	);
	const [selectionIds, setSelectionIds] = useState<string[]>(() =>
		rows[0] ? [adapter.id(rows[0].node)] : [],
	);
	const selectionAnchor = useRef(selection);
	const setSelection = (id: string | null) => {
		setPrimarySelection(id);
		setSelectionIds(id ? [id] : []);
		selectionAnchor.current = id;
		typingGroup.current++;
	};
	const visibleSelection = selectionIds.filter((id) =>
		rows.some((row) => adapter.id(row.node) === id),
	);
	const selectOutline = (
		id: string,
		gesture?: { extend?: boolean; toggle?: boolean },
	) => {
		const index = rows.findIndex((row) => adapter.id(row.node) === id);
		if (index < 0) return;
		if (gesture?.extend) {
			const anchor = Math.max(
				0,
				rows.findIndex(
					(row) => adapter.id(row.node) === selectionAnchor.current,
				),
			);
			setSelectionIds(
				rows
					.slice(Math.min(anchor, index), Math.max(anchor, index) + 1)
					.map((row) => adapter.id(row.node)),
			);
			setPrimarySelection(id);
		} else if (gesture?.toggle) {
			const next = visibleSelection.includes(id)
				? visibleSelection.filter((value) => value !== id)
				: [...visibleSelection, id];
			setSelectionIds(next);
			setPrimarySelection(next.includes(id) ? id : (next.at(-1) ?? null));
			selectionAnchor.current = id;
		} else setSelection(id);
		typingGroup.current++;
	};
	const isBlockLocked = (node: N, operation: BlockLockOperation): boolean => {
		const now = current.current;
		return adapter.lockedInDocument
			? adapter.lockedInDocument(now.base.value, adapter.id(node), operation) || adapter.lockedInDocument(now.draft, adapter.id(node), operation)
			: adapter.locked?.(node, operation) ?? false;
	};
	const removedDraft = () => {
		const now = current.current;
		if (!visibleSelection.length || contentLocked || now.pending || now.conflict) return null;
		try {
			const nodes = removeNodes(adapter.nodes(now.draft), visibleSelection, adapter,
				node => adapter.validateTransition ? false : adapter.locked?.(node, "remove") ?? false);
			const next = adapter.withNodes(now.draft, nodes);
			if (adapter.validateTransition?.(now.base.value, next) || adapter.validateTransition?.(now.draft, next)) return null;
			return next;
		} catch { return null; }
	};
	const canRemoveSelection = removedDraft() !== null;
	const removeSelection = () => {
		const now = current.current, next = removedDraft();
		if (!mounted.current || lockedNow.current || !next) return;
		update(editDocument(now, next));
		const nodes = adapter.nodes(next);
		setSelection(nodes[0] ? adapter.id(nodes[0]) : null);
	};
	const invalid = rows.some(
		(row) =>
			!validateDraft(
				adapter.describe(row.node).name,
				adapter.attrs(row.node),
				adapter.contract?.(row.node),
			).ok,
	);
	const documentIssue = adapter.validate?.(state.draft) ?? adapter.validateTransition?.(state.base.value, state.draft) ?? null;
	const [newBlock, setNewBlock] = useState("");
	const [blockInsertionIssue, setBlockInsertionIssue] = useState<string | null>(
		null,
	);
	const [patternId, setPatternId] = useState("");
	const [insertionIssue, setInsertionIssue] = useState<string | null>(null);
	const pattern = adapter.availablePatterns?.find(
		(item) => item.id === patternId,
	);
	const insertPattern = () => {
		if (
			contentLocked ||
			current.current.pending ||
			current.current.conflict ||
			!pattern ||
			!adapter.createPattern
		)
			return;
		try {
			const additions = adapter.createPattern(pattern.id);
			const next = [...adapter.nodes(current.current.draft), ...additions];
			outline(next, adapter);
			const draft = adapter.withNodes(current.current.draft, next);
			const issue = adapter.validate?.(draft);
			if (issue) {
				setInsertionIssue(issue);
				return;
			}
			update(editDocument(current.current, draft));
			if (additions[0]) setSelection(adapter.id(additions[0]));
			setInsertionIssue(null);
		} catch {
			setInsertionIssue(
				"This section could not be added. Check the document size and available features. Your content has been kept.",
			);
		}
	};
	const selected = rows.find((row) => adapter.id(row.node) === selection)?.node;
	const layoutOptions = selected ? adapter.layoutOptions?.(selected) ?? {} : {};
	const treatmentOptions = selected ? adapter.treatmentOptions?.(selected) ?? [] : [];
	const movedDraft = (direction: -1 | 1) => {
		const now = current.current;
		if (!selected || visibleSelection.length !== 1 || contentLocked || now.pending || now.conflict || isBlockLocked(selected, "move")) return null;
		try {
			const next = adapter.withNodes(now.draft, moveNode(adapter.nodes(now.draft), adapter.id(selected), direction, adapter));
			if (adapter.validateTransition?.(now.base.value, next) || adapter.validateTransition?.(now.draft, next)) return null;
			return next;
		} catch { return null; }
	};
	const insertBlock = (inside: boolean) => {
		const now = current.current;
		if (
			lockedNow.current ||
			now.pending ||
			now.conflict ||
			!adapter.createBlock ||
			!adapter.availableBlocks?.some((block) => block.name === newBlock)
		)
			return;
		if (
			inside &&
			(!selected ||
				!adapter.supportsChildren?.(selected) ||
				isBlockLocked(selected, "edit"))
		)
			return;
		try {
			const node = adapter.createBlock(newBlock);
			const next = inside
				? changeNode(
						adapter.nodes(now.draft),
						adapter.id(selected!),
						adapter,
						(parent) =>
							adapter.withChildren(parent, [...adapter.children(parent), node]),
					)
				: [...adapter.nodes(now.draft), node];
			outline(next, adapter);
			update(editDocument(now, adapter.withNodes(now.draft, next)));
			setSelection(adapter.id(node));
			setBlockInsertionIssue(null);
		} catch {
			setBlockInsertionIssue(
				"This block could not be added. Check the document size and available features. Your content has been kept.",
			);
		}
	};

	const historyAllowed = (value: V | undefined) => {
		if (value === undefined || contentLocked || state.pending || state.conflict)
			return false;
		if (adapter.validateTransition) return !adapter.validateTransition(state.base.value, value) && !adapter.validateTransition(state.draft, value);
		const targets = new Map(
			outline(adapter.nodes(value), adapter).map((row) => [
				adapter.id(row.node),
				row.node,
			]),
		);
		return rows.every(({ node }) => {
			const target = targets.get(adapter.id(node));
			return target
				? !isBlockLocked(node, "edit") || sameDraft(node, target)
				: !isBlockLocked(node, "remove");
		});
	};
	const canUndo = historyAllowed(state.history.past.at(-1)?.value);
	const canRedo = historyAllowed(state.history.future.at(-1)?.value);
	const travel = (direction: "undo" | "redo", keyboard = false) => {
		if (lockedNow.current || !(direction === "undo" ? canUndo : canRedo))
			return;
		const next =
			direction === "undo"
				? undoDocument(current.current)
				: redoDocument(current.current);
		if (next === current.current) return;
		const active = editorElement.current?.ownerDocument.activeElement;
		if (
			keyboard &&
			active instanceof HTMLElement &&
			editorElement.current?.contains(active) &&
			active.matches("input,textarea,select")
		) {
			const field = active.closest<HTMLElement>("[data-field-path]");
			const controls = (field ?? editorElement.current).querySelectorAll(
				"input,textarea,select",
			);
			restoreFocus.current = {
				path: field?.dataset.fieldPath ?? null,
				index: Array.from(controls).indexOf(active),
				start:
					"selectionStart" in active
						? (active as HTMLInputElement).selectionStart
						: null,
				end:
					"selectionEnd" in active
						? (active as HTMLInputElement).selectionEnd
						: null,
			};
		}
		const oldIds = new Set(rows.map((row) => adapter.id(row.node)));
		const nextRows = outline(adapter.nodes(next.draft), adapter);
		const restored = nextRows.find((row) => !oldIds.has(adapter.id(row.node)));
		if (restored) setSelection(adapter.id(restored.node));
		else if (!nextRows.some((row) => adapter.id(row.node) === selection))
			setSelection(nextRows[0] ? adapter.id(nextRows[0].node) : null);
		formGenerationRef.current++;
		setFormGeneration(formGenerationRef.current);
		typingGroup.current++;
		update(next);
	};

	const commit = async () => {
		if (lockedNow.current) return;
		if (
			outline(adapter.nodes(current.current.draft), adapter).some(
				(row) =>
					!validateDraft(
						adapter.describe(row.node).name,
						adapter.attrs(row.node),
						adapter.contract?.(row.node),
					).ok,
			)
		)
			return;
		if (adapter.validate?.(current.current.draft) || adapter.validateTransition?.(current.current.base.value, current.current.draft)) return;
		if (adapter.prepareSave)
			update(
				editDocument(
					current.current,
					adapter.prepareSave(current.current.draft),
					{ record: false },
				),
			);
		const next = beginSave(current.current),
			request = next.pending;
		if (!request || current.current.pending) return;
		update(next);
		try {
			const receipt = await save(request);
			if (mounted.current)
				update(acceptSave(current.current, request, receipt));
		} catch {
			// Provider/transport errors may contain private diagnostic data. The
			// endpoint adapter can expose a closed conflict DTO via the subscription.
			if (mounted.current)
				update(
					rejectSave(
						current.current,
						request,
						"Your changes are still here. Reload the current revision before trying again.",
					),
				);
		}
	};
	const insertAdditional = (
		transform: (draft: V) => { draft: V; id: string },
	): boolean => {
		const now = current.current;
		if (
			!mounted.current ||
			lockedNow.current ||
			now.pending ||
			now.conflict ||
			now.base.revision !== state.base.revision
		)
			return false;
		try {
			const next = transform(now.draft),
				nextAdapter = adapterForDraft?.(next.draft) ?? savedAdapter;
			outline(nextAdapter.nodes(next.draft), nextAdapter);
			if (nextAdapter.validateTransition?.(now.base.value, next.draft) || nextAdapter.validateTransition?.(now.draft, next.draft)) return false;
			update(editDocument(now, next.draft));
			setSelection(next.id);
			return true;
		} catch {
			return false;
		}
	};

	return (
		<section
			ref={editorElement}
			onFocusCapture={() => {
				typingGroup.current++;
			}}
			onKeyDown={(event) => {
				if (
					event.defaultPrevented ||
					event.nativeEvent.isComposing ||
					event.altKey ||
					!(event.metaKey || event.ctrlKey)
				)
					return;
				const key = event.key.toLowerCase();
				const direction =
					key === "z"
						? event.shiftKey
							? "redo"
							: "undo"
						: key === "y" && event.ctrlKey && !event.shiftKey
							? "redo"
							: null;
				if (!direction) return;
				event.preventDefault();
				event.stopPropagation();
				travel(direction, true);
			}}
			aria-label="Document editor"
			className={
				livePreview
					? "grid items-start gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]"
					: "space-y-4"
			}
		>
			<div className="min-w-0 space-y-4">
				{needsRecoveryChoice && (
					<section role="alert" className="space-y-3 rounded border border-border bg-muted/40 p-4 text-sm">
						<p className="font-medium">A recovery draft is available on this device</p>
						<p>It has not changed the saved Website. Restore it to continue editing, or discard this device copy.</p>
						<div className="flex flex-wrap gap-2">
							<button type="button" disabled={externallyLocked} onClick={() => chooseRecovery(true)} className="min-h-11 rounded border px-3 focus-visible:ring-2 focus-visible:ring-ring">Restore device draft</button>
							<button type="button" disabled={externallyLocked} onClick={() => chooseRecovery(false)} className="min-h-11 rounded border px-3 focus-visible:ring-2 focus-visible:ring-ring">Discard device draft</button>
						</div>
					</section>
				)}
				{privateDraft.offered && (
					<section role="alert" className="space-y-3 rounded border border-border bg-muted/40 p-4 text-sm">
						<p className="font-medium">{privateDraft.offered.draft === null ? "The private Website draft was discarded" : "A private draft is saved on this Website"}</p>
						<p>{state.conflict ? "Resolve the saved revision below before choosing which private draft to keep." : "Choose which content to keep editing. This choice does not change the published Website."}</p>
						<div className="flex flex-wrap gap-2">
							<button type="button" disabled={externallyLocked || needsRecoveryChoice || !!state.pending || !!state.conflict} onClick={() => privateDraft.choose("restore")} className="min-h-11 rounded border px-3 focus-visible:ring-2 focus-visible:ring-ring">{privateDraft.offered.draft === null ? "Use saved document" : "Restore Website draft"}</button>
							<button type="button" disabled={externallyLocked || needsRecoveryChoice || !!state.pending || !!state.conflict} onClick={() => privateDraft.choose("current")} className="min-h-11 rounded border px-3 focus-visible:ring-2 focus-visible:ring-ring">{state.dirty ? "Keep current editor draft" : "Discard Website draft"}</button>
						</div>
					</section>
				)}
				{privateDraft.status === "loading" && <p role="status" className="text-sm text-muted-foreground">Checking your private Website draft…</p>}
				{privateDraft.status === "revision-conflict" && <p role="status" className="text-sm text-muted-foreground">Site autosave is paused while the saved revision is resolved. Your edits remain in this window.</p>}
				{privateDraft.status === "error" && (
					<div role="alert" className="space-y-2 rounded border p-3 text-sm">
						<p>Site autosave is unavailable. Your edits remain in this window. Retry autosave or save changes.</p>
						<button type="button" disabled={externallyLocked || needsRecoveryChoice} onClick={() => void privateDraft.retry()} className="min-h-11 rounded border px-3">Retry site autosave</button>
					</div>
				)}
				<fieldset disabled={contentLocked} className="contents">
					<header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
						<div>
							<h1 className="text-xl font-semibold tracking-tight">
								{proposal ? "Review proposal" : "Edit document"}
							</h1>
							<p role="status" className="text-sm text-muted-foreground">
								{invalid || documentIssue
									? "Some fields need attention"
									: state.pending
										? "Saving changes…"
										: state.dirty
											? "Unsaved changes"
											: proposal
												? "Proposal matches the saved document"
												: "All changes saved"}
							</p>
							{hasUnsavedWork && recovered?.persistenceStatus() === "saved" && (
								<p role="status" className="text-xs text-muted-foreground">Draft saved on this device. Save changes to update the Website.</p>
							)}
							{privateDraft.status === "waiting" && <p role="status" className="text-xs text-muted-foreground">Waiting to autosave your private Website draft…</p>}
							{privateDraft.status === "saving" && <p role="status" className="text-xs text-muted-foreground">Autosaving your private Website draft…</p>}
							{privateDraft.status === "saved" && !privateDraft.offered && <p role="status" className="text-xs text-muted-foreground">Private Website draft autosaved. Save changes to update the Website.</p>}
							{recovered?.persistenceStatus() === "failed" && (
								<p role="alert" className="text-xs text-destructive">Device recovery is unavailable. Save or copy your changes before closing this window.</p>
							)}
							{recovered?.persistenceStatus() === "conflict" && (
								<p role="alert" className="text-xs text-destructive">Another window changed the recovery draft. Your edits remain in this window; save or copy them before closing.</p>
							)}
						</div>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								onClick={() => travel("undo")}
								disabled={!canUndo}
								aria-keyshortcuts="Control+z Meta+z"
								className="min-h-11 rounded-md border px-3 text-sm disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
							>
								Undo
							</button>
							<button
								type="button"
								onClick={() => travel("redo")}
								disabled={!canRedo}
								aria-keyshortcuts="Control+Shift+z Meta+Shift+z Control+y"
								className="min-h-11 rounded-md border px-3 text-sm disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
							>
								Redo
							</button>
							{(onPreview || proposal) && (
								<button
									type="button"
									onClick={() =>
										proposal
											? proposal.onPreview(current.current.draft)
											: onPreview?.()
									}
									disabled={
										(proposal ? invalid || !!documentIssue : state.dirty) ||
										!!state.pending ||
										!!state.conflict
									}
									className="min-h-11 rounded-md border px-4 text-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
								>
									{proposal ? "Preview proposal" : "Preview saved document"}
								</button>
							)}
							<button
								type="button"
								onClick={() => void commit()}
								disabled={
									invalid ||
									!!documentIssue ||
									!state.dirty ||
									!!state.pending ||
									!!state.conflict
								}
								className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
							>
								{proposal ? "Apply proposal" : "Save changes"}
							</button>
						</div>
					</header>
					{adapter.title && adapter.withTitle && (
						<label className="block space-y-2 text-sm font-medium">
							Document title
							<input
								value={adapter.title(state.draft)}
								maxLength={512}
								onChange={(event) =>
									update(
										editDocument(
											current.current,
											adapter.withTitle!(
												current.current.draft,
												event.target.value,
											),
											{ group: `title:${typingGroup.current}`, at: Date.now() },
										),
									)
								}
								className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-lg"
							/>
						</label>
					)}
					{documentIssue && (
						<p role="alert" className="text-sm text-destructive">
							{documentIssue}
						</p>
					)}
					<InsertionTabs
						blocks={
							adapter.availableBlocks &&
							adapter.createBlock && (
								<div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
									<BlockInserter
										blocks={adapter.availableBlocks}
										selected={newBlock}
										onSelect={setNewBlock}
										disabled={
											contentLocked || !!state.pending || !!state.conflict
										}
									/>
									<button
										type="button"
										disabled={
											!adapter.availableBlocks.some(
												(block) => block.name === newBlock,
											) ||
											!!state.pending ||
											!!state.conflict
										}
										className="min-h-11 rounded-md border px-4 text-sm disabled:opacity-50"
										onClick={() => insertBlock(false)}
									>
										Add to document
									</button>
									{selected && adapter.supportsChildren?.(selected) && (
										<button
											type="button"
											disabled={
												!adapter.availableBlocks.some(
													(block) => block.name === newBlock,
												) ||
												!!state.conflict ||
												!!state.pending ||
												isBlockLocked(selected, "edit")
											}
											className="min-h-11 rounded-md border px-4 text-sm disabled:opacity-50"
											onClick={() => insertBlock(true)}
										>
											Add inside selected block
										</button>
									)}
									{blockInsertionIssue && (
										<p role="alert" className="w-full text-sm text-destructive">
											{blockInsertionIssue}
										</p>
									)}
								</div>
							)
						}
						patterns={
							!!adapter.availablePatterns?.length &&
							adapter.createPattern && (
								<div className="rounded-lg border border-border bg-muted/20 p-4">
									<div className="flex flex-wrap items-end gap-3">
										<label className="min-w-48 flex-1 space-y-2 text-sm font-medium">
											<span>Start with a designed section</span>
											<select
												aria-label="Template section"
												value={pattern?.id ?? ""}
												onChange={(event) => {
													setPatternId(event.target.value);
													setInsertionIssue(null);
												}}
												className="min-h-11 w-full rounded-md border border-border bg-background px-3 font-normal"
											>
												<option value="">
													Browse this template’s sections
												</option>
												{adapter.availablePatterns.map((item) => (
													<option key={item.id} value={item.id}>
														{item.title}
													</option>
												))}
											</select>
										</label>
										<button
											type="button"
											onClick={insertPattern}
											disabled={!pattern || !!state.pending || !!state.conflict}
											className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
										>
											Insert section
										</button>
									</div>
									<p className="mt-3 text-sm text-muted-foreground">
										{pattern?.description ??
											"Ready-made sections styled for your template. Every block stays editable."}
									</p>
									{insertionIssue && (
										<p role="alert" className="mt-2 text-sm text-destructive">
											{insertionIssue}
										</p>
									)}
								</div>
							)
						}
						saved={additionalInsertion?.({
							revision: state.base.revision,
							disabled: contentLocked || !!state.pending || !!state.conflict,
							insert: insertAdditional,
						})}
						create={creationActions?.({
							insertionDisabled:
								contentLocked || !!state.pending || !!state.conflict,
							revision: state.base.revision,
							insert: insertAdditional,
							disabled:
								state.dirty ||
								!!state.pending ||
								invalid ||
								!!documentIssue ||
								!!state.conflict,
						})}
					/>
					{state.conflict && !state.pending && (
						<div
							role="alert"
							className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
						>
							<p>
								{state.conflict.revision > state.base.revision
									? "This document has a newer saved revision. Your changes have been kept here."
									: "The saved document changed while you were disconnected. Your changes have been kept here."}
							</p>
							<button
								type="button"
								className="mt-2 min-h-11 underline underline-offset-4"
								onClick={() => {
									formGenerationRef.current++;
									setFormGeneration(formGenerationRef.current);
									update(reloadDocument(current.current));
								}}
							>
								Discard my changes and load the saved revision
							</button>
							<button type="button" className="mt-2 ml-4 min-h-11 underline underline-offset-4" onClick={() => {
								if (lockedNow.current || current.current.pending) return;
								update(keepDraftAgainstCurrent(current.current));
							}}>
								Keep my changes against the saved revision
							</button>
						</div>
					)}
					{state.recoveryNotice && (
						<p
							role="status"
							className="rounded-md border border-border bg-muted/30 p-4 text-sm"
						>
							{state.recoveryNotice}
						</p>
					)}
					{state.error && (
						<p
							role="alert"
							className="rounded-md border border-destructive/40 p-4 text-sm"
						>
							{state.error}
						</p>
					)}
					<div
						className={
							livePreview
								? "space-y-4"
								: "grid gap-6 lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]"
						}
					>
						<CanonicalOutline
							nodes={nodes}
							adapter={adapter}
							describe={adapter.describe}
							selectedId={selection}
							selectedIds={visibleSelection}
							hoveredId={hoveredId}
							onToggle={(id) => selectOutline(id, { toggle: true })}
							onSelectAll={() => {
								setSelectionIds(rows.map((row) => adapter.id(row.node)));
							}}
							onRemove={canRemoveSelection ? removeSelection : undefined}
							onSelect={selectOutline}
						/>
						<div className="min-w-0 rounded-lg border border-border bg-card p-5">
							{visibleSelection.length > 0 && adapter.createBlock && (
								<div className="mb-4 flex items-center justify-between gap-3">
									{visibleSelection.length > 1 && (
										<p className="text-sm text-muted-foreground">
											{visibleSelection.length} blocks selected
										</p>
									)}
									<button
										type="button"
										disabled={!canRemoveSelection}
										onClick={removeSelection}
										className="min-h-11 rounded border border-destructive/30 px-3 text-sm text-destructive disabled:opacity-50"
									>
										{visibleSelection.length > 1
											? `Remove ${visibleSelection.length} selected blocks`
											: "Remove selected block"}
									</button>
								</div>
							)}
							{selected &&
							adapter.withStyle &&
							adapter.styleOptions?.(selected).length
								? (() => {
										const choices = adapter.styleOptions!(selected);
										const saved = adapter.styleValue?.(selected) ?? "default";
										const unavailable = !choices.includes(saved);
										if (choices.length < 2 && !unavailable) return null;
										return (
											<div className="mb-5 space-y-2">
												<label
													htmlFor={styleControlId}
													className="block text-sm font-medium"
												>
													Block style
												</label>
												<select
													id={styleControlId}
													className="mt-2 block min-h-11 w-full rounded-md border border-input bg-background px-3"
													value={saved}
													disabled={
														!!state.pending ||
														contentLocked ||
														isBlockLocked(selected, "edit")
													}
													onChange={(event) => {
														const style = event.currentTarget.value,
															now = current.current;
														if (
															!mounted.current ||
															lockedNow.current ||
															now.pending ||
															isBlockLocked(selected, "edit")
														)
															return;
														const next = changeNode(
															adapter.nodes(now.draft),
															adapter.id(selected),
															adapter,
															(node) => adapter.withStyle!(node, style),
														);
														update(
															editDocument(
																now,
																adapter.withNodes(now.draft, next),
															),
														);
													}}
												>
													{unavailable && (
														<option value={saved} disabled>
															Default (saved style: {saved})
														</option>
													)}
													{choices.map((style) => (
														<option key={style} value={style}>
															{style.charAt(0).toUpperCase() +
																style.slice(1).replaceAll("-", " ")}
														</option>
													))}
												</select>
												{unavailable && (
													<p className="text-sm text-muted-foreground">
														This template displays the default style. Your saved
														“{saved}” style is kept until you choose another.
													</p>
												)}
											</div>
										);
									})()
								: null}
							{selected && <div className="mb-4 flex gap-2">
								{([-1, 1] as const).map(direction => <button key={direction} type="button" className="min-h-11 rounded-md border border-input px-3 text-sm disabled:opacity-50" disabled={!movedDraft(direction)} onClick={() => {
									const next = movedDraft(direction);
									if (mounted.current && !lockedNow.current && next) update(editDocument(current.current, next));
								}}>Move {direction === -1 ? "up" : "down"}</button>)}
							</div>}
							{selected && adapter.withVisibility && adapter.visibilityValue?.(selected) !== undefined && <BlockVisibilityControls
								value={adapter.visibilityValue!(selected)!}
								disabled={contentLocked || !!state.pending || !!state.conflict || isBlockLocked(selected, "edit")}
								onChange={visibility => {
									const now = current.current;
									if (!mounted.current || lockedNow.current || now.pending || now.conflict || isBlockLocked(selected, "edit")) return;
									const next = changeNode(adapter.nodes(now.draft), adapter.id(selected), adapter, node => adapter.withVisibility!(node, visibility));
									update(editDocument(now, adapter.withNodes(now.draft, next)));
								}}
							/>}
							{selected && adapter.withLock && <BlockLockControls
								value={operation => adapter.lockValue?.(selected, operation) ?? false}
								disabled={contentLocked || !!state.pending || !!state.conflict}
								onChange={(operation, enabled) => {
									const now = current.current;
									if (!mounted.current || lockedNow.current || now.pending || now.conflict) return;
									const next = changeNode(adapter.nodes(now.draft), adapter.id(selected), adapter, node => adapter.withLock!(node, operation, enabled));
									update(editDocument(now, adapter.withNodes(now.draft, next)));
								}}
							/>}
							{selected && adapter.withTreatment && adapter.withTreatmentAxis &&
								(treatmentOptions.length > 0 || adapter.treatmentValue?.(selected)) && (
									<TreatmentControls
										options={treatmentOptions}
										value={adapter.treatmentValue?.(selected) ?? ""}
										axisValue={field => adapter.treatmentAxisValue?.(selected, field) ?? ""}
										disabled={contentLocked || !!state.pending || !!state.conflict || !!isBlockLocked(selected, "edit")}
										onChange={(value, field) => {
											const now = current.current;
											if (!mounted.current || lockedNow.current || now.pending || now.conflict || isBlockLocked(selected, "edit")) return;
											const next = changeNode(adapter.nodes(now.draft), adapter.id(selected), adapter, node =>
												field === undefined ? adapter.withTreatment!(node, value) : adapter.withTreatmentAxis!(node, field, value));
											update(editDocument(now, adapter.withNodes(now.draft, next)));
										}}
									/>
								)}
							{selected &&
								adapter.withLayout &&
								Object.keys(layoutOptions).length > 0 && (
									<fieldset
										className="mb-5 space-y-3"
										disabled={
											contentLocked ||
											!!state.pending ||
											!!state.conflict ||
											isBlockLocked(selected, "edit")
										}
									>
										<legend className="mb-2 text-sm font-semibold">
											Block layout
										</legend>
										<div className="grid gap-3 sm:grid-cols-2">
											{Object.entries(layoutOptions).map(([field, choices]) => (
												<label key={field} className="space-y-1 text-sm">
													<span>
														{field === "align"
															? "Alignment"
															: field.charAt(0).toUpperCase() + field.slice(1)}
													</span>
													<select
														aria-label={`Block ${field}`}
														className="block min-h-11 w-full rounded-md border border-input bg-background px-3"
														value={adapter.layoutValue?.(selected, field) ?? ""}
														onChange={(event) => {
															const now = current.current;
															if (
																!mounted.current ||
																lockedNow.current ||
																now.pending ||
																now.conflict ||
																isBlockLocked(selected, "edit")
															)
																return;
															const value = event.currentTarget.value;
															const next = changeNode(
																adapter.nodes(now.draft),
																adapter.id(selected),
																adapter,
																(node) =>
																	adapter.withLayout!(node, field, value),
															);
															update(
																editDocument(
																	now,
																	adapter.withNodes(now.draft, next),
																),
															);
														}}
													>
														<option value="">Template default</option>
														{choices.map((value) => (
															<option key={value} value={value}>
																{value === "default"
																	? "Standard"
																	: value.charAt(0).toUpperCase() +
																		value.slice(1)}
															</option>
														))}
													</select>
												</label>
											))}
										</div>
									</fieldset>
								)}
							{selected &&
								adapter.withAnchor &&
								adapter.anchorValue?.(selected) !== undefined && (
									<label className="mb-5 block space-y-1 text-sm">
										<span>Block anchor</span>
										<input
											aria-label="Block anchor"
											className="block min-h-11 w-full rounded-md border border-input bg-background px-3"
											maxLength={101}
											value={adapter.anchorValue(selected)}
											disabled={
												contentLocked ||
												!!state.pending ||
												!!state.conflict ||
												isBlockLocked(selected, "edit")
											}
											onChange={(event) => {
												const now = current.current;
												if (
													!mounted.current ||
													lockedNow.current ||
													now.pending ||
													now.conflict ||
													isBlockLocked(selected, "edit")
												)
													return;
												const value = event.currentTarget.value;
												const next = changeNode(
													adapter.nodes(now.draft),
													adapter.id(selected),
													adapter,
													(node) => adapter.withAnchor!(node, value),
												);
												update(
													editDocument(
														now,
														adapter.withNodes(now.draft, next),
														{
															group: `anchor:${adapter.id(selected)}:${typingGroup.current}`,
															at: Date.now(),
														},
													),
												);
											}}
										/>
										<span className="block text-xs text-muted-foreground">
											Optional address for links to this block. Start with a
											letter and use letters, numbers, hyphens or underscores.
										</span>
									</label>
								)}
							{selected ? (
								<SelectedFields
									key={`${adapter.id(selected)}:${state.base.revision}:${formGeneration}`}
									mode="preview"
									blockId={adapter.id(selected)}
									{...adapter.describe(selected)}
									contract={adapter.contract?.(selected)}
									value={adapter.attrs(selected)}
									revision={String(state.base.revision)}
									scope={state.base.key}
									pickResource={pickResource}
									disabled={isBlockLocked(selected, "edit")}
									onDraftChange={(preview) => {
										const attrs = preview.draft;
										const now = current.current;
										if (
											!mounted.current ||
											formGeneration !== formGenerationRef.current ||
											isBlockLocked(selected, "edit") ||
											preview.revision !== String(now.base.revision) ||
											preview.scope.websiteKey !== now.base.key.websiteKey ||
											preview.scope.instanceKey !== now.base.key.instanceKey
										)
											return;
										const nextNodes = changeNode(
											adapter.nodes(now.draft),
											preview.blockId,
											adapter,
											(node) => adapter.withAttrs(node, attrs),
										);
										update(
											editDocument(
												now,
												adapter.withNodes(now.draft, nextNodes),
												{
													group: `fields:${preview.blockId}:${typingGroup.current}`,
													at: Date.now(),
												},
											),
										);
									}}
								/>
							) : (
								<p className="text-sm text-muted-foreground">
									Select a block from the outline.
								</p>
							)}
						</div>
					</div>
				</fieldset>
				{publicationActions?.({
					disabled:
						needsRecoveryChoice || privateDraft.locked ||
						state.dirty ||
						!!state.pending ||
						invalid ||
						!!documentIssue ||
						!!state.conflict,
				})}
			</div>
			{livePreview && (
				<aside
					aria-label="Live Website preview"
					className="min-w-0 xl:sticky xl:top-4"
				>
					{livePreview({
						draft: state.draft,
						revision: state.base.revision,
						available:
							!invalid && !documentIssue && !state.conflict && !contentLocked,
						selectedId: selection,
						onHover: (id) =>
							setHoveredId(
								id !== null && rows.some((row) => adapter.id(row.node) === id)
									? id
									: null,
							),
						onSelect: (id) => {
							if (rows.some((row) => adapter.id(row.node) === id))
								setSelection(id);
						},
					})}
				</aside>
			)}
		</section>
	);
}

/** Keep the form's initial baseline stable while parent state retains every raw
 * edit. A selection or server revision change remounts with the right draft. */
function SelectedFields(props: ComponentProps<typeof SchemaBlockForm>) {
	const [baseline] = useState(props.value);
	return <SchemaBlockForm {...props} value={baseline} />;
}
