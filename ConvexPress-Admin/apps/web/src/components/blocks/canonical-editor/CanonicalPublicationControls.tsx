import { useEffect, useRef, useState } from "react";
import type { CanonicalDocumentDto } from "@backend/canonical-blocks-foundation/documentContracts";
export interface PublicationRequest {
	expectedRevision: number;
	status: "draft" | "publish" | "future" | "private";
	scheduledAt?: number;
}
export function CanonicalPublicationControls({
	document,
	disabled,
	publish,
}: {
	document: CanonicalDocumentDto;
	disabled: boolean;
	publish(args: PublicationRequest): Promise<void>;
}) {
	const [status, setStatus] = useState<PublicationRequest["status"]>(
			document.document.status,
		),
		[date, setDate] = useState(
			document.document.scheduledAt
				? new Date(
						document.document.scheduledAt -
							new Date(document.document.scheduledAt).getTimezoneOffset() *
								60000,
					)
						.toISOString()
						.slice(0, 16)
				: "",
		),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null),
		[confirmed, setConfirmed] = useState(false);
	const active = useRef(true),
		pending = useRef(false);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const deadline = date ? new Date(date).getTime() : NaN;
	const invalid =
		status === "future" &&
		(!Number.isFinite(deadline) || deadline <= Date.now());
	const labels = {
		draft: "Draft",
		publish: "Published",
		future: "Scheduled",
		private: "Private",
	};
	return (
		<section
			aria-label="Document publication"
			className="space-y-4 rounded-lg border border-border p-5"
		>
			<div>
				<h2 className="text-lg font-semibold">Publication</h2>
				<p className="text-sm text-muted-foreground">
					Current status: {labels[document.document.status]}
				</p>
				{document.document.status === "future" && (
					<p className="text-sm">
						{document.document.scheduledAt
							? `Scheduled for ${new Date(document.document.scheduledAt).toLocaleString()}`
							: "Scheduled time is unavailable. Reload the current document."}
					</p>
				)}
			</div>
			{disabled && (
				<p className="text-sm">
					Save or resolve your changes before changing publication.
				</p>
			)}
			<div className="flex flex-wrap items-end gap-3">
				<label className="space-y-1 text-sm">
					<span className="block">Visibility and timing</span>
					<select
						aria-label="Visibility and timing"
						value={status}
						disabled={disabled || busy}
						onChange={(event) => {
							setStatus(event.target.value as PublicationRequest["status"]);
							setConfirmed(false);
						}}
						className="min-h-11 rounded border bg-background px-3"
					>
						<option value="draft">Draft</option>
						<option value="publish">Publish now</option>
						<option value="future">Schedule</option>
						<option value="private">Private</option>
					</select>
				</label>
				{status === "future" && (
					<label className="space-y-1 text-sm">
						<span className="block">
							Publish at ({Intl.DateTimeFormat().resolvedOptions().timeZone})
						</span>
						<input
							aria-label="Publish at"
							type="datetime-local"
							value={date}
							disabled={disabled || busy}
							onChange={(event) => {
								setDate(event.target.value);
								setConfirmed(false);
							}}
							className="min-h-11 rounded border bg-background px-3"
						/>
					</label>
				)}
				<button
					type="button"
					disabled={
						disabled ||
						busy ||
						invalid ||
						(status === document.document.status && status !== "future")
					}
					onClick={() => setConfirmed(true)}
					className="min-h-11 rounded border px-4 text-sm disabled:opacity-50"
				>
					Review publication change
				</button>
			</div>
			{error && <p role="alert">{error}</p>}
			{confirmed && (
				<div
					role="group"
					aria-label="Confirm publication change"
					className="space-y-3 border-t border-border pt-4"
				>
					<p>
						{status === "publish"
							? "Publish this saved revision on the Website?"
							: status === "future"
								? `Schedule this saved revision for ${new Date(deadline).toLocaleString()}?`
								: status === "draft"
									? "Return this saved document to draft? Visitors will no longer see it."
									: "Make this saved document private? Public visitors will no longer see it."}
					</p>
					<button
						type="button"
						disabled={disabled || busy || invalid}
						className="min-h-11 rounded bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
						onClick={() =>
							void (async () => {
								if (pending.current || disabled || invalid) return;
								pending.current = true;
								setBusy(true);
								setError(null);
								try {
									await publish({
										expectedRevision: document.document.revision,
										status,
										...(status === "future" ? { scheduledAt: deadline } : {}),
									});
									if (active.current) setConfirmed(false);
								} catch {
									if (active.current)
										setError(
											"Publication did not finish or the saved revision changed. Reload the current document before retrying.",
										);
								} finally {
									pending.current = false;
									if (active.current) setBusy(false);
								}
							})()
						}
					>
						{busy ? "Updating…" : "Confirm publication change"}
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => setConfirmed(false)}
						className="ml-2 min-h-11 rounded border px-4 text-sm"
					>
						Cancel
					</button>
				</div>
			)}
		</section>
	);
}
