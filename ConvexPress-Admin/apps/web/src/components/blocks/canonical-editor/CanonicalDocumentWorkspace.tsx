import { getErrorMessage } from "../../../lib/utils";
import { ElementCreator, type ElementCreation } from "./ElementCreator";
import { SavedContentInserter } from "./SavedContentInserter";
import {
	CanonicalSettingsControls,
	type DocumentSettingsClient,
} from "./CanonicalSettingsControls";
import {
	CanonicalPublicationControls,
	type PublicationRequest,
} from "./CanonicalPublicationControls";
import {
	CanonicalMigrationReview,
	type MigrationClient,
} from "./CanonicalMigrationReview";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type ComponentProps,
} from "react";
import {
	canonicalRevisionPageSchema,
	canonicalWriteReceiptSchema,
	canonicalRecoveryReceiptSchema,
	type CanonicalDocumentRead,
	type CanonicalRevisionPage,
} from "@backend/canonical-blocks-foundation/documentContracts";
import { NativeDraftPreview } from "./NativeDraftPreview";
import { CanonicalEditor } from "./CanonicalEditor";
import {
	canonicalEditorAdapter,
	checkedDraft,
	draftDigest,
	documentSnapshot,
	readForEditor,
	verifiedWriteSnapshot,
	type CanonicalDraft,
} from "./document-adapter";
import type { DocumentKey, SaveRequest } from "./session";
import type { SchemaBlockForm } from "../schema-editor/SchemaBlockForm";
import { CustomBlockPicker } from "./CustomBlockPicker";
import type { CustomBlockClient } from "./composed-picker";
import { CanonicalAiComposer } from "./CanonicalAiComposer";
import type { AiProposalClient, AiProposalRequest } from "./ai-proposal";

export interface CanonicalDocumentClient
	extends Partial<MigrationClient>,
		Partial<DocumentSettingsClient>,
		Partial<CustomBlockClient>,
		Partial<AiProposalClient> {
	get(request?: Record<string, string>): Promise<unknown>;
	previewDraft?(args: {
		expectedRevision: number;
		title: string;
		blocks: CanonicalDraft["blocks"];
		request?: Record<string, string>;
	}): Promise<unknown>;
	initialize(args: {
		expectedRevision: number;
		expectedAuthoringDigest: string;
		title: string;
		blocks: CanonicalDraft["blocks"];
	}): Promise<unknown>;
	save(args: {
		expectedRevision: number;
		title: string;
		blocks: CanonicalDraft["blocks"];
	}): Promise<unknown>;
	restore(args: {
		expectedRevision: number;
		expectedAuthoringDigest?: string;
		revisionId: string;
	}): Promise<unknown>;
	recoverLegacy?(args: {
		expectedRevision: number;
		revisionId: string;
	}): Promise<unknown>;
	pageRevisions(cursor: string | null): Promise<unknown>;
	setPublication?(args: PublicationRequest): Promise<unknown>;
}
export interface CanonicalDocumentWorkspaceProps {
	documentKey: DocumentKey;
	siteOrigin?: string;
	read: unknown;
	client: CanonicalDocumentClient;
	pickResource: NonNullable<
		ComponentProps<typeof SchemaBlockForm>["pickResource"]
	>;
	canPublish?: boolean;
	canAi?: boolean;
	elementCreation?: ElementCreation;
	onAiPreview?: (
		document: import("@backend/canonical-blocks-foundation/documentContracts").CanonicalDocumentDto,
		request: AiProposalRequest,
	) => void;
	onRecovered?: () => void;
	onDirtyChange?: (dirty: boolean) => void;
	onPreview?: (
		document: import("@backend/canonical-blocks-foundation/documentContracts").CanonicalDocumentDto,
	) => void;
}
/** Mounted only inside the current verified native client. No fallback writes. */
export function CanonicalDocumentWorkspace(
	props: CanonicalDocumentWorkspaceProps,
) {
	return <WorkspaceBody key={JSON.stringify(props.documentKey)} {...props} />;
}
function WorkspaceBody({
	documentKey,
	siteOrigin,
	read,
	client,
	pickResource,
	onPreview,
	canPublish = false,
	canAi = false,
	elementCreation,
	onAiPreview,
	onRecovered,
	onDirtyChange,
}: CanonicalDocumentWorkspaceProps) {
	const value = useMemo(
		() => readForEditor(read, documentKey),
		[read, documentKey],
	);
	const current = useRef<{ value: CanonicalDocumentRead; active: boolean }>({
		value,
		active: true,
	});
	current.current.value = value;
	useEffect(() => {
		current.current.active = true;
		return () => {
			current.current.active = false;
		};
	}, []);
	const [busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null),
		[showRevisions, setShowRevisions] = useState(false);
	const [opened, setOpened] = useState<CanonicalDocumentRead>(null);
	const [settingsEditing, setSettingsEditing] = useState(false);
	const [aiEditing, setAiEditing] = useState(false);
	const [elementEditing, setElementEditing] = useState(false);
	const [editorDirty, setEditorDirty] = useState(false);
	useEffect(() => {
		onDirtyChange?.(editorDirty || aiEditing || elementEditing);
	}, [onDirtyChange, editorDirty, aiEditing, elementEditing]);
	useEffect(
		() => () => {
			onDirtyChange?.(false);
		},
		[onDirtyChange],
	);
	// A direct reopen follows each receipt. Reactive newer revisions still win.
	const latest =
		opened && value && opened.document.revision > value.document.revision
			? opened
			: value;
	const adapterForDraft = useMemo(() => {
		if (latest?.contract !== "canonical-document-v1") return undefined;
		let definitions = latest.document.composedDefinitions;
		let cached = canonicalEditorAdapter(
			latest.policy,
			latest.presentation.packId,
			definitions,
		);
		return (draft: CanonicalDraft) => {
			if (definitions !== draft.composedDefinitions) {
				definitions = draft.composedDefinitions;
				cached = canonicalEditorAdapter(
					latest.policy,
					latest.presentation.packId,
					definitions,
				);
			}
			return cached;
		};
	}, [latest]);
	const refresh = async () => {
		const next = readForEditor(await client.get(), documentKey);
		if (!current.current.active)
			throw new Error("The editor environment changed.");
		if (!next) throw new Error("This document is no longer available.");
		setOpened(next);
		return next;
	};
	if (!latest)
		return <p role="status">This document is no longer available.</p>;
	if (latest.contract === "canonical-initialization-v1")
		return (
			<section
				aria-label="Start block document"
				className="mx-auto max-w-2xl space-y-4 rounded-xl border border-border bg-card p-8"
			>
				<p className="text-sm text-muted-foreground">
					Original editor document
				</p>
				<h1 className="font-serif text-3xl">
					{latest.document.title || "Untitled document"}
				</h1>
				<p className="text-sm text-muted-foreground">
					{latest.initialization.eligible
						? "Start with an empty page, then add and arrange content using your installed template."
						: "This document already has authored content or uses a format that needs an explicit migration. Its existing content has been preserved."}
				</p>
				{error && <p role="alert">{error}</p>}
				<button
					type="button"
					className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
					disabled={!latest.initialization.eligible || busy}
					onClick={() =>
						void (async () => {
							if (busy) return;
							setBusy(true);
							setError(null);
							try {
								const receipt = canonicalWriteReceiptSchema.parse(
									await client.initialize({
										expectedRevision: latest.document.revision,
										expectedAuthoringDigest: latest.document.authoringDigest,
										title: latest.document.title,
										blocks: [],
									}),
								);
								if (receipt.postId !== documentKey.documentId)
									throw new Error("Wrong document");
								const next = await refresh();
								if (
									next.contract !== "canonical-document-v1" ||
									next.document.revision < receipt.revision
								)
									throw new Error("Reopen failed");
							} catch {
								if (current.current.active)
									setError(
										"The draft could not be opened. Reload its current revision and try again.",
									);
							} finally {
								if (current.current.active) setBusy(false);
							}
						})()
					}
				>
					{busy ? "Opening block editor…" : "Use block editor"}
				</button>
				{!latest.initialization.eligible &&
					latest.initialization.reason === "existing-authored-content" &&
					client.prepareMigration &&
					client.migrate && (
						<CanonicalMigrationReview
							key={latest.document.authoringDigest}
							documentKey={documentKey}
							source={latest}
							client={{
								prepareMigration: client.prepareMigration,
								migrate: client.migrate,
							}}
							onMigrated={refresh}
						/>
					)}
				<RevisionHistory
					key={latest.document.revision}
					client={client}
					revision={latest.document.revision}
					authoringDigest={latest.document.authoringDigest}
					onRestored={refresh}
					documentKey={documentKey}
					onRecovered={onRecovered}
				/>
			</section>
		);
	const snapshot = documentSnapshot(latest, documentKey);
	const save = async (request: SaveRequest<CanonicalDraft>) => {
		if (!current.current.active)
			throw new Error("The editor environment changed.");
		const draft = checkedDraft(request.value);
		const verified = verifiedWriteSnapshot(
			await client.save({
				expectedRevision: request.revision,
				title: draft.title,
				blocks: draft.blocks,
			}),
			request,
		);
		const next = await refresh();
		if (
			next.contract !== "canonical-document-v1" ||
			next.document.revision < verified.revision
		)
			throw new Error("Reopen failed");
		if (
			next.document.revision === verified.revision &&
			next.document.digest !== draftDigest(verified.value)
		)
			throw new Error("Reopen mismatch");
		return verified;
	};
	return (
		<div className="space-y-5">
			<CanonicalEditor
				livePreview={
					siteOrigin && client.previewDraft
						? ({
								draft,
								revision,
								available,
								selectedId,
								onSelect,
								onHover,
							}) =>
								available ? (
									<NativeDraftPreview
										source={latest}
										documentKey={documentKey}
										siteOrigin={siteOrigin}
										client={client}
										draft={draft}
										revision={revision}
										selectedId={selectedId}
										onSelect={onSelect}
										onHover={onHover}
									/>
								) : (
									<p
										role="status"
										className="rounded-xl border p-6 text-sm text-muted-foreground"
									>
										Live preview is paused. Resolve the fields or document
										conflict to continue.
									</p>
								)
						: undefined
				}
				onDirtyChange={setEditorDirty}
				contentLocked={settingsEditing || aiEditing}
				snapshot={snapshot}
				authorityReady
				adapter={canonicalEditorAdapter(
					latest.policy,
					latest.presentation.packId,
					latest.document.composedDefinitions,
				)}
				adapterForDraft={adapterForDraft}
				additionalInsertion={({ revision, disabled, insert }) => (
					<>
						<SavedContentInserter
							key={`saved:${documentKey.generation}:${documentKey.documentId}:${revision}`}
							scope={latest.scope}
							revision={revision}
							policy={latest.policy}
							packId={latest.presentation.packId}
							disabled={disabled}
							pickResource={pickResource}
							insert={insert}
						/>
						{client.listCustomBlocks && client.selectCustomBlock && (
							<CustomBlockPicker
								key={`${documentKey.generation}:${documentKey.websiteKey}:${documentKey.instanceKey}:${documentKey.documentId}:${revision}`}
								client={client as CustomBlockClient}
								scope={latest.scope}
								revision={revision}
								policy={latest.policy}
								disabled={disabled}
								insert={insert}
							/>
						)}
					</>
				)}
				save={save}
				pickResource={pickResource}
				onPreview={onPreview ? () => onPreview(latest) : undefined}
				creationActions={({
					disabled,
					insertionDisabled,
					revision,
					insert,
				}) => {
					const element =
						elementCreation &&
						client.selectCustomBlock &&
						client.listCustomBlocks;
					const pageAi =
						canAi &&
						client.generateAi &&
						client.previewAi &&
						client.applyAi &&
						onAiPreview;
					if (!element && !pageAi) return null;
					return (
						<div className="space-y-4">
							{element && (
								<ElementCreator
									key={JSON.stringify([
										documentKey,
										latest.scope,
										latest.presentation.packId,
									])}
									creation={elementCreation!}
									packId={latest.presentation.packId}
									revision={revision}
									policy={latest.policy}
									disabled={insertionDisabled || settingsEditing || aiEditing}
									picker={client as CustomBlockClient}
									insert={insert}
									onEditingChange={setElementEditing}
								/>
							)}
							{pageAi && (
								<CanonicalAiComposer
									key={`${documentKey.generation}:${documentKey.documentId}`}
									documentKey={documentKey}
									source={latest}
									client={client as CanonicalDocumentClient & AiProposalClient}
									disabled={disabled || settingsEditing || elementEditing}
									pickResource={pickResource}
									onEditingChange={setAiEditing}
									onSaved={refresh}
									onPreview={onAiPreview!}
								/>
							)}
						</div>
					);
				}}
				publicationActions={({ disabled }) => (
					<>
						{client.getSettings && client.setSettings && (
							<CanonicalSettingsControls
								key={documentKey.documentId}
								postId={documentKey.documentId}
								revision={latest.document.revision}
								disabled={disabled}
								client={
									client as CanonicalDocumentClient & DocumentSettingsClient
								}
								onSaved={refresh}
								onEditingChange={setSettingsEditing}
							/>
						)}
						{canPublish && client.setPublication && (
							<CanonicalPublicationControls
								key={`${latest.document.revision}:${latest.document.status}`}
								document={latest}
								disabled={disabled || settingsEditing}
								publish={async (args) => {
									const receipt = canonicalWriteReceiptSchema.parse(
										await client.setPublication!(args),
									);
									if (
										receipt.postId !== documentKey.documentId ||
										receipt.revision !==
											args.expectedRevision + (receipt.changed ? 1 : 0) ||
										receipt.digest !== latest.document.digest
									)
										throw new Error("Publication receipt mismatch");
									const next = await refresh();
									if (
										next.contract !== "canonical-document-v1" ||
										next.document.revision < receipt.revision ||
										next.document.status !== args.status
									)
										throw new Error("Publication reopen mismatch");
								}}
							/>
						)}
					</>
				)}
			/>
			<div className="border-t border-border pt-4">
				<button
					type="button"
					className="min-h-11 rounded-md border px-4 text-sm"
					disabled={settingsEditing}
					onClick={() => setShowRevisions(!showRevisions)}
				>
					{showRevisions ? "Close revision history" : "Browse revisions"}
				</button>
			</div>
			{showRevisions && !settingsEditing && (
				<RevisionHistory
					key={latest.document.revision}
					client={client}
					revision={latest.document.revision}
					onRestored={refresh}
					onRecovered={onRecovered}
					documentKey={documentKey}
				/>
			)}
		</div>
	);
}
function RevisionHistory({
	client,
	revision,
	onRestored,
	documentKey,
	authoringDigest,
	onRecovered,
}: {
	client: CanonicalDocumentClient;
	revision: number;
	onRestored: () => Promise<CanonicalDocumentRead>;
	documentKey: DocumentKey;
	authoringDigest?: string;
	onRecovered?: () => void;
}) {
	const [page, setPage] = useState<CanonicalRevisionPage | null>(null),
		[rows, setRows] = useState<CanonicalRevisionPage["page"]>([]),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null),
		[selected, setSelected] = useState<string | null>(null);
	const mounted = useRef(true),
		pending = useRef(false);
	const load = async (cursor: string | null) => {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		setError(null);
		try {
			const next = canonicalRevisionPageSchema.parse(
				await client.pageRevisions(cursor),
			);
			if (mounted.current) {
				setPage(next);
				setRows((current) =>
					cursor === null
						? next.page
						: [
								...current,
								...next.page.filter(
									(row) => !current.some((existing) => existing.id === row.id),
								),
							],
				);
			}
		} catch {
			if (mounted.current)
				setError("Revision history could not be loaded. Try again.");
		} finally {
			pending.current = false;
			if (mounted.current) setBusy(false);
		}
	};
	useEffect(() => {
		mounted.current = true;
		void load(null);
		return () => {
			mounted.current = false;
		};
	}, []);
	return (
		<section
			aria-label="Revision history"
			className="space-y-3 rounded-lg border border-border p-5"
		>
			<h2 className="text-lg font-semibold">Revision history</h2>
			<p className="text-sm text-muted-foreground">
				Restore a saved version as a new revision. Current saved content is
				preserved in history.
			</p>
			{error && <p role="alert">{error}</p>}
			{!busy && !rows.length && <p>No saved revisions yet.</p>}
			<ul className="divide-y divide-border">
				{rows.map((row) => (
					<li
						key={row.id}
						className="flex flex-wrap items-center justify-between gap-3 py-3"
					>
						<div>
							<p className="text-sm font-medium">
								{row.title || "Untitled document"}
							</p>
							<p className="text-xs text-muted-foreground">
								Revision {row.revisionNumber} ·{" "}
								{new Date(row.createdAt).toLocaleString()}
							</p>
							{!row.restorable && (
								<p className="text-xs text-muted-foreground">
									This older format requires migration before restoration.
								</p>
							)}
						</div>
						<button
							type="button"
							disabled={
								!row.restorable ||
								busy ||
								(row.action === "recover-legacy" && !client.recoverLegacy)
							}
							onClick={() => setSelected(row.id)}
							className="min-h-11 rounded border px-3 text-sm disabled:opacity-50"
						>
							{row.action === "recover-legacy"
								? "Review original editor restore"
								: "Review restore"}
						</button>
					</li>
				))}
			</ul>
			{selected && (
				<div
					role="group"
					aria-label="Confirm revision restore"
					className="space-y-3 rounded border border-primary/40 p-4"
				>
					<p>
						{rows.find((row) => row.id === selected)?.action ===
						"recover-legacy"
							? "Restore the full authored content from this original version and return to its original editor? Your current block version will remain in history so you can return to it. Current publication, URL and access settings remain unchanged. Unsaved edits will be discarded."
							: authoringDigest
								? "Restore this saved block version and switch to the block editor? The current original-editor version will remain in history. Unsaved edits will be discarded."
								: "Replace the saved document with this revision? Current saved content remains in history. Unsaved edits will be discarded."}
					</p>
					<button
						type="button"
						disabled={busy}
						className="min-h-11 rounded bg-primary px-4 text-primary-foreground"
						onClick={() =>
							void (async () => {
								if (pending.current) return;
								pending.current = true;
								setBusy(true);
								try {
									const row = rows.find((row) => row.id === selected);
									if (!row?.restorable) throw new Error("Unavailable revision");
									if (row.action === "recover-legacy") {
										if (!client.recoverLegacy)
											throw new Error("Recovery unavailable");
										const receipt = canonicalRecoveryReceiptSchema.parse(
											await client.recoverLegacy({
												expectedRevision: revision,
												revisionId: selected,
											}),
										);
										if (!mounted.current) return;
										if (
											receipt.postId !== documentKey.documentId ||
											receipt.revision !== revision + 1
										)
											throw new Error("Recovery receipt mismatch");
										const next = await onRestored();
										// Reopening a legacy document deliberately unmounts this history.
										// The workspace refresh itself rejects an expired environment.
										if (
											next?.contract !== "canonical-initialization-v1" ||
											next.document.revision !== receipt.revision ||
											next.document.authoringDigest !== receipt.authoringDigest
										)
											throw new Error("Recovery reopen mismatch");
										onRecovered?.();
									} else {
										const receipt = canonicalWriteReceiptSchema.parse(
											await client.restore({
												expectedRevision: revision,
												revisionId: selected,
												...(authoringDigest
													? { expectedAuthoringDigest: authoringDigest }
													: {}),
											}),
										);
										if (!mounted.current) return;
										if (
											receipt.postId !== documentKey.documentId ||
											receipt.revision !== revision + 1
										)
											throw new Error("Restore mismatch");
										const next = await onRestored();
										if (
											next?.contract !== "canonical-document-v1" ||
											next.document.revision !== receipt.revision ||
											next.document.digest !== receipt.digest
										)
											throw new Error("Restore reopen mismatch");
									}
									if (mounted.current) setSelected(null);
								} catch (error) {
									if (mounted.current)
										setError(getErrorMessage(error,
											"The document changed or restoration was denied. Reload the current revision before trying again.",
										));
								} finally {
									pending.current = false;
									if (mounted.current) setBusy(false);
								}
							})()
						}
					>
						Restore this revision
					</button>
					<button
						type="button"
						disabled={busy}
						className="ml-2 min-h-11 rounded border px-4"
						onClick={() => setSelected(null)}
					>
						Cancel
					</button>
				</div>
			)}
			{!page?.isDone && (
				<button
					type="button"
					disabled={busy}
					className="min-h-11 rounded border px-4 text-sm"
					onClick={() => void load(page?.continueCursor ?? null)}
				>
					{busy ? "Loading revisions…" : "Load more revisions"}
				</button>
			)}
		</section>
	);
}
