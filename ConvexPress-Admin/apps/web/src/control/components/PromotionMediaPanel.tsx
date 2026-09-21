import { api } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useAction, useConvex } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Review } from "./promotionReviewModel";
import {
	matchesReviewScope,
	reviewScopeKey,
	type ReviewScope,
} from "./promotionApplyModel";
import {
	canReviewExistingCopy,
	freshMediaReview,
	mediaFiles,
	mediaScopeValid,
	parseMediaMarkers,
	recoveryMatches,
	submitFileConfirmation,
	submitRecoveryConfirmation,
	submitUpdatedMediaReview,
	transferMode,
	type MediaFile,
	type MediaMarker,
	type MediaState,
	type Recovery,
} from "./promotionMediaModel";
import { usePromotionMediaFocus } from "./promotionMediaFocus";
import { PromotionMediaFile } from "./PromotionMediaFile";
import {
	PromotionMediaConfirmation,
	type MediaDialog,
} from "./PromotionMediaConfirmation";
type Props = {
	review: Review;
	scope: ReviewScope;
	allowed: boolean;
	parentBusy: boolean;
	now: number;
	onBusyChange(value: boolean): void;
	onReview(value: Review): void;
};
export function PromotionMediaPanel(props: Props) {
	const control = useConvex(),
		transfer = useAction(api.contentPromotion.mediaTransfer.execute),
		prepareRecovery = useAction(api.contentPromotion.mediaRecovery.prepare),
		confirmRecovery = useAction(api.contentPromotion.mediaRecovery.confirm),
		updatedReview = useAction(
			api.contentPromotion.mediaTransfer.reviewTransferred,
		);
	const { files, issue } = mediaFiles(props.review),
		scopeKey = reviewScopeKey(props.scope);
	const identity = `${scopeKey}/${props.review.receiptId}/${props.review.reviewFingerprint}`;
	const focus = usePromotionMediaFocus(identity, props.allowed);
	const storageKey = `convexpress:promotion-media:${encodeURIComponent(identity)}`;
	const [states, setStates] = useState<Record<string, MediaState>>({}),
		[recoveries, setRecoveries] = useState<Record<string, Recovery>>({}),
		[markers, setMarkers] = useState<Record<string, MediaMarker>>({});
	const markerRef = useRef(markers),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null),
		[dialog, setDialog] = useState<MediaDialog | null>(null),
		[acknowledged, setAcknowledged] = useState(false),
		[reason, setReason] = useState("");
	const alive = useRef(true),
		generation = useRef(0),
		lock = useRef(false),
		current = useRef(props);
	current.current = props;
	useEffect(() => {
		alive.current = true;
		try {
			const next = parseMediaMarkers(
				localStorage.getItem(storageKey),
				scopeKey,
				props.review.receiptId,
				props.review.reviewFingerprint,
			);
			markerRef.current = next;
			setMarkers(next);
		} catch {
			/* No state is invented when local receipt metadata is unavailable. */
		}
		return () => {
			alive.current = false;
			generation.current++;
			props.onBusyChange(false);
		};
	}, [identity]);
	useEffect(() => {
		if (!props.allowed) {
			generation.current++;
			setDialog(null);
			setAcknowledged(false);
		}
	}, [props.allowed]);
	function active(version: number) {
		const latest = current.current;
		return (
			alive.current &&
			generation.current === version &&
			reviewScopeKey(latest.scope) === scopeKey &&
			latest.review.receiptId === props.review.receiptId &&
			latest.review.reviewFingerprint === props.review.reviewFingerprint &&
			latest.allowed &&
			!latest.parentBusy
		);
	}
	function saveMarkers(next: Record<string, MediaMarker>) {
		localStorage.setItem(
			storageKey,
			JSON.stringify({
				scopeKey,
				receiptId: props.review.receiptId,
				fingerprint: props.review.reviewFingerprint,
				files: next,
			}),
		);
		markerRef.current = next;
		setMarkers(next);
	}
	function saveMarker(file: MediaFile, patch: Partial<MediaMarker>) {
		saveMarkers({
			...markerRef.current,
			[file.key]: {
				...(markerRef.current[file.key] ?? { pending: false }),
				...patch,
			},
		});
	}
	async function run(
		work: (version: number) => Promise<void>,
		message: string,
	) {
		if (
			lock.current ||
			props.parentBusy ||
			!mediaScopeValid(props.review, props.scope, props.allowed)
		)
			return;
		lock.current = true;
		setBusy(true);
		props.onBusyChange(true);
		setError(null);
		const version = generation.current;
		try {
			await work(version);
		} catch {
			if (active(version)) {
				setError(message);
				setDialog(null);
				setAcknowledged(false);
			}
		} finally {
			lock.current = false;
			if (alive.current) {
				setBusy(false);
				props.onBusyChange(false);
			}
		}
	}
	async function readReview() {
		const result = await control.query(api.contentPromotion.records.get, {
			receiptId: props.review.receiptId,
		});
		if (
			!matchesReviewScope(result, current.current.scope) ||
			result.receiptId !== props.review.receiptId ||
			result.reviewFingerprint !== props.review.reviewFingerprint ||
			!current.current.allowed
		)
			throw new Error("Review scope changed");
		return result;
	}
	async function readFile(
		file: MediaFile,
		version: number,
	): Promise<MediaState> {
		try {
			const value = await control.query(
				api.contentPromotion.mediaTransferRecords.get,
				{
					receiptId: props.review.receiptId,
					expectedReviewFingerprint: props.review.reviewFingerprint,
					mediaKey: file.key,
				},
			);
			const next: MediaState = {
				kind: "loaded",
				value,
				pending: !!markerRef.current[file.key]?.pending && !value,
			};
			if (active(version)) {
				setStates((previous) => ({ ...previous, [file.key]: next }));
				if (value && markerRef.current[file.key]?.pending)
					saveMarker(file, { pending: false });
			}
			return next;
		} catch {
			const next: MediaState = { kind: "error" };
			if (active(version))
				setStates((previous) => ({ ...previous, [file.key]: next }));
			return next;
		}
	}
	async function readRecovery(file: MediaFile, marker: MediaMarker) {
		if (!marker.recoveryId || !marker.recoveryFingerprint) return null;
		const value = await control.query(
			api.contentPromotion.mediaRecoveryRecords.get,
			{
				recoveryId:
					marker.recoveryId as Id<"overseer_contentPromotionMediaRecoveries">,
				expectedFingerprint: marker.recoveryFingerprint,
			},
		);
		if (
			value.recoveryId !== marker.recoveryId ||
			value.fingerprint !== marker.recoveryFingerprint ||
			!recoveryMatches(value, props.review, current.current.scope, file)
		)
			throw new Error("Recovery scope changed");
		return value;
	}
	function refreshFiles() {
		void run(async (version) => {
			for (const file of files) {
				if (!active(version)) return;
				await readFile(file, version);
				const marker = markerRef.current[file.key];
				if (marker?.recoveryId) {
					const result = await readRecovery(file, marker);
					if (result && active(version))
						setRecoveries((previous) => ({ ...previous, [file.key]: result }));
				}
			}
		}, "Media receipt status could not be fully refreshed. Check your access and connection; no file was resent.");
	}
	function beginFile(file: MediaFile, trigger: HTMLButtonElement) {
		void run(async (version) => {
			focus.capture(trigger);
			const fresh = await readReview(),
				state = await readFile(file, version);
			if (!active(version)) return;
			const mode = transferMode(
				fresh,
				current.current.scope,
				current.current.allowed,
				file,
				state,
				Date.now(),
			);
			if (!mode) throw new Error("File action unavailable");
			setAcknowledged(false);
			setDialog({
				kind: "file",
				confirmation: { review: fresh, scopeKey, file, mode },
			});
		}, "This file is no longer eligible for that action. Refresh its status or create a fresh content review.");
	}
	function beginRecovery(file: MediaFile, trigger: HTMLButtonElement) {
		void run(async (version) => {
			focus.capture(trigger);
			const fresh = await readReview();
			if (
				!active(version) ||
				!freshMediaReview(fresh, current.current.scope, current.current.allowed)
			)
				throw new Error("Review expired");
			const marker = markerRef.current[file.key];
			const saved = marker ? await readRecovery(file, marker) : null;
			if (!active(version)) return;
			setAcknowledged(false);
			setReason("");
			if (saved) {
				setRecoveries((previous) => ({ ...previous, [file.key]: saved }));
				if (saved.status === "verified") {
					await readFile(file, version);
					return;
				}
				setDialog({
					kind: "recovery",
					review: fresh,
					scopeKey,
					file,
					recovery: saved,
				});
			} else
				setDialog({ kind: "recovery-reason", review: fresh, scopeKey, file });
		}, "An existing-copy recovery review could not be opened. Check current access or create a fresh content review. No file was sent.");
	}
	function confirmDialog() {
		const selected = dialog;
		if (!selected) return;
		void run(async (version) => {
			if (selected.kind === "file") {
				const result = await submitFileConfirmation(
					selected.confirmation,
					acknowledged,
					{
						context: () => ({
							scope: current.current.scope,
							allowed: current.current.allowed && !current.current.parentBusy,
							current: active(version),
							now: Date.now(),
						}),
						readReview: async () => readReview(),
						readStatus: (file) => readFile(file, version),
						markPending: (file) => saveMarker(file, { pending: true }),
						execute: transfer,
					},
				);
				if (active(version)) {
					setStates((previous) => ({
						...previous,
						[selected.confirmation.file.key]: {
							kind: "loaded",
							value: result,
							pending: false,
						},
					}));
					saveMarker(selected.confirmation.file, { pending: false });
					await readFile(selected.confirmation.file, version);
					setDialog(null);
					setAcknowledged(false);
				}
				return;
			}
			const fresh = await readReview();
			if (
				!active(version) ||
				selected.scopeKey !== scopeKey ||
				!freshMediaReview(fresh, current.current.scope, current.current.allowed)
			)
				throw new Error("Recovery review changed");
			if (selected.kind === "recovery-reason") {
				if (!reason.trim() || reason.length > 500) return;
				const prepared = await prepareRecovery({
					receiptId: fresh.receiptId,
					expectedReviewFingerprint: fresh.reviewFingerprint,
					mediaKey: selected.file.key,
					reason,
				});
				if (
					!active(version) ||
					!recoveryMatches(
						prepared,
						fresh,
						current.current.scope,
						selected.file,
					)
				)
					return;
				saveMarker(selected.file, {
					recoveryId: prepared.recoveryId,
					recoveryFingerprint: prepared.fingerprint,
				});
				setRecoveries((previous) => ({
					...previous,
					[selected.file.key]: prepared,
				}));
				setAcknowledged(false);
				if (prepared.status === "verified") {
					await readFile(selected.file, version);
					setDialog(null);
				} else
					setDialog({
						kind: "recovery",
						review: fresh,
						scopeKey,
						file: selected.file,
						recovery: prepared,
					});
				return;
			}
			const result = await submitRecoveryConfirmation(
				{
					review: fresh,
					scopeKey,
					file: selected.file,
					recovery: selected.recovery,
				},
				acknowledged,
				{
					context: () => ({
						scope: current.current.scope,
						allowed: current.current.allowed && !current.current.parentBusy,
						current: active(version),
						now: Date.now(),
					}),
					readReview,
					readRecovery: async (saved) => {
						const value = await readRecovery(selected.file, {
							pending: false,
							recoveryId: saved.recoveryId,
							recoveryFingerprint: saved.fingerprint,
						});
						if (!value) throw new Error("Saved recovery missing");
						return value;
					},
					markPending: (saved) =>
						saveMarker(selected.file, {
							recoveryId: saved.recoveryId,
							recoveryFingerprint: saved.fingerprint,
						}),
					confirm: confirmRecovery,
				},
			);
			if (result && active(version)) {
				setRecoveries((previous) => ({
					...previous,
					[selected.file.key]: result,
				}));
				await readFile(selected.file, version);
				setDialog(null);
				setAcknowledged(false);
				if (result.status !== "verified")
					setError(
						"Existing-copy recovery is not confirmed. Refresh its saved receipt, then review checking that same recovery if it is eligible.",
					);
			}
		}, "The media action could not be confirmed. Refresh its durable status before deciding what to do next. Submitted receipt metadata is retained.");
	}
	const usable =
		freshMediaReview(props.review, props.scope, props.allowed, props.now) &&
		!issue;
	const allVerified =
		files.length > 0 &&
		files.every((file) => {
			const state = states[file.key];
			return (
				state?.kind === "loaded" &&
				state.value?.phase === "verified" &&
				!!state.value.storageId
			);
		});
	function newReview() {
		void run(async (version) => {
			const result = await submitUpdatedMediaReview(props.review, {
				context: () => ({
					scope: current.current.scope,
					allowed: current.current.allowed && !current.current.parentBusy,
					current: active(version),
					now: Date.now(),
				}),
				readReview,
				readStatus: (file) => readFile(file, version),
				reviewTransferred: updatedReview,
			});
			if (active(version)) props.onReview(result);
		}, "An updated content review could not be created. Every file needs an accessible verified transfer receipt; other content conflicts may still need attention.");
	}
	let dialogValid = false;
	if (dialog) {
		if (dialog.kind === "file")
			dialogValid =
				dialog.confirmation.scopeKey === scopeKey &&
				transferMode(
					props.review,
					props.scope,
					props.allowed,
					dialog.confirmation.file,
					states[dialog.confirmation.file.key] ?? { kind: "unread" },
					props.now,
				) === dialog.confirmation.mode;
		else
			dialogValid =
				usable &&
				dialog.scopeKey === scopeKey &&
				(dialog.kind === "recovery-reason" ||
					(recoveryMatches(
						dialog.recovery,
						props.review,
						props.scope,
						dialog.file,
					) &&
						dialog.recovery.canConfirm &&
						dialog.recovery.expiresAt > props.now &&
						(!dialog.recovery.retryAfter ||
							dialog.recovery.retryAfter <= props.now)));
	}
	if (!files.length) return null;
	return (
		<section
			aria-label="Media prerequisites"
			className="space-y-3 rounded-lg border border-border p-4"
		>
			<div>
				<h4 className="font-medium">Media files</h4>
				<p className="text-sm text-muted-foreground">
					Each file transfer and existing-copy recovery has its own
					confirmation. Content Apply stays separate.
				</p>
			</div>
			{issue && (
				<p role="status" className="text-sm">
					{issue}
				</p>
			)}
			{props.review.mediaReady && (
				<p role="status" className="text-sm">
					This content review already has verified target media. Another
					transfer is not required.
				</p>
			)}
			{!issue && (
				<Button
					variant="outline"
					disabled={busy || props.parentBusy}
					onClick={refreshFiles}
				>
					Refresh media status
				</Button>
			)}
			<ul className="space-y-3">
				{files.map((file) => {
					const state = states[file.key] ?? { kind: "unread" as const };
					return (
						<PromotionMediaFile
							key={file.key}
							file={file}
							state={state}
							pending={!!markers[file.key]?.pending}
							recovery={recoveries[file.key]}
							mode={transferMode(
								props.review,
								props.scope,
								props.allowed,
								file,
								state,
								props.now,
							)}
							canRecover={canReviewExistingCopy(
								props.review,
								props.scope,
								props.allowed,
								file,
								state,
								props.now,
							)}
							hasSavedRecovery={!!markers[file.key]?.recoveryId}
							locked={busy || props.parentBusy}
							onFile={(trigger) => beginFile(file, trigger)}
							onRecovery={(trigger) => beginRecovery(file, trigger)}
						/>
					);
				})}
			</ul>
			{allVerified && usable && (
				<Button disabled={busy || props.parentBusy} onClick={newReview}>
					Create updated content review
				</Button>
			)}
			{!allVerified && !props.review.mediaReady && !issue && (
				<p className="text-xs text-muted-foreground">
					An updated review here requires an accessible verified transfer
					receipt for every file. Existing copies owned by another operator may
					need a separate recovery review.
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			{dialog && props.allowed && (
				<PromotionMediaConfirmation
					finalFocus={focus.finalFocus}
					dialog={dialog}
					acknowledged={acknowledged}
					reason={reason}
					onAcknowledge={setAcknowledged}
					onReason={setReason}
					busy={busy}
					valid={dialogValid && !props.parentBusy}
					onConfirm={confirmDialog}
					onCancel={() => {
						setDialog(null);
						setAcknowledged(false);
						setReason("");
					}}
				/>
			)}
		</section>
	);
}
