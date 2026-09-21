import { expect, test } from "bun:test";
import { mediaFixture as setup } from "./promotionMediaFixture";
import {
	mediaFiles,
	transferMode,
	submitFileConfirmation,
	type FileConfirmation,
	type MediaState,
	parseMediaMarkers,
	submitRecoveryConfirmation,
	submitUpdatedMediaReview,
	type Recovery,
} from "./promotionMediaModel";

async function rejected(fn: () => Promise<unknown>) {
	try {
		await fn();
		return false;
	} catch {
		return true;
	}
}
const fresh: MediaState = { kind: "loaded", value: null, pending: false };
test("transfer follows exact missing-file proof, fresh scope and authoritative idle state", () => {
	const f = setup();
	expect(transferMode(f.review, f.scope, true, f.file, fresh, 100)).toBe(
		"transfer",
	);
	for (const state of [
		{ kind: "error" },
		{ ...fresh, pending: true },
	] as MediaState[])
		expect(transferMode(f.review, f.scope, true, f.file, state, 100)).toBe(
			null,
		);
	expect(
		transferMode(
			{ ...f.review, issues: [] },
			f.scope,
			true,
			f.file,
			fresh,
			100,
		),
	).toBe(null);
	expect(transferMode(f.review, f.scope, false, f.file, fresh, 100)).toBe(null);
	expect(
		transferMode(
			f.review,
			{ ...f.scope, targetInstanceKey: "other" },
			true,
			f.file,
			fresh,
			100,
		),
	).toBe(null);
	expect(transferMode(f.review, f.scope, true, f.file, fresh, 201)).toBe(null);
});
test("unknown dispatched result can only check the original transfer", () => {
	const f = setup();
	const value = {
		phase: "uncertain" as const,
		dispatchCount: 1,
		storageId: null,
		transferKey: "c".repeat(64),
		failureCode: "MEDIA_UPLOAD_UNCERTAIN",
		possibleOrphan: true,
		retryAfter: null,
	};
	expect(
		transferMode(
			f.review,
			f.scope,
			true,
			f.file,
			{ kind: "loaded", value, pending: true },
			100,
		),
	).toBe("check");
	expect(
		transferMode(
			f.review,
			f.scope,
			true,
			f.file,
			{ kind: "loaded", value: { ...value, retryAfter: 150 }, pending: false },
			100,
		),
	).toBe(null);
	expect(
		transferMode(
			f.review,
			f.scope,
			true,
			f.file,
			{ kind: "loaded", value, pending: true },
			201,
		),
	).toBe("check");
});
test("malformed descriptors and graph caps refuse transfer", () => {
	const f = setup(),
		row = f.review.authoredRecords[0];
	expect(
		mediaFiles({ ...f.review, authoredRecords: [{ ...row, dataJson: "{" }] })
			.issue,
	).toBeTruthy();
	expect(
		mediaFiles({
			...f.review,
			authoredRecords: [
				{
					...row,
					dataJson: JSON.stringify({
						...JSON.parse(row.dataJson),
						fileSize: 3 * 1024 * 1024,
					}),
				},
			],
		}).issue,
	).toBeTruthy();
	expect(
		mediaFiles({
			...f.review,
			authoredRecords: Array.from({ length: 9 }, (_, i) => ({
				...row,
				key: `media:${i}`,
			})),
		}).issue,
	).toBeTruthy();
});
test("acknowledgement and fresh rereads precede one marked file action", async () => {
	const f = setup(),
		confirmation: FileConfirmation = {
			review: f.review,
			scopeKey: JSON.stringify(f.scope),
			file: f.file,
			mode: "transfer",
		};
	const calls: string[] = [];
	let current = true;
	const deps = {
		context: () => ({ scope: f.scope, allowed: true, current, now: 100 }),
		readReview: async () => {
			calls.push("read");
			return f.review;
		},
		readStatus: async () => fresh,
		markPending: () => {
			calls.push("marker");
		},
		execute: async () => {
			calls.push("execute");
			return null;
		},
	};
	expect(
		await rejected(() => submitFileConfirmation(confirmation, false, deps)),
	).toBe(true);
	expect(calls).toHaveLength(0);
	await submitFileConfirmation(confirmation, true, deps);
	expect(calls).toEqual(["read", "marker", "execute"]);
	current = false;
	expect(
		await rejected(() => submitFileConfirmation(confirmation, true, deps)),
	).toBe(true);
	expect(calls.filter((x) => x === "execute")).toHaveLength(1);
});
test("changed fingerprint after dialog open blocks dispatch", async () => {
	const f = setup(),
		confirmation: FileConfirmation = {
			review: f.review,
			scopeKey: JSON.stringify(f.scope),
			file: f.file,
			mode: "transfer",
		};
	let writes = 0;
	expect(
		await rejected(() =>
			submitFileConfirmation(confirmation, true, {
				context: () => ({
					scope: f.scope,
					allowed: true,
					current: true,
					now: 100,
				}),
				readReview: async () => ({
					...f.review,
					reviewFingerprint: "f".repeat(64),
				}),
				readStatus: async () => fresh,
				markPending: () => {},
				execute: async () => {
					writes++;
					return null;
				},
			}),
		),
	).toBe(true);
	expect(writes).toBe(0);
});
test("local markers only restore bounded matching receipt metadata", () => {
	expect(
		parseMediaMarkers('{"data":"secret"}', "scope", "receipt", "fp"),
	).toEqual({});
	expect(
		parseMediaMarkers(
			JSON.stringify({
				scopeKey: "scope",
				receiptId: "receipt",
				fingerprint: "fp",
				files: {
					"media:image": {
						pending: true,
						recoveryId: "recovery",
						recoveryFingerprint: "a".repeat(64),
					},
				},
			}),
			"scope",
			"receipt",
			"fp",
		),
	).toEqual({
		"media:image": {
			pending: true,
			recoveryId: "recovery",
			recoveryFingerprint: "a".repeat(64),
		},
	});
	expect(
		parseMediaMarkers("x".repeat(10001), "scope", "receipt", "fp"),
	).toEqual({});
});

function recoveryFixture(): Recovery {
	const f = setup();
	return {
		recoveryId: "recovery" as Recovery["recoveryId"],
		receiptId: f.review.receiptId,
		mediaKey: f.file.key,
		fingerprint: "c".repeat(64),
		status: "prepared",
		creatorId: "creator" as Recovery["creatorId"],
		beneficiaryId: f.scope.operatorId as Recovery["beneficiaryId"],
		reason: "The original operator left this site.",
		expiresAt: 200,
		retryAfter: null,
		storageId: null,
		canConfirm: true,
	};
}
test("fresh concurrent dispatch refuses a previously opened transfer confirmation", async () => {
	const f = setup();
	let writes = 0;
	const result = await rejected(() =>
		submitFileConfirmation(
			{
				review: f.review,
				scopeKey: JSON.stringify(f.scope),
				file: f.file,
				mode: "transfer",
			},
			true,
			{
				context: () => ({
					scope: f.scope,
					allowed: true,
					current: true,
					now: 100,
				}),
				readReview: async () => f.review,
				readStatus: async () => ({
					kind: "loaded",
					pending: false,
					value: {
						transferKey: "d".repeat(64),
						phase: "uncertain",
						dispatchCount: 1,
						storageId: null,
						failureCode: null,
						possibleOrphan: true,
						retryAfter: null,
					},
				}),
				markPending: () => {
					writes++;
				},
				execute: async () => {
					writes++;
				},
			},
		),
	);
	expect(result).toBe(true);
	expect(writes).toBe(0);
});
test("recovery survives lost acknowledgement by rereading its exact saved receipt without another upload", async () => {
	const f = setup(),
		recovery = recoveryFixture(),
		calls: string[] = [];
	let reads = 0;
	const result = await submitRecoveryConfirmation(
		{
			review: f.review,
			scopeKey: JSON.stringify(f.scope),
			file: f.file,
			recovery,
		},
		true,
		{
			context: () => ({
				scope: f.scope,
				allowed: true,
				current: true,
				now: 100,
			}),
			readReview: async () => f.review,
			readRecovery: async (saved) => {
				expect(saved.recoveryId).toBe(recovery.recoveryId);
				expect(saved.fingerprint).toBe(recovery.fingerprint);
				calls.push("read");
				reads++;
				return reads === 1
					? recovery
					: {
							...recovery,
							status: "verified",
							storageId: "existing-copy",
							canConfirm: false,
						};
			},
			markPending: (saved) => {
				expect(saved.recoveryId).toBe(recovery.recoveryId);
				calls.push("marker");
			},
			confirm: async (args) => {
				expect(args.recoveryId).toBe(recovery.recoveryId);
				calls.push("confirm");
				throw new Error("response lost");
			},
		},
	);
	expect(result.status).toBe("verified");
	expect(calls).toEqual(["read", "marker", "confirm", "read"]);
});
test("recovery refuses changed permissions, fingerprints and server eligibility before a write", async () => {
	const f = setup(),
		recovery = recoveryFixture();
	for (const denied of [
		{ ...recovery, canConfirm: false },
		{ ...recovery, fingerprint: "f".repeat(64) },
		{ ...recovery, retryAfter: 150 },
		{ ...recovery, beneficiaryId: "other" as Recovery["beneficiaryId"] },
	]) {
		let writes = 0;
		expect(
			await rejected(() =>
				submitRecoveryConfirmation(
					{
						review: f.review,
						scopeKey: JSON.stringify(f.scope),
						file: f.file,
						recovery,
					},
					true,
					{
						context: () => ({
							scope: f.scope,
							allowed: true,
							current: true,
							now: 100,
						}),
						readReview: async () => f.review,
						readRecovery: async () => denied,
						markPending: () => {
							writes++;
						},
						confirm: async () => {
							writes++;
							return recovery;
						},
					},
				),
			),
		).toBe(true);
		expect(writes).toBe(0);
	}
});
test("scope change while recording a recovery blocks dispatch and preserves its marker", async () => {
	const f = setup(),
		recovery = recoveryFixture();
	let current = true,
		markers = 0,
		writes = 0;
	expect(
		await rejected(() =>
			submitRecoveryConfirmation(
				{
					review: f.review,
					scopeKey: JSON.stringify(f.scope),
					file: f.file,
					recovery,
				},
				true,
				{
					context: () => ({ scope: f.scope, allowed: true, current, now: 100 }),
					readReview: async () => f.review,
					readRecovery: async () => recovery,
					markPending: () => {
						markers++;
						current = false;
					},
					confirm: async () => {
						writes++;
						return recovery;
					},
				},
			),
		),
	).toBe(true);
	expect(markers).toBe(1);
	expect(writes).toBe(0);
});

test("updated content review refuses a partially accessible media ledger even when target media is already ready", async () => {
	const f = setup();
	f.review.authoredRecords.push({
		...f.review.authoredRecords[0],
		key: "media:second",
	});
	f.review.recordCount = 2;
	f.review.mediaReady = true;
	let writes = 0,
		reads = 0;
	const states: MediaState[] = [
		{
			kind: "loaded",
			pending: false,
			value: {
				transferKey: "d".repeat(64),
				phase: "verified",
				dispatchCount: 1,
				storageId: "copy",
				failureCode: null,
				possibleOrphan: false,
				retryAfter: null,
			},
		},
		{ kind: "error" },
	];
	expect(
		await rejected(() =>
			submitUpdatedMediaReview(f.review, {
				context: () => ({
					scope: f.scope,
					allowed: true,
					current: true,
					now: 100,
				}),
				readReview: async () => f.review,
				readStatus: async () => states[reads++],
				reviewTransferred: async () => {
					writes++;
					return f.review;
				},
			}),
		),
	).toBe(true);
	expect(reads).toBe(2);
	expect(writes).toBe(0);
});
test("verified copies produce one fresh review request without dispatching authored Apply", async () => {
	const f = setup();
	let writes = 0;
	const next = {
		...f.review,
		receiptId: "new-review" as typeof f.review.receiptId,
	};
	const result = await submitUpdatedMediaReview(f.review, {
		context: () => ({ scope: f.scope, allowed: true, current: true, now: 100 }),
		readReview: async () => f.review,
		readStatus: async () => ({
			kind: "loaded",
			pending: false,
			value: {
				transferKey: "d".repeat(64),
				phase: "verified",
				dispatchCount: 1,
				storageId: "copy",
				failureCode: null,
				possibleOrphan: false,
				retryAfter: null,
			},
		}),
		reviewTransferred: async (args) => {
			expect(args.receiptId).toBe(f.review.receiptId);
			expect(args.expectedReviewFingerprint).toBe(f.review.reviewFingerprint);
			expect(args.mediaKey).toBe(f.file.key);
			writes++;
			return next;
		},
	});
	expect(result.receiptId).toBe(next.receiptId);
	expect(writes).toBe(1);
	expect(result.applyState).toBe(null);
});
