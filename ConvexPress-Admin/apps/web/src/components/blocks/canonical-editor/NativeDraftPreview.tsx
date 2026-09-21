import { useMemo, useRef } from "react";
import type { CanonicalDocumentDto } from "@backend/canonical-blocks-foundation/documentContracts";
import { NativeDocumentPreview } from "./NativeSavedPreview";
import type { CanonicalDocumentClient } from "./CanonicalDocumentWorkspace";
import {
	checkedDraft,
	draftDigest,
	readForEditor,
	type CanonicalDraft,
} from "./document-adapter";
import type { DocumentKey } from "./session";

/** Local drafts are never display authority: each update is resolved by the
 * current site's read-only endpoint before entering the Website transport. */
export function NativeDraftPreview(props: {
	source: CanonicalDocumentDto;
	documentKey: DocumentKey;
	siteOrigin: string;
	client: CanonicalDocumentClient;
	draft: CanonicalDraft;
	revision: number;
	selectedId: string | null;
	onSelect: (id: string) => void;
	onHover: (id: string | null) => void;
}) {
	const latest = useRef(props.draft);
	latest.current = props.draft;
	const read = useMemo(
		() => async (request?: Record<string, string>) => {
			const draft = checkedDraft(latest.current);
			if (!props.client.previewDraft)
				throw Error("Draft preview is unavailable");
			const result = readForEditor(
				await props.client.previewDraft({
					expectedRevision: props.revision,
					title: draft.title,
					blocks: draft.blocks,
					request,
				}),
				props.documentKey,
			);
			if (
				!result ||
				result.contract !== "canonical-document-v1" ||
				result.document.revision !== props.revision ||
				result.document.digest !== draftDigest(draft)
			)
				throw Error("Draft preview does not match the requested document");
			return result;
		},
		[props.client, props.documentKey, props.revision],
	);
	// Bind draft rendering to the saved base, never a speculative write receipt.
	const document = useMemo(
		() => ({
			...props.source,
			document: { ...props.source.document, revision: props.revision },
		}),
		[props.source, props.revision],
	);
	return (
		<NativeDocumentPreview
			document={document}
			documentKey={props.documentKey}
			siteOrigin={props.siteOrigin}
			read={read}
			proposal={false}
			onClose={() => {}}
			live={{
				change: props.draft,
				selectedId: props.selectedId,
				onSelect: props.onSelect,
				onHover: props.onHover,
			}}
		/>
	);
}
