import { useDefinitionClients } from "../../custom-blocks/useDefinitionClients";
import { DefinitionPreviewPanel } from "../../custom-blocks/DefinitionPreviewPanel";
import { useCan } from "@/hooks/useCan";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { previewSourceKey } from "./preview-source";
import {
	Component,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import {
	useConvex,
	useConvexAuth,
	useConvexConnectionState,
} from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
	useVerifiedSiteRuntime,
	type VerifiedSiteRuntime,
} from "@/control/SiteRuntimeProvider";
import {
	CanonicalDocumentWorkspace,
	type CanonicalDocumentClient,
} from "./CanonicalDocumentWorkspace";
import {
	CanonicalResourcePicker,
	type CanonicalPickerRequest,
	type ResourcePickerClient,
} from "./CanonicalResourcePicker";
import { readForEditor } from "./document-adapter";
import type { PickerResult } from "../schema-editor/model";
import type { DocumentKey } from "./session";
import {
	NativeSavedPreview,
	NativeProposalPreview,
} from "./NativeSavedPreview";
import type { AiProposalClient, AiProposalRequest } from "./ai-proposal";
import { freshCanonicalRead } from "./fresh-read";
import { recoverableCanonicalRead } from "./read-recovery";
import { useCanonicalDocumentQuery } from "./document-query";
import type { CanonicalDocumentDto } from "@backend/canonical-blocks-foundation/documentContracts";

export function CanonicalEditorEntry({
	postId,
	canonical,
	draft,
	initialOpen = false,
	children,
}: {
	postId: Id<"posts">;
	canonical: boolean;
	draft: boolean;
	initialOpen?: boolean;
	children: ReactNode;
}) {
	const [selected, setSelected] = useState(initialOpen);
	if (canonical || selected)
		return (
			<div className="space-y-4">
				{!canonical && (
					<button
						type="button"
						className="min-h-11 rounded border px-4 text-sm"
						onClick={() => setSelected(false)}
					>
						Back to existing editor
					</button>
				)}
				<NativeCanonicalEditor
					postId={postId}
					onRecovered={() => setSelected(false)}
				/>
			</div>
		);
	return (
		<>
			{
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
					<p className="text-sm text-muted-foreground">
						{draft
							? "Create blocks in an empty draft or review a supported conversion of existing content."
							: "Review saved block versions, including versions preserved before returning to this editor."}
					</p>
					<button
						type="button"
						onClick={() => setSelected(true)}
						className="min-h-11 rounded border px-4 text-sm"
					>
						{draft ? "Open block editor" : "Block revision history"}
					</button>
				</div>
			}
			{children}
		</>
	);
}

export function NativeCanonicalEditor({
	postId,
	onRecovered,
}: {
	postId: Id<"posts">;
	onRecovered?: () => void;
}) {
	const runtime = useVerifiedSiteRuntime(),
		auth = useConvexAuth(),
		connection = useConvexConnectionState();
	if (
		!runtime?.target.websiteKey ||
		!auth.isAuthenticated ||
		!connection.isWebSocketConnected
	)
		return (
			<p role="status" className="p-6 text-sm text-muted-foreground">
				Waiting for the current authorized environment. Reconnect to continue
				editing.
			</p>
		);
	return (
		<CanonicalReadBoundary key={`${runtime.generation}:${postId}`}>
			<ConnectedEditor
				postId={postId}
				runtime={runtime}
				onRecovered={onRecovered}
			/>
		</CanonicalReadBoundary>
	);
}
function ConnectedEditor({
	postId,
	runtime,
	onRecovered,
}: {
	postId: Id<"posts">;
	runtime: VerifiedSiteRuntime;
	onRecovered?: () => void;
}) {
	const can = useCan();
	const convex = useConvex(),
		read = useCanonicalDocumentQuery(postId);
	// useQueries keeps observing a pending index instead of throwing into a
	// permanent boundary. Retain the current document only for that known state.
	const previousRead = useRef<unknown>(undefined);
	const recovery = recoverableCanonicalRead(read, previousRead.current);
	const key = useMemo<DocumentKey>(
		() => ({
			websiteKey: runtime.target.websiteKey!,
			instanceKey: runtime.target.instanceKey,
			documentId: postId,
			generation: runtime.generation,
		}),
		[postId, runtime],
	);
	const active = useRef(true),
		pending = useRef<((result: PickerResult | null) => void) | null>(null);
	const [picker, setPicker] = useState<CanonicalPickerRequest | null>(null);
	const [dirty, setDirty] = useState(false);
	useUnsavedChangesWarning({
		isDirty: dirty || picker !== null,
		enabled: true,
	});
	const [preview, setPreview] = useState<CanonicalDocumentDto | null>(null);
	const [aiPreview, setAiPreview] = useState<{
		document: CanonicalDocumentDto;
		request: AiProposalRequest;
	} | null>(null);
	const canAi = can("blocks.ai") && !recovery.preparing;
	const canCreateElement =
		can("blocks.compose") &&
		can("post.read") &&
		can("post.create") &&
		!recovery.preparing;
	const definitionClients = useDefinitionClients(canCreateElement);
	useEffect(() => {
		if (!canAi) setAiPreview(null);
	}, [canAi]);
	const decodedRead = useMemo(
		() =>
			recovery.value === undefined
				? undefined
				: readForEditor(recovery.value, key),
		[recovery.value, key],
	);
	if (!recovery.preparing && read !== undefined)
		previousRead.current = decodedRead;
	const sourceKey = recovery.preparing ? null : previewSourceKey(decodedRead);
	const previewCurrent = useMemo(
		() => !!sourceKey && !!preview && previewSourceKey(preview) === sourceKey,
		[preview, sourceKey],
	);
	useEffect(() => {
		setPreview(null);
		setAiPreview(null);
		pending.current?.(null);
		pending.current = null;
		setPicker(null);
	}, [sourceKey]);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
			pending.current?.(null);
			pending.current = null;
		};
	}, []);
	const guard = () => {
		if (!active.current) throw new Error("The native environment changed.");
	};
	const client = useMemo<CanonicalDocumentClient>(
		() => ({
			previewDraft: async (args) => {
				guard();
				const value = await freshCanonicalRead(postId, (fresh) =>
					convex.query(api.canonicalDocuments.previewDraft, {
						...fresh,
						...args,
					}),
				);
				guard();
				return value;
			},
			generateAi: async (args) => {
				guard();
				const value = await convex.action(
					api.canonicalDocuments.ai.generateProposal,
					{
						postId,
						...args,
						expectedScope: {
							websiteKey: runtime.target.websiteKey!,
							instanceKey: runtime.target.instanceKey,
							deploymentOrigin: runtime.target.deploymentOrigin,
						},
					},
				);
				guard();
				return value;
			},
			previewAi: async (args) => {
				guard();
				const value = await convex.query(
					api.canonicalDocuments.aiContext.preview,
					{
						postId,
						...args,
						expectedScope: {
							websiteKey: runtime.target.websiteKey!,
							instanceKey: runtime.target.instanceKey,
							deploymentOrigin: runtime.target.deploymentOrigin,
						},
					},
				);
				guard();
				return value;
			},
			applyAi: async (args) => {
				guard();
				const value = await convex.mutation(
					api.canonicalDocuments.aiContext.apply,
					{
						postId,
						...args,
						expectedScope: {
							websiteKey: runtime.target.websiteKey!,
							instanceKey: runtime.target.instanceKey,
							deploymentOrigin: runtime.target.deploymentOrigin,
						},
					},
				);
				guard();
				return value;
			},
			listCustomBlocks: async (args) => {
				guard();
				const value = await convex.query(api.blockDefinitions.picker.list, {
					postId,
					...args,
				});
				guard();
				return value;
			},
			selectCustomBlock: async (args) => {
				guard();
				const value = await convex.query(api.blockDefinitions.picker.select, {
					postId,
					...args,
					id: args.id as Id<"blockDefinitions">,
				});
				guard();
				return value;
			},
			get: async (request) => {
				guard();
				const value = await freshCanonicalRead(postId, (args) =>
					convex.query(api.canonicalDocuments.get, {
						...args,
						...(request ? { request } : {}),
					}),
				);
				guard();
				return value;
			},
			initialize: async (args) => {
				guard();
				const value = await convex.mutation(api.canonicalDocuments.initialize, {
					postId,
					...args,
					// Workspace validates the exact saved schema; the server reloads
					// immutable definitions. No client definition grants are submitted.
					blocks: args.blocks,
				});
				guard();
				return value;
			},
			getSettings: async () => {
				guard();
				const value = await convex.query(api.canonicalDocuments.getSettings, {
					postId,
				});
				guard();
				return value;
			},
			setSettings: async (args) => {
				guard();
				const value = await convex.mutation(
					api.canonicalDocuments.setSettings,
					{ postId, ...args },
				);
				guard();
				return value;
			},
			save: async (args) => {
				guard();
				const value = await convex.mutation(api.canonicalDocuments.save, {
					postId,
					...args,
					blocks: args.blocks,
				});
				guard();
				return value;
			},
			restore: async (args) => {
				guard();
				const value = await convex.mutation(api.canonicalDocuments.restore, {
					postId,
					...args,
					revisionId: args.revisionId as Id<"revisions">,
				});
				guard();
				return value;
			},
			recoverLegacy: async (args) => {
				guard();
				const value = await convex.mutation(
					api.canonicalDocuments.recoverLegacy,
					{
						postId,
						...args,
						revisionId: args.revisionId as Id<"revisions">,
					},
				);
				guard();
				return value;
			},
			setPublication: async (args) => {
				guard();
				const value = await convex.mutation(
					api.canonicalDocuments.setPublication,
					{ postId, ...args },
				);
				guard();
				return value;
			},
			prepareMigration: async () => {
				guard();
				const value = await convex.query(
					api.canonicalDocuments.prepareMigration,
					{ postId },
				);
				guard();
				return value;
			},
			migrate: async (args) => {
				guard();
				const value = await convex.mutation(api.canonicalDocuments.migrate, {
					postId,
					...args,
				});
				guard();
				return value;
			},
			pageRevisions: async (cursor) => {
				guard();
				const value = await convex.query(api.canonicalDocuments.pageRevisions, {
					postId,
					paginationOpts: { cursor, numItems: 20 },
				});
				guard();
				return value;
			},
		}),
		[convex, postId, key],
	);
	const syncedPickerArgs = () => {
		guard();
		if (!picker || picker.signal.aborted)
			throw new Error("Reopen the reusable picker.");
		return {
			owner: { postId, expectedRevision: Number(picker.revision) },
			expectedScope: {
				websiteKey: key.websiteKey,
				instanceKey: key.instanceKey,
			},
		};
	};
	const resourceClient = useMemo<ResourcePickerClient>(
		() => ({
			authorize: async () => {
				const value = readForEditor(await client.get(), key);
				if (
					!value ||
					value.contract !== "canonical-document-v1" ||
					!picker ||
					String(value.document.revision) !== picker.revision
				)
					throw new Error("The edited document changed.");
			},
			syncedOptions: async (cursor) => {
				const result = await convex.query(api.syncedBlocks.picker.sources, {
					...syncedPickerArgs(),
					paginationOpts: { cursor, numItems: 8 },
				});
				guard();
				return result;
			},
			syncedRevisions: async (sourceId, publishedRevision, cursor) => {
				const result = await convex.query(api.syncedBlocks.picker.revisions, {
					...syncedPickerArgs(),
					sourceId: sourceId as Id<"syncedBlocks">,
					publishedRevision,
					paginationOpts: { cursor, numItems: 8 },
				});
				guard();
				return result;
			},
			syncedSelect: async (
				sourceId,
				publishedRevision,
				revisionPolicy,
				revision,
			) => {
				const result = await convex.query(api.syncedBlocks.picker.select, {
					...syncedPickerArgs(),
					sourceId: sourceId as Id<"syncedBlocks">,
					publishedRevision,
					revisionPolicy,
					revision,
				});
				guard();
				return result;
			},
			pageOptions: async (cursor) => {
				guard();
				const result = await convex.query(api.canonicalDocuments.pageOptions, {
					postId,
					paginationOpts: { cursor, numItems: 20 },
				});
				guard();
				return result;
			},
			menuOptions: async (cursor) => {
				guard();
				const result = await convex.query(api.canonicalDocuments.menuOptions, {
					postId,
					paginationOpts: { cursor, numItems: 20 },
				});
				guard();
				return result;
			},
			productTermOptions: async (taxonomy, cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.productTermOptions,
					{ postId, taxonomy, paginationOpts: { cursor, numItems: 20 } },
				);
				guard();
				return result;
			},
			membershipPlanOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.membershipPlanOptions,
					{ postId, paginationOpts: { cursor, numItems: 20 } },
				);
				guard();
				return result;
			},
			eventOptions: async (cursor) => {
				guard();
				const result = await convex.query(api.canonicalDocuments.eventOptions, {
					postId,
					paginationOpts: { cursor, numItems: 20 },
				});
				guard();
				return result;
			},
			mailingListOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.mailingListOptions,
					{ postId, paginationOpts: { cursor, numItems: 20 } },
				);
				guard();
				return result;
			},
			albumOptions: async (cursor) => {
				guard();
				const result = await convex.query(api.canonicalDocuments.albumOptions, {
					postId,
					paginationOpts: { cursor, numItems: 20 },
				});
				guard();
				return result;
			},
			recipeOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.recipeOptions,
					{ postId, paginationOpts: { cursor, numItems: 20 } },
				);
				guard();
				return result;
			},
			bundleOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.bundleOptions,
					{ postId, paginationOpts: { cursor, numItems: 20 } },
				);
				guard();
				return result;
			},
			productOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.productOptions,
					{ postId, paginationOpts: { cursor, numItems: 20 } },
				);
				guard();
				return result;
			},
			formOptions: async (cursor) => {
				guard();
				const result = await convex.query(api.canonicalDocuments.formOptions, {
					postId,
					paginationOpts: { cursor, numItems: 20 },
				});
				guard();
				return result;
			},
			eventCategoryOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.eventCategoryOptions,
					{ postId, paginationOpts: { cursor, numItems: 20 } },
				);
				guard();
				return result;
			},
			kbCategoryOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.kbCategoryOptions,
					{ postId, paginationOpts: { cursor, numItems: 20 } },
				);
				guard();
				return result;
			},
			courseOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.courseOptions,
					{ postId, paginationOpts: { cursor, numItems: 6 } },
				);
				guard();
				return result;
			},
			instructorOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.instructorOptions,
					{ postId, paginationOpts: { cursor, numItems: 6 } },
				);
				guard();
				return result;
			},
			authorOptions: async (cursor) => {
				guard();
				const result = await convex.query(
					api.canonicalDocuments.authorOptions,
					{ postId, paginationOpts: { cursor, numItems: 20 } },
				);
				guard();
				return result;
			},
			termOptions: async (taxonomy, cursor) => {
				guard();
				const result = await convex.query(api.canonicalDocuments.termOptions, {
					postId,
					taxonomy,
					paginationOpts: { cursor, numItems: 20 },
				});
				guard();
				return result;
			},
			media: async (mediaId) => {
				guard();
				const result = await convex.query(api.media.queries.get, { mediaId });
				guard();
				return result?.status === "active"
					? { id: result._id, alt: result.altText, label: result.fileName }
					: null;
			},
		}),
		[client, key, picker, convex, postId],
	);
	const finishPicker = (result: PickerResult | null) => {
		pending.current?.(result);
		pending.current = null;
		setPicker(null);
	};
	if (recovery.value === undefined)
		return (
			<p role="status" className="p-6 text-sm text-muted-foreground">
				{recovery.preparing
					? "Preparing the restored content index. This document will reopen automatically…"
					: "Opening the current document…"}
			</p>
		);
	if (read === null)
		return <p role="status">This document is no longer available.</p>;
	return (
		<>
			{recovery.preparing && (
				<p role="status" className="p-6 text-sm text-muted-foreground">
					Preparing the content index. Your edits are kept here and will
					reappear automatically…
				</p>
			)}
			{/* Keep unsaved editor state mounted but inaccessible while its index recovers. */}
			<div hidden={recovery.preparing} inert={recovery.preparing}>
				<CanonicalDocumentWorkspace
					siteOrigin={
						recovery.preparing ? undefined : runtime.target.siteOrigin
					}
					onDirtyChange={setDirty}
					canAi={canAi}
					elementCreation={
						canCreateElement
							? {
									clients: definitionClients,
									scope: {
										websiteKey: runtime.target.websiteKey!,
										instanceKey: runtime.target.instanceKey,
										deploymentOrigin: runtime.target.deploymentOrigin,
									},
									canAi,
									canMedia: can("media.read"),
									canEdit: can("post.update"),
									canRestore: can("post.restore") && can("post.update"),
									canApprove: can("post.publish") && can("post.update"),
									renderPreview: (input) => (
										<DefinitionPreviewPanel {...input} />
									),
								}
							: undefined
					}
					onAiPreview={(document, request) => {
						guard();
						setAiPreview({ document, request });
					}}
					canPublish={
						!!decodedRead &&
						can(
							decodedRead.document.type === "page"
								? "page.publish"
								: "post.publish",
						)
					}
					documentKey={key}
					read={decodedRead}
					client={client}
					onPreview={setPreview}
					onRecovered={() => {
						guard();
						setPreview(null);
						onRecovered?.();
					}}
					pickResource={(request) => {
						guard();
						if (
							request.scope.websiteKey !== key.websiteKey ||
							request.scope.instanceKey !== key.instanceKey ||
							request.signal.aborted
						)
							return Promise.resolve(null);
						pending.current?.(null);
						return new Promise((resolve) => {
							pending.current = resolve;
							setPicker(request);
						});
					}}
				/>
			</div>
			{preview && previewCurrent && (
				<NativeSavedPreview
					document={preview}
					documentKey={key}
					client={client}
					siteOrigin={runtime.target.siteOrigin}
					onClose={() => setPreview(null)}
				/>
			)}
			{aiPreview &&
				canAi &&
				decodedRead?.contract === "canonical-document-v1" &&
				decodedRead.document.revision ===
					aiPreview.request.expectedRevision && (
					<NativeProposalPreview
						document={aiPreview.document}
						request={aiPreview.request}
						documentKey={key}
						client={client as CanonicalDocumentClient & AiProposalClient}
						siteOrigin={runtime.target.siteOrigin}
						onClose={() => setAiPreview(null)}
					/>
				)}
			{picker && (
				<CanonicalResourcePicker
					key={`${picker.blockId}:${picker.revision}:${JSON.stringify(picker.path)}`}
					request={picker}
					client={resourceClient}
					onResult={finishPicker}
				/>
			)}
		</>
	);
}
class CanonicalReadBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? (
			<div
				role="alert"
				className="space-y-3 rounded-lg border border-border p-6"
			>
				<p>
					This document could not be loaded. Your permission or the current
					environment may have changed.
				</p>
				<button
					type="button"
					onClick={() => this.setState({ failed: false })}
					className="min-h-11 rounded border px-4 text-sm"
				>
					Reload document
				</button>
			</div>
		) : (
			this.props.children
		);
	}
}
