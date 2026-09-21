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
	const selected =
		current && adapter
			? outline(current.candidate.document.blocks, adapter).find(
					(row) => row.node.id === selection,
				)?.node
			: null;
	const prepare = async () => {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		setError(null);
		setReview(null);
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
						disabled={busy}
						className="min-h-11 rounded bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
						onClick={() =>
							void (async () => {
								if (pending.current) return;
								pending.current = true;
								setBusy(true);
								setError(null);
								try {
									const receipt = canonicalWriteReceiptSchema.parse(
										await client.migrate({
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
