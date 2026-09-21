import type { api } from "@control/convex/_generated/api";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { promotionMediaSpecSchema } from "../../../../../packages/site-contract/src/content-promotion-media";
import { parseReviewedRecord, type Review } from "./promotionReviewModel";
import {
	matchesReviewScope,
	reviewScopeKey,
	type ReviewScope,
} from "./promotionApplyModel";
export type TransferStatus = FunctionReturnType<
	typeof api.contentPromotion.mediaTransferRecords.get
>;
export type Recovery = FunctionReturnType<
	typeof api.contentPromotion.mediaRecoveryRecords.get
>;
export type TransferArgs = FunctionArgs<
	typeof api.contentPromotion.mediaTransfer.execute
>;
export type MediaFile = {
	key: string;
	title: string;
	fileName: string;
	mimeType: string;
	fileSize: number;
	supported: boolean;
};
export type MediaState =
	| { kind: "unread" }
	| { kind: "error" }
	| { kind: "loaded"; value: TransferStatus; pending: boolean };
export type MediaMarker = {
	pending: boolean;
	recoveryId?: string;
	recoveryFingerprint?: string;
};
export function mediaFiles(review: Review) {
	let issue: string | null = null;
	const files: MediaFile[] = [];
	for (const incoming of review.authoredRecords.filter(
		(record) => record.kind === "media",
	)) {
		const record = parseReviewedRecord(incoming),
			data = record?.kind === 'media' ? record.data : undefined;
		const spec = promotionMediaSpecSchema.safeParse({
			sha256: data?.sha256,
			fileSize: data?.fileSize,
			mimeType: data?.mimeType,
		});
		const supported =
			!!record &&
			spec.success &&
			/^media:[A-Za-z0-9_-]{1,200}$/.test(incoming.key);
		files.push({
			key: incoming.key,
			title:
				typeof data?.title === "string"
					? data.title
					: "Unvalidated media record",
			fileName: typeof data?.fileName === "string" ? data.fileName : "",
			mimeType: typeof data?.mimeType === "string" ? data.mimeType : "",
			fileSize: typeof data?.fileSize === "number" ? data.fileSize : 0,
			supported,
		});
		if (!supported)
			issue =
				"Only validated PNG, JPEG and WebP originals up to 2 MiB can be transferred here.";
	}
	if (
		files.length > 8 ||
		files.reduce((sum, file) => sum + file.fileSize, 0) > 4 * 1024 * 1024
	)
		issue =
			"This review exceeds the current eight-file or 4 MiB transfer limit. Choose fewer items in a new review.";
	if (new Set(files.map((file) => file.key)).size !== files.length)
		issue = "Media identities could not be validated. Create a new review.";
	return { files, issue };
}
export function mediaScopeValid(
	review: Review,
	scope: ReviewScope,
	allowed: boolean,
) {
	return (
		allowed &&
		matchesReviewScope(review, scope) &&
		/^[a-f0-9]{64}$/.test(review.reviewFingerprint) &&
		!review.applyState &&
		["blocked", "reviewed", "expired"].includes(review.status) &&
		review.authoredRecords.every((record) => !!parseReviewedRecord(record)) &&
		review.recordCount === review.authoredRecords.length
	);
}
export function freshMediaReview(
	review: Review,
	scope: ReviewScope,
	allowed: boolean,
	now = Date.now(),
) {
	return (
		mediaScopeValid(review, scope, allowed) &&
		review.expiresAt > now &&
		["blocked", "reviewed"].includes(review.status) &&
		!mediaFiles(review).issue
	);
}
export function transferMode(
	review: Review,
	scope: ReviewScope,
	allowed: boolean,
	file: MediaFile,
	state: MediaState,
	now = Date.now(),
): "transfer" | "check" | null {
	if (
		!mediaScopeValid(review, scope, allowed) ||
		!file.supported ||
		mediaFiles(review).issue ||
		state.kind !== "loaded"
	)
		return null;
	const status = state.value;
	if (status?.retryAfter && status.retryAfter > now) return null;
	if (status?.phase === "verified") return null;
	if (status && status.dispatchCount > 0) return "check";
	if (
		state.pending ||
		!freshMediaReview(review, scope, allowed, now) ||
		!review.issues.some(
			(issue) =>
				issue.key === file.key && issue.code === "TARGET_MEDIA_UPLOAD_REQUIRED",
		)
	)
		return null;
	return !status || (status.phase === "planned" && status.dispatchCount === 0)
		? "transfer"
		: null;
}
export type FileConfirmation = {
	review: Review;
	scopeKey: string;
	file: MediaFile;
	mode: "transfer" | "check";
};
type Context = {
	scope: ReviewScope;
	allowed: boolean;
	current: boolean;
	now: number;
};
function currentFile(
	confirmation: FileConfirmation,
	latest: Review,
	state: MediaState,
	context: Context,
) {
	return (
		context.current &&
		confirmation.scopeKey === reviewScopeKey(context.scope) &&
		confirmation.review.receiptId === latest.receiptId &&
		confirmation.review.reviewFingerprint === latest.reviewFingerprint &&
		transferMode(
			latest,
			context.scope,
			context.allowed,
			confirmation.file,
			state,
			context.now,
		) === confirmation.mode
	);
}
export async function submitFileConfirmation<T>(
	confirmation: FileConfirmation,
	acknowledged: boolean,
	deps: {
		context(): Context;
		readReview(id: string): Promise<Review>;
		readStatus(file: MediaFile): Promise<MediaState>;
		markPending(file: MediaFile): void;
		execute(args: TransferArgs): Promise<T>;
	},
): Promise<T> {
	if (
		!acknowledged ||
		!deps.context().current ||
		confirmation.scopeKey !== reviewScopeKey(deps.context().scope) ||
		!deps.context().allowed
	)
		throw new Error("Media confirmation is no longer current.");
	const fresh = await deps.readReview(confirmation.review.receiptId);
	const status = await deps.readStatus(confirmation.file);
	if (!currentFile(confirmation, fresh, status, deps.context()))
		throw new Error("Media confirmation is no longer current.");
	deps.markPending(confirmation.file);
	if (
		!deps.context().current ||
		!deps.context().allowed ||
		confirmation.scopeKey !== reviewScopeKey(deps.context().scope)
	)
		throw new Error("Media confirmation changed before dispatch.");
	return deps.execute({
		receiptId: fresh.receiptId,
		expectedReviewFingerprint: fresh.reviewFingerprint,
		mediaKey: confirmation.file.key,
		confirmStorageWrite: true,
	});
}
export function recoveryMatches(
	recovery: Recovery,
	review: Review,
	scope: ReviewScope,
	file: MediaFile,
) {
	return (
		recovery.receiptId === review.receiptId &&
		recovery.mediaKey === file.key &&
		recovery.beneficiaryId === scope.operatorId &&
		/^[a-f0-9]{64}$/.test(recovery.fingerprint)
	);
}
export function parseMediaMarkers(
	raw: string | null,
	scopeKey: string,
	receiptId: string,
	fingerprint: string,
): Record<string, MediaMarker> {
	if (!raw || raw.length > 10_000) return {};
	try {
		const value = JSON.parse(raw);
		if (
			!value ||
			value.scopeKey !== scopeKey ||
			value.receiptId !== receiptId ||
			value.fingerprint !== fingerprint ||
			!value.files ||
			typeof value.files !== "object" ||
			Array.isArray(value.files)
		)
			return {};
		const entries = Object.entries(value.files);
		if (entries.length > 8) return {};
		const out: Record<string, MediaMarker> = {};
		for (const [key, row] of entries) {
			if (
				!/^media:[A-Za-z0-9_-]{1,200}$/.test(key) ||
				!row ||
				typeof row !== "object" ||
				Array.isArray(row)
			)
				return {};
			const m = row as Record<string, unknown>;
			if (
				typeof m.pending !== "boolean" ||
				Object.keys(m).some(
					(key) =>
						!["pending", "recoveryId", "recoveryFingerprint"].includes(key),
				)
			)
				return {};
			if (m.recoveryId === undefined && m.recoveryFingerprint !== undefined)
				return {};
			if (
				m.recoveryId !== undefined &&
				(typeof m.recoveryId !== "string" ||
					!/^[A-Za-z0-9_-]{1,200}$/.test(m.recoveryId) ||
					typeof m.recoveryFingerprint !== "string" ||
					!/^[a-f0-9]{64}$/.test(m.recoveryFingerprint))
			)
				return {};
			out[key] = {
				pending: m.pending,
				...(typeof m.recoveryId === "string"
					? {
							recoveryId: m.recoveryId,
							recoveryFingerprint: m.recoveryFingerprint as string,
						}
					: {}),
			};
		}
		return out;
	} catch {
		return {};
	}
}
export function describeMedia(state: MediaState) {
	if (state.kind === "unread") return "Status has not been checked.";
	if (state.kind === "error")
		return "This transfer record could not be opened. Access, ownership or connection may have changed.";
	const value = state.value;
	if (!value)
		return state.pending
			? "A request was sent, but no durable result is available yet. Refresh status before deciding what to do next."
			: "No transfer is recorded for this file.";
	if (value.phase === "verified")
		return "The stored copy is verified. Content still needs its own review before Apply.";
	if (value.retryAfter && value.retryAfter > Date.now())
		return "A transfer is active. Wait, then refresh its status.";
	if (value.possibleOrphan)
		return "Upload outcome is unresolved. A copy may exist, but its storage ID was not confirmed. Another upload is blocked; manual reconciliation may be needed.";
	if (value.dispatchCount > 0)
		return "A stored copy needs its original result checked. Checking it does not send the file again.";
	return "The file has not been sent. Review its transfer before continuing.";
}

export type RecoveryConfirmation = {
	review: Review;
	scopeKey: string;
	file: MediaFile;
	recovery: Recovery;
};
/** Reauthorize the saved recovery, submit once, then read the SAME receipt even if acknowledgement is lost. */
export async function submitRecoveryConfirmation(
	confirmation: RecoveryConfirmation,
	acknowledged: boolean,
	deps: {
		context(): Context;
		readReview(): Promise<Review>;
		readRecovery(recovery: Recovery): Promise<Recovery>;
		markPending(recovery: Recovery): void;
		confirm(
			args: FunctionArgs<typeof api.contentPromotion.mediaRecovery.confirm>,
		): Promise<Recovery>;
	},
): Promise<Recovery> {
	const valid = (review: Review) => {
		const c = deps.context();
		return (
			c.current &&
			c.allowed &&
			confirmation.scopeKey === reviewScopeKey(c.scope) &&
			review.receiptId === confirmation.review.receiptId &&
			review.reviewFingerprint === confirmation.review.reviewFingerprint &&
			freshMediaReview(review, c.scope, c.allowed, c.now)
		);
	};
	if (!acknowledged || !valid(confirmation.review))
		throw new Error("Recovery confirmation is no longer current.");
	const fresh = await deps.readReview();
	if (!valid(fresh)) throw new Error("Recovery review changed.");
	const same = (value: Recovery) =>
		value.recoveryId === confirmation.recovery.recoveryId &&
		value.fingerprint === confirmation.recovery.fingerprint &&
		recoveryMatches(value, fresh, deps.context().scope, confirmation.file);
	const latest = await deps.readRecovery(confirmation.recovery);
	if (!valid(fresh) || !same(latest))
		throw new Error("Recovery scope changed.");
	if (latest.status !== "verified") {
		const c = deps.context();
		if (
			!latest.canConfirm ||
			latest.expiresAt <= c.now ||
			(latest.retryAfter && latest.retryAfter > c.now)
		)
			throw new Error("Recovery cannot be confirmed.");
		deps.markPending(latest);
		if (!valid(fresh)) throw new Error("Recovery changed before confirmation.");
		try {
			await deps.confirm({
				recoveryId: latest.recoveryId,
				expectedFingerprint: latest.fingerprint,
				confirmExistingBytes: true,
			});
		} catch {
			/* A lost response never creates a new recovery or upload. */
		}
	}
	if (!valid(fresh)) throw new Error("Recovery context changed.");
	const result = await deps.readRecovery(latest);
	if (!valid(fresh) || !same(result))
		throw new Error("Recovery result identity changed.");
	return result;
}

export function canReviewExistingCopy(
	review: Review,
	scope: ReviewScope,
	allowed: boolean,
	file: MediaFile,
	state: MediaState,
	now = Date.now(),
) {
	if (!file.supported || !freshMediaReview(review, scope, allowed, now))
		return false;
	if (state.kind !== "loaded" || !state.value) return true;
	const value = state.value;
	return (
		value.phase !== "verified" &&
		!(value.possibleOrphan && !value.storageId) &&
		!(value.retryAfter && value.retryAfter > now)
	);
}

/** A new review is requested only after every scoped ledger confirms its stored copy. */
export async function submitUpdatedMediaReview(
	review: Review,
	deps: {
		context(): Context;
		readReview(): Promise<Review>;
		readStatus(file: MediaFile): Promise<MediaState>;
		reviewTransferred(
			args: FunctionArgs<
				typeof api.contentPromotion.mediaTransfer.reviewTransferred
			>,
		): Promise<Review>;
	},
): Promise<Review> {
	const scopeKey = reviewScopeKey(deps.context().scope);
	const valid = (latest: Review) => {
		const c = deps.context();
		return (
			c.current &&
			reviewScopeKey(c.scope) === scopeKey &&
			latest.receiptId === review.receiptId &&
			latest.reviewFingerprint === review.reviewFingerprint &&
			freshMediaReview(latest, c.scope, c.allowed, c.now)
		);
	};
	if (!valid(review)) throw new Error("Media review changed.");
	const fresh = await deps.readReview();
	if (!valid(fresh)) throw new Error("Media review changed.");
	const { files } = mediaFiles(fresh);
	if (!files.length) throw new Error("No media prerequisites.");
	for (const file of files) {
		const state = await deps.readStatus(file);
		if (
			!valid(fresh) ||
			state.kind !== "loaded" ||
			state.value?.phase !== "verified" ||
			!state.value.storageId
		)
			throw new Error("Every file needs a verified transfer receipt.");
	}
	const result = await deps.reviewTransferred({
		receiptId: fresh.receiptId,
		expectedReviewFingerprint: fresh.reviewFingerprint,
		mediaKey: files[0].key,
	});
	const c = deps.context();
	if (
		!c.current ||
		!c.allowed ||
		reviewScopeKey(c.scope) !== scopeKey ||
		!matchesReviewScope(result, c.scope)
	)
		throw new Error("Updated media review scope changed.");
	return result;
}
