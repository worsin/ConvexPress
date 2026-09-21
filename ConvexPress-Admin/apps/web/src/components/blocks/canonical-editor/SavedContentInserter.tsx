import { useEffect, useRef, useState, type ComponentProps } from "react";
import type { SchemaBlockForm } from "../schema-editor/SchemaBlockForm";
import { applyPickerResult } from "../schema-editor/model";
import { editorDefinitions } from "../../../../../../../blocks/.generated/editor-metadata";
import {
	canonicalEditorAdapter,
	type CanonicalDraft,
} from "./document-adapter";
import type { ResolverPolicy } from "@backend/canonical-blocks-foundation/contracts";

export function SavedContentInserter({
	scope,
	revision,
	policy,
	packId,
	disabled,
	pickResource,
	insert,
}: {
	scope: import("../schema-editor/model").Scope;
	revision: number;
	policy: ResolverPolicy;
	packId?: string;
	disabled: boolean;
	pickResource: NonNullable<
		ComponentProps<typeof SchemaBlockForm>["pickResource"]
	>;
	insert: (
		transform: (draft: CanonicalDraft) => { draft: CanonicalDraft; id: string },
	) => boolean;
}) {
	const [busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null);
	const allowed =
		canonicalEditorAdapter(policy, packId).availableBlocks?.some(
			(block) => block.name === "core/synced",
		) ?? false;
	const controller = useRef<AbortController | null>(null),
		current = useRef({
			active: true,
			disabled,
			allowed,
			revision,
			scope,
			packId,
		});
	Object.assign(current.current, {
		disabled,
		allowed,
		revision,
		scope,
		packId,
	});
	useEffect(() => {
		return () => controller.current?.abort();
	}, [
		disabled,
		allowed,
		revision,
		scope.websiteKey,
		scope.instanceKey,
		packId,
	]);
	useEffect(() => {
		current.current.active = true;
		return () => {
			current.current.active = false;
			controller.current?.abort();
		};
	}, []);
	const available = () =>
		current.current.active &&
		!current.current.disabled &&
		current.current.allowed &&
		current.current.revision === revision &&
		current.current.scope.websiteKey === scope.websiteKey &&
		current.current.scope.instanceKey === scope.instanceKey &&
		current.current.packId === packId;
	const choose = async () => {
		if (controller.current || !available()) return;
		const pending = new AbortController();
		controller.current = pending;
		setBusy(true);
		setError(null);
		try {
			const adapter = canonicalEditorAdapter(policy, packId),
				node = adapter.createBlock!("core/synced");
			const request = {
				blockId: node.id,
				name: node.name,
				path: ["syncedBlock"],
				scope,
				revision: String(revision),
			};
			const field = editorDefinitions["core/synced"].fields.find(
				(field) => field.id === "syncedBlock",
			)!;
			const result = await pickResource({
				...request,
				field,
				signal: pending.signal,
			});
			if (!result || pending.signal.aborted || !available()) return;
			const attrs = applyPickerResult(request, result, request, node.attrs);
			if (
				!insert((draft) => ({
					draft: { ...draft, blocks: [...draft.blocks, { ...node, attrs }] },
					id: node.id,
				}))
			)
				throw Error("Insertion unavailable");
		} catch {
			if (available())
				setError(
					"This saved content could not be added. Check its access and the page’s size, then choose it again. Your edits are still here.",
				);
		} finally {
			if (controller.current === pending) controller.current = null;
			if (current.current.active) setBusy(false);
		}
	};
	if (!allowed)
		return (
			<p className="p-4 text-sm text-muted-foreground">
				Synced content is unavailable for this site’s current template and
				permissions.
			</p>
		);
	return (
		<section
			aria-label="Saved content"
			className="space-y-3 rounded-lg border border-border p-4"
		>
			<div>
				<h2 className="text-sm font-medium">Synced content</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Reuse a published section. Follow shared updates or pin a specific
					revision.
				</p>
			</div>
			<button
				type="button"
				onClick={() => void choose()}
				disabled={disabled || busy}
				className="min-h-11 rounded-md border border-border px-4 text-sm disabled:opacity-50"
			>
				{busy ? "Choosing saved content…" : "Browse saved content"}
			</button>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
		</section>
	);
}
