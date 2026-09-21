import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Review } from "./promotionReviewModel";
import type {
	FileConfirmation,
	MediaFile,
	Recovery,
} from "./promotionMediaModel";
export type MediaDialog =
	| { kind: "file"; confirmation: FileConfirmation }
	| {
			kind: "recovery-reason";
			review: Review;
			scopeKey: string;
			file: MediaFile;
	  }
	| {
			kind: "recovery";
			review: Review;
			scopeKey: string;
			file: MediaFile;
			recovery: Recovery;
	  };
type Props = {
	finalFocus?: () => HTMLElement | false;
	dialog: MediaDialog;
	acknowledged: boolean;
	reason: string;
	busy: boolean;
	valid: boolean;
	onAcknowledge(value: boolean): void;
	onReason(value: string): void;
	onConfirm(): void;
	onCancel(): void;
};
export function PromotionMediaConfirmationBody(props: Props) {
	const { dialog } = props,
		review =
			dialog.kind === "file" ? dialog.confirmation.review : dialog.review,
		file = dialog.kind === "file" ? dialog.confirmation.file : dialog.file;
	const checking =
		dialog.kind === "file" && dialog.confirmation.mode === "check";
	const recovering = dialog.kind === "recovery";
	const finalLabel =
		dialog.kind === "recovery-reason"
			? "Prepare existing-copy review"
			: recovering
				? dialog.recovery.status === "granting"
					? "Check existing-copy recovery"
					: "Confirm existing-copy recovery"
				: checking
					? "Check original transfer"
					: "Transfer this file to production";
	return (
		<>
			<div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
				<p className="font-semibold">
					Production destination: {review.targetIdentity.siteOrigin}
				</p>
				<p>{file.title}</p>
				<p>
					{file.fileName} · {file.mimeType} ·{" "}
					{new Intl.NumberFormat().format(file.fileSize)} bytes
				</p>
				<p>
					{dialog.kind === "file"
						? checking
							? "Check the original transfer and verify an already stored copy if one is known. This does not send the file again."
							: "Transfer this one reviewed original into production storage. It will not create published content or apply this review."
						: "Review access to an existing stored copy. Recovery preserves the original creator and never sends another file."}
				</p>
			</div>
			{checking && (
				<p className="text-sm">
					If the upload result was lost and no storage ID is known, the outcome
					may remain unresolved. Another upload stays blocked.
				</p>
			)}
			{dialog.kind === "recovery-reason" ? (
				<label className="block space-y-1 text-sm">
					<span>Reason for existing-copy recovery</span>
					<textarea
						value={props.reason}
						maxLength={500}
						disabled={props.busy}
						onChange={(event) => props.onReason(event.target.value)}
						className="block min-h-24 w-full rounded border border-border bg-background p-2"
					/>
					<small>
						The controller will prepare an audited review before you can confirm
						recovery.
					</small>
				</label>
			) : (
				<>
					{recovering && (
						<div className="space-y-2 text-sm">
							<p>Reviewed reason: {dialog.recovery.reason}</p>
							<p>
								Recovery review expires{" "}
								{new Date(dialog.recovery.expiresAt).toLocaleString()}.
							</p>
							<details className="text-xs text-muted-foreground">
								<summary className="cursor-pointer">
									Recovery receipt and operators
								</summary>
								<dl className="mt-2 space-y-1 break-all">
									<dt>Original creator</dt>
									<dd>{dialog.recovery.creatorId}</dd>
									<dt>Beneficiary</dt>
									<dd>{dialog.recovery.beneficiaryId}</dd>
									<dt>Receipt</dt>
									<dd>{dialog.recovery.recoveryId}</dd>
									<dt>Fingerprint</dt>
									<dd>{dialog.recovery.fingerprint}</dd>
								</dl>
							</details>
						</div>
					)}
					<label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
						<input
							type="checkbox"
							className="mt-1"
							disabled={props.busy}
							checked={props.acknowledged}
							onChange={(event) => props.onAcknowledge(event.target.checked)}
						/>
						<span>
							{recovering
								? "I reviewed this existing-copy recovery and confirm it for the production destination above."
								: checking
									? "I confirm checking only this original transfer; another upload is not authorized."
									: "I reviewed this file and confirm transferring it to the production destination above."}
						</span>
					</label>
				</>
			)}
			{!props.valid && (
				<p role="alert" className="text-sm text-destructive">
					This confirmation is no longer current. Close it and refresh the
					review.
				</p>
			)}
			<p className="text-sm text-muted-foreground">
				Content Apply remains a separate reviewed confirmation.
			</p>
			<div className="flex flex-wrap justify-end gap-2">
				<Button
					variant="outline"
					disabled={props.busy}
					onClick={props.onCancel}
				>
					Cancel
				</Button>
				<Button
					disabled={
						props.busy ||
						!props.valid ||
						(dialog.kind === "recovery-reason"
							? !props.reason.trim() || props.reason.length > 500
							: !props.acknowledged)
					}
					onClick={props.onConfirm}
				>
					{props.busy ? "Checking durable result…" : finalLabel}
				</Button>
			</div>
		</>
	);
}
export function PromotionMediaConfirmation(props: Props) {
	const heading = useRef<HTMLHeadingElement>(null);
	const title =
		props.dialog.kind === "file"
			? props.dialog.confirmation.mode === "transfer"
				? "Confirm this file transfer"
				: "Check the original file transfer"
			: props.dialog.kind === "recovery-reason"
				? "Review existing-copy recovery"
				: "Confirm reviewed existing-copy recovery";
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !props.busy) props.onCancel();
			}}
		>
			<DialogContent
				className="max-w-2xl"
				initialFocus={heading}
				finalFocus={props.finalFocus ?? false}
			>
				<DialogHeader>
					<DialogTitle ref={heading} tabIndex={-1}>
						{title}
					</DialogTitle>
					<DialogDescription>
						The controller rechecks the reviewed file, destination and current
						permissions before continuing.
					</DialogDescription>
				</DialogHeader>
				<PromotionMediaConfirmationBody {...props} />
			</DialogContent>
		</Dialog>
	);
}
