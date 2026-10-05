import { editorDefinitions } from "../../../../../../../blocks/.generated/editor-metadata";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	parseCanonicalMigration,
	type CanonicalMigrationDto,
} from "@backend/canonical-blocks-foundation/migrationContracts";
import {
	canonicalWriteReceiptSchema,
	type CanonicalInitializationDto,
} from "@backend/canonical-blocks-foundation/documentContracts";
import { CanonicalOutline } from "./CanonicalOutline";
import { SchemaBlockForm } from "../schema-editor/SchemaBlockForm";
import { canonicalEditorAdapter, readForEditor } from "./document-adapter";
import { outline } from "./tree";
import type { DocumentKey } from "./session";

export interface MigrationClient {
	prepareMigration(): Promise<unknown>;
	migrate(args: {
		expectedRevision: number;
		expectedAuthoringDigest: string;
		expectedCandidateDigest: string;
		expectedPresentationRevision: string;
		preserveInactiveSettings?: boolean;
		acknowledgeTextImport?: boolean;
	}): Promise<unknown>;
}
/** The server owns conversion. Review is immutable and commit sends only exact
 * source/candidate/presentation bindings; arbitrary client trees cannot migrate. */
export function CanonicalMigrationReview({
	documentKey,
	source,
	client,
	onMigrated,
}: {
	documentKey: DocumentKey;
	source: CanonicalInitializationDto;
	client: MigrationClient;
	onMigrated: () => Promise<unknown>;
}) {
	const [acknowledgedReview, setAcknowledgedReview] = useState<CanonicalMigrationDto | null>(null);
	const [acknowledgedImport, setAcknowledgedImport] = useState<CanonicalMigrationDto | null>(null);
	const [review, setReview] = useState<CanonicalMigrationDto | null>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null),
		[selection, setSelection] = useState<string | null>(null);
	const active = useRef(true),
		pending = useRef(false);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const current =
		review?.source.postId === source.document.id &&
		review.source.revision === source.document.revision &&
		review.source.authoringDigest === source.document.authoringDigest
			? review
			: null;
	const adapter = useMemo(
		() => (current ? canonicalEditorAdapter(current.candidate.policy) : null),
		[current],
	);
	const rows = current && adapter ? outline(current.candidate.document.blocks, adapter) : [];
	const selected = rows.find((row) => row.node.id === selection)?.node ?? null;
	const prepare = async () => {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		setError(null);
		setReview(null);
		setAcknowledgedReview(null);
		setAcknowledgedImport(null);
		try {
			const next = parseCanonicalMigration(await client.prepareMigration());
			readForEditor(next.candidate, documentKey);
			if (
				next.source.authoringDigest !== source.document.authoringDigest ||
				next.source.revision !== source.document.revision
			)
				throw new Error("Source changed");
			if (active.current) {
				setReview(next);
				setSelection(next.candidate.document.blocks[0]?.id ?? null);
			}
		} catch (issue) {
			if (active.current) setError(migrationIssue(issue));
		} finally {
			pending.current = false;
			if (active.current) setBusy(false);
		}
	};
	return (
		<section
			aria-label="Review content migration"
			className="space-y-4 border-t border-border pt-5"
		>
			<h2 className="text-lg font-semibold">
				Move existing content into blocks
			</h2>
			<p className="text-sm text-muted-foreground">
				Review the converted content before saving. The original document is
				preserved in revision history; unsupported content stops conversion.
			</p>
			{error && <p role="alert">{error}</p>}
			<button
				type="button"
				disabled={busy}
				onClick={() => void prepare()}
				className="min-h-11 rounded border px-4 text-sm disabled:opacity-50"
			>
				{busy
					? "Preparing…"
					: current
						? "Refresh migration review"
						: "Review conversion"}
			</button>
			{current && adapter && (
				<>
					<p className="text-sm">
						{current.candidate.document.title} ·{" "}
						{current.candidate.document.blocks.length} top-level blocks
					</p>
					{!!current.inactiveSettings?.length && (
						<fieldset className="space-y-3 rounded border border-border p-4">
							<legend className="px-1 font-medium">Unused settings in the original document</legend>
							<p className="text-sm text-muted-foreground">
								These settings were saved but never applied by the original editor.
								Conversion will leave these settings inactive. The saved
								settings remain in the original revision and can be recovered with it.
							</p>
							<ul className="space-y-2 text-sm">
								{current.inactiveSettings.map((setting) => {
									const index = rows.findIndex((row) => row.node.id === setting.blockId);
									const title = Object.hasOwn(editorDefinitions, setting.name)
										? editorDefinitions[setting.name as keyof typeof editorDefinitions].title : "Block";
									return <li key={setting.blockId}>
										<strong>{title ?? "Block"} · {index + 1}</strong>
										{setting.layout && <p>Layout: {Object.entries(setting.layout).map(([key, value]) => `${key}: ${value}`).join(", ") || "none"}</p>}
										{setting.lock && <p>Locks: {Object.entries(setting.lock).map(([key, value]) => `${key}: ${value ? "on" : "off"}`).join(", ") || "none"}</p>}
									</li>;
								})}
							</ul>
							<label className="flex min-h-11 items-center gap-3 text-sm">
								<input type="checkbox" disabled={busy}
									checked={acknowledgedReview === current}
									onChange={(event) => setAcknowledgedReview(event.target.checked ? current : null)} />
								Leave these settings inactive and retain them in the original revision.
							</label>
						</fieldset>
					)}
					{current.importedContent && (
						<fieldset className="space-y-3 rounded border border-border p-4">
							<legend className="px-1 font-medium">Import stored plain text</legend>
							<p className="text-sm text-muted-foreground">
								The original renderer may not have displayed this stored text.
								Import keeps its words and line breaks as literal text. Review the
								content below before converting this draft; publication is a separate step.
								The exact original remains in revision history.
							</p>
							<label className="flex min-h-11 items-center gap-3 text-sm">
								<input type="checkbox" name="text-import" disabled={busy}
									checked={acknowledgedImport === current}
									onChange={(event) => setAcknowledgedImport(event.target.checked ? current : null)} />
								Import this reviewed text into the draft and retain the original revision.
							</label>
						</fieldset>
					)}
					<div className="grid gap-5 md:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)]">
						<CanonicalOutline
							nodes={current.candidate.document.blocks}
							adapter={adapter}
							describe={adapter.describe}
							selectedId={selection}
							onSelect={setSelection}
						/>
						{selected && (
							<SchemaBlockForm
								key={selected.id}
								mode="preview"
								disabled
								blockId={selected.id}
								name={selected.name}
								version={selected.version}
								value={selected.attrs}
								revision={String(current.candidate.document.revision)}
								scope={current.candidate.scope}
							/>
						)}
					</div>
					<button
						type="button"
						disabled={busy || (!!current.inactiveSettings?.length && acknowledgedReview !== current) || (!!current.importedContent && acknowledgedImport !== current)}
						className="min-h-11 rounded bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
						onClick={() =>
							void (async () => {
								if (pending.current || (current.inactiveSettings?.length && acknowledgedReview !== current) || (current.importedContent && acknowledgedImport !== current)) return;
								pending.current = true;
								setBusy(true);
								setError(null);
								try {
									const receipt = canonicalWriteReceiptSchema.parse(
										await client.migrate({
											...(current.inactiveSettings?.length ? {preserveInactiveSettings: true} : {}),
											...(current.importedContent ? {acknowledgeTextImport: true} : {}),
											expectedRevision: current.source.revision,
											expectedAuthoringDigest: current.source.authoringDigest,
											expectedCandidateDigest:
												current.candidate.document.digest,
											expectedPresentationRevision:
												current.candidate.presentation.revision,
										}),
									);
									if (
										receipt.postId !== documentKey.documentId ||
										receipt.revision !== current.candidate.document.revision ||
										receipt.digest !== current.candidate.document.digest ||
										!receipt.changed
									)
										throw new Error("Migration receipt mismatch");
									await onMigrated();
								} catch {
									if (active.current)
										setError(
											"The conversion could not be confirmed. Reload the saved document before preparing another review; its source, template or permissions may have changed.",
										);
								} finally {
									pending.current = false;
									if (active.current) setBusy(false);
								}
							})()
						}
					>
						Convert reviewed content
					</button>
				</>
			)}
		</section>
	);
}

export function migrationIssue(error: unknown): string {
	if (error && typeof error === "object" && "data" in error) {
		const data = error.data;
		if (
			data &&
			typeof data === "object" &&
			"code" in data &&
			data.code === "LEGACY_CONVERSION_REQUIRED" &&
			"path" in data &&
			Array.isArray(data.path) &&
			data.path.length <= 32 &&
			data.path.every(
				(part) =>
					typeof part === "number" ||
					(typeof part === "string" && part.length <= 128),
			) &&
			"message" in data &&
			typeof data.message === "string" &&
			data.message.length <= 600
		)
			return `Conversion stopped at ${data.path.join(".") || "content"}: ${data.message}. The original document is unchanged.`;
	}
	return "Conversion was denied or the saved source changed. Keep the original document, reload its current revision and review again.";
}
