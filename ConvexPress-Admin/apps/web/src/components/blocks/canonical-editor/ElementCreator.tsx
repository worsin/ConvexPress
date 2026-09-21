import { useEffect, useRef, useState, type ComponentProps } from "react";
import { NewDefinition } from "../../custom-blocks/NewDefinition";
import { DefinitionWorkbench } from "../../custom-blocks/DefinitionWorkbench";
import { checkedSaved, type DefinitionId } from "../../custom-blocks/model";
import type { DefinitionClients } from "../../custom-blocks/useDefinitionClients";
import type { DefinitionScope } from "../../custom-blocks/create-model";
import type { ResolverPolicy } from "@backend/canonical-blocks-foundation/contracts";
import { appendCustomBlock, type CustomBlockClient } from "./composed-picker";
import type { CanonicalDraft } from "./document-adapter";

export interface ElementCreation {
	clients: DefinitionClients;
	scope: DefinitionScope;
	canAi: boolean;
	canMedia: boolean;
	canEdit: boolean;
	canRestore: boolean;
	canApprove: boolean;
	renderPreview: NonNullable<
		ComponentProps<typeof DefinitionWorkbench>["renderPreview"]
	>;
}

export function ElementCreator({
	creation,
	packId,
	revision,
	policy,
	disabled,
	picker,
	insert,
	onEditingChange,
}: {
	creation: ElementCreation;
	packId: string;
	revision: number;
	policy: ResolverPolicy;
	disabled: boolean;
	picker: CustomBlockClient;
	insert: (
		transform: (draft: CanonicalDraft) => { draft: CanonicalDraft; id: string },
	) => boolean;
	onEditingChange: (dirty: boolean) => void;
}) {
	const [open, setOpen] = useState(false),
		[id, setId] = useState<DefinitionId | null>(null);
	const [locked, setLocked] = useState(false),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const context = JSON.stringify([creation.scope, packId, revision, policy]);
	const current = useRef({ alive: true, context, disabled, pending: false });
	Object.assign(current.current, { context, disabled });
	useEffect(() => {
		current.current.alive = true;
		return () => {
			current.current.alive = false;
		};
	}, []);
	useEffect(() => {
		onEditingChange(open && (id === null || locked || busy));
	}, [open, id, locked, busy, onEditingChange]);
	useEffect(() => () => onEditingChange(false), [onEditingChange]);
	async function add() {
		if (!id || disabled || locked || current.current.pending) return;
		current.current.pending = true;
		setBusy(true);
		setError("");
		const available = () =>
			current.current.alive &&
			!current.current.disabled &&
			current.current.context === context;
		try {
			const latest = await creation.clients.workbench.get({ id });
			checkedSaved(latest);
			if (!available()) return;
			if (latest.id !== id || latest.activeVersion === null)
				throw Error("Approve a saved version before inserting it.");
			const saved =
				latest.activeVersion === latest.version
					? latest
					: await creation.clients.workbench.get({
							id,
							version: latest.activeVersion,
						});
			const decoded = checkedSaved(saved);
			if (!available()) return;
			if (
				saved.id !== id ||
				saved.version !== latest.activeVersion ||
				saved.versionStatus !== "active"
			)
				throw Error("The approval changed.");
			const choice = {
				id,
				name: saved.name,
				title: decoded.definition.spec.title,
				version: saved.version,
				digest: saved.digest,
			};
			const scope = {
				websiteKey: creation.scope.websiteKey,
				instanceKey: creation.scope.instanceKey,
			};
			const selected = await picker.selectCustomBlock({
				id,
				version: choice.version,
				expectedDigest: choice.digest,
				expectedRevision: revision,
				expectedScope: scope,
			});
			if (!available()) return;
			if (
				!insert((draft) =>
					appendCustomBlock(draft, selected, choice, scope, policy),
				)
			)
				throw Error("Insertion refused.");
			setOpen(false);
			setId(null);
		} catch {
			if (available())
				setError(
					"Approve a saved version, then try adding it again. Check the page’s enabled features and size if insertion is refused. Your page edits are preserved.",
				);
		} finally {
			current.current.pending = false;
			if (current.current.alive) setBusy(false);
		}
	}
	return (
		<section
			aria-label="Create an element"
			className="space-y-4 rounded-xl border border-border p-4"
		>
			<header className="space-y-2">
				<h2 className="font-semibold">Create an element</h2>
				<p className="text-sm text-muted-foreground">
					Design a reusable block for this website. Review, preview, and approve
					it here, then add it to your current page draft.
				</p>
			</header>
			{!open ? (
				<button
					type="button"
					className="min-h-11 rounded-md border px-4 text-sm disabled:opacity-50"
					disabled={disabled}
					onClick={() => {
						setOpen(true);
						setError("");
					}}
				>
					{creation.canAi ? "Describe an element" : "Create a custom element"}
				</button>
			) : id === null ? (
				<NewDefinition
					client={creation.clients.creation}
					scope={creation.scope}
					initialPackId={packId}
					disabled={disabled}
					canAi={creation.canAi}
					canMedia={creation.canMedia}
					onCreated={setId}
					onCancel={() => setOpen(false)}
				/>
			) : (
				<>
					<fieldset disabled={disabled || busy} className="min-w-0 space-y-4">
						<DefinitionWorkbench
							id={id}
							client={creation.clients.workbench}
							canAi={creation.canAi && !disabled}
							canEdit={creation.canEdit && !disabled}
							canRestore={creation.canRestore && !disabled}
							canApprove={creation.canApprove && !disabled}
							onLocked={setLocked}
							renderPreview={(input) =>
								creation.renderPreview({
									...input,
									disabled: input.disabled || disabled || busy,
								})
							}
						/>
					</fieldset>
					<p className="text-sm text-muted-foreground">
						Adding uses the currently approved version. The page is saved only
						when you choose Save in the editor.
					</p>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className="min-h-11 rounded-md border px-4 text-sm disabled:opacity-50"
							disabled={disabled || busy || locked}
							onClick={() => void add()}
						>
							{busy ? "Adding element…" : "Add approved element"}
						</button>
						<button
							type="button"
							className="min-h-11 px-4 text-sm underline disabled:opacity-50"
							disabled={busy || locked}
							onClick={() => {
								setOpen(false);
								setId(null);
								setError("");
							}}
						>
							Close element
						</button>
					</div>
				</>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
		</section>
	);
}
