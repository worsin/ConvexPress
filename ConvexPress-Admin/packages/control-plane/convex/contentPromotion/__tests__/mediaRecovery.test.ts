import { convexTest } from "convex-test";
import siteSchema from "../../../../backend/convex/schema";
import { makeFunctionReference } from "convex/server";
import { test, expect } from "bun:test";
import { getFunctionName } from "convex/server";
import { fixture as baseFixture } from "./harness";
import { runReview } from "../review";
import * as reviewRecords from "../records";
import * as recoveryRecords from "../mediaRecoveryRecords";
import * as mediaRecords from "../mediaTransferRecords";
import {
	runPrepareRecovery,
	runConfirmRecovery,
	type RecoveryTransport,
} from "../mediaRecovery";
import { hash } from "../policy";
import { promotionMediaTransferKey } from "@convexpress/site-contract";
async function fixture() {
	const sha256 = Buffer.from(
		await crypto.subtle.digest(
			"SHA-256",
			new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
		),
	).toString("hex");
	const f = await baseFixture();
	await f.t.run((ctx) => ctx.db.patch(f.ids.other, { role: "owner" }));
	let actor = f.ids.operator;
	let currentSource = "media-v1";
	const originalExport = f.remote.export;
	f.remote.export = async (...args) => {
		const value = (await originalExport(...args)) as any;
		value.manifest.records.push({
			key: "media:image",
			kind: "media",
			sourceRevision: currentSource,
			data: {
				title: "Image",
				slug: "image",
				fileName: "image.png",
				mimeType: "image/png",
				mediaType: "image",
				sha256,
				fileSize: 9,
			},
		});
		return value;
	};
	const dryRun = f.remote.dryRun;
	f.remote.dryRun = async (...args) => ({
		...((await dryRun(...args)) as object),
		ready: false,
		receiptId: null,
		issues: [
			{
				key: "media:image",
				path: "storageId",
				code: "TARGET_MEDIA_UPLOAD_REQUIRED",
				message: "Target file required",
			},
		],
	});
	const modules: Record<string, any> = {
		records: reviewRecords,
		mediaRecoveryRecords: recoveryRecords,
		mediaTransferRecords: mediaRecords,
	};
	const calls: string[] = [];
	const context: any = {
		...f.context,
		runAction: async (ref: any, args: any) => ({
			...(await f.context.runAction(ref, args)),
			siteCapabilities: ["manage_options", "media.upload"],
		}),
		runQuery: async (ref: any, args: any) => {
			const [module, name] = getFunctionName(ref).split(":");
			return f.invoke(modules[module.split("/")[1]][name], args, actor);
		},
		runMutation: async (ref: any, args: any) => {
			const [module, name] = getFunctionName(ref).split(":");
			calls.push(`${module}:${name}`);
			return f.invoke(modules[module.split("/")[1]][name], args, actor);
		},
	};
	const original = await runReview(context, f.args, f.remote);
	const originalRow = await f.t.run((ctx) => ctx.db.get(original.receiptId));
	if (!originalRow?.manifestJson) throw new Error(JSON.stringify(originalRow));
	const manifest = JSON.parse(originalRow.manifestJson);
	const media = { sha256, fileSize: 9, mimeType: "image/png" as const };
	const transferKey = promotionMediaTransferKey(
		manifest.source,
		manifest.target,
		media,
	);
	const transferId = await f.t.run((ctx) =>
		ctx.db.insert("overseer_contentPromotionMedia", {
			transferKey,
			receiptId: original.receiptId,
			operatorId: f.ids.operator,
			sourceIdentityJson: JSON.stringify(manifest.source),
			targetIdentityJson: JSON.stringify(manifest.target),
			...media,
			phase: "uploaded",
			leaseId: "old",
			leaseExpiresAt: 0,
			attempt: 1,
			dispatchCount: 1,
			targetIntentId: "target-intent",
			storageId: "target-storage",
			createdAt: 1,
			updatedAt: 1,
		}),
	);
	actor = f.ids.other;
	const own = await runReview(
		context,
		{
			...f.args,
			requestJson: JSON.stringify({
				...f.request,
				requestKey: "beneficiary-review",
			}),
		},
		f.remote,
	);
	const args = {
		receiptId: own.receiptId,
		expectedReviewFingerprint: own.reviewFingerprint,
		mediaKey: "media:image",
		reason: "Recover the existing image after operator departure",
	};
	let targetResult = {
		intentId: "target-intent",
		transferKey,
		status: "issued" as "issued" | "verified",
		storageId: null as string | null,
		...media,
	};
	const grants = new Map<string, any>();
	let grantCalls = 0,
		completeCalls = 0;
	const remote: RecoveryTransport = {
		export: (...a) => f.remote.export(...a),
		inspect: async () => ({ creatorId: "site-creator", result: targetResult }),
		status: async (_t, _token, a) => {
			const g = grants.get(a.recoveryKey);
			return g ? { ...g, result: targetResult } : null;
		},
		grant: async (_t, _token, a) => {
			grantCalls++;
			const g = {
				grantId: `target-grant-${a.recoveryKey}`,
				recoveryKey: a.recoveryKey,
				reviewFingerprint: a.reviewFingerprint,
				creatorId: "site-creator",
				beneficiaryId: "site-beneficiary",
				intentId: a.intentId,
				storageId: a.storageId,
				fingerprint: hash({
					recoveryKey: a.recoveryKey,
					reviewFingerprint: a.reviewFingerprint,
					transferKey,
					intentId: a.intentId,
					storageId: a.storageId,
					creatorId: "site-creator",
					beneficiaryId: "site-beneficiary",
					reason: a.reason,
				}),
				result: targetResult,
			};
			grants.set(a.recoveryKey, g);
			return g;
		},
		complete: async (_t, _token, a) => {
			completeCalls++;
			targetResult = {
				...targetResult,
				status: "verified",
				storageId: "target-storage",
			};
			return {
				...Array.from(grants.values()).find((g) => g.grantId === a.grantId),
				result: targetResult,
			};
		},
	};
	return {
		...f,
		context,
		remote,
		reviewRemote: f.remote,
		args,
		original,
		originalRow,
		own,
		transferId,
		transferKey,
		calls,
		grants,
		grantCalls: () => grantCalls,
		completeCalls: () => completeCalls,
		setActor: (id: typeof actor) => {
			actor = id;
		},
		changeSource: () => {
			currentSource = "changed";
		},
		targetVerified: () => {
			targetResult = {
				...targetResult,
				status: "verified",
				storageId: "target-storage",
			};
		},
	};
}
const confirmation = (prepared: any) => ({
	recoveryId: prepared.recoveryId,
	expectedFingerprint: prepared.fingerprint,
	confirmExistingBytes: true as const,
});
test("beneficiary own review explicitly recovers existing bytes, preserves creator/reviews and opens only reviewed status", async () => {
	const f = await fixture();
	await f.t.run((ctx) => ctx.db.patch(f.ids.operator, { isActive: false }));
	await expect(
		f.invoke(
			mediaRecords.get,
			{
				receiptId: f.own.receiptId,
				expectedReviewFingerprint: f.own.reviewFingerprint,
				mediaKey: "media:image",
			},
			f.ids.other,
		),
	).rejects.toBeDefined();
	const prepared = await runPrepareRecovery(f.context, f.args, f.remote);
	expect(prepared.status).toBe("prepared");
	expect(prepared.canConfirm).toBe(true);
	const done = await runConfirmRecovery(
		f.context,
		confirmation(prepared),
		f.remote,
	);
	expect(done.status).toBe("verified");
	expect(done.canConfirm).toBe(false);
	expect(done.storageId).toBe("target-storage");
	expect(
		(await runConfirmRecovery(f.context, confirmation(prepared), f.remote))
			.status,
	).toBe("verified");
	expect(f.grantCalls()).toBe(1);
	expect(f.completeCalls()).toBe(1);
	const media = await f.invoke(
		mediaRecords.get,
		{
			receiptId: f.own.receiptId,
			expectedReviewFingerprint: f.own.reviewFingerprint,
			mediaKey: "media:image",
		},
		f.ids.other,
	);
	expect(media.storageId).toBe("target-storage");
	await expect(
		f.invoke(
			mediaRecords.claim,
			{
				receiptId: f.own.receiptId,
				expectedReviewFingerprint: f.own.reviewFingerprint,
				mediaKey: "media:image",
				leaseId: "must-not-dispatch",
			},
			f.ids.other,
		),
	).rejects.toBeDefined();
	await f.t.run(async (ctx) => {
		const row = (await ctx.db.get(f.transferId))!;
		expect(row.operatorId).toBe(f.ids.operator);
		expect(row.receiptId).toBe(f.original.receiptId);
		expect(row.dispatchCount).toBe(1);
		expect(await ctx.db.get(f.original.receiptId)).toEqual(f.originalRow);
		expect(
			await ctx.db
				.query("overseer_contentPromotionMediaRecoveryAudit")
				.collect(),
		).toHaveLength(3);
	});
	expect(
		f.calls.some((x) => x.includes("dispatch") || x.includes("Applies")),
	).toBe(false);
});
test("unknown-ID uncertainty and active leases remain refused across beneficiary reviews", async () => {
	const f = await fixture();
	await f.t.run((ctx) =>
		ctx.db.patch(f.transferId, { storageId: undefined, phase: "uncertain" }),
	);
	await expect(runPrepareRecovery(f.context, f.args, f.remote)).rejects.toThrow(
		"EXISTING_BYTES_REQUIRED",
	);
	f.targetVerified();
	const p = await runPrepareRecovery(f.context, f.args, f.remote);
	expect(p.status).toBe("prepared");
	await f.t.run((ctx) =>
		ctx.db.patch(f.transferId, { leaseExpiresAt: Date.now() + 100_000 }),
	);
	await expect(
		runConfirmRecovery(f.context, confirmation(p), f.remote),
	).rejects.toThrow("BUSY");
	expect(f.grantCalls()).toBe(0);
	expect(
		(await f.t.run((ctx) => ctx.db.get(f.transferId)))?.dispatchCount,
	).toBe(1);
});
test("fresh source, own review, exact receipt and revoked current scopes fail closed", async () => {
	const f = await fixture();
	await expect(
		runPrepareRecovery(
			f.context,
			{
				...f.args,
				receiptId: f.original.receiptId,
				expectedReviewFingerprint: f.original.reviewFingerprint,
			},
			f.remote,
		),
	).rejects.toBeDefined();
	const p = await runPrepareRecovery(f.context, f.args, f.remote);
	await expect(
		runConfirmRecovery(
			f.context,
			{ ...confirmation(p), expectedFingerprint: "0".repeat(64) },
			f.remote,
		),
	).rejects.toBeDefined();
	f.changeSource();
	await expect(
		runConfirmRecovery(f.context, confirmation(p), f.remote),
	).rejects.toThrow("MEDIA_SOURCE_CHANGED");
	await f.t.run((ctx) => ctx.db.patch(f.ids.other, { isActive: false }));
	await expect(
		f.invoke(recoveryRecords.get, confirmation(p), f.ids.other),
	).rejects.toBeDefined();
	expect(f.grantCalls()).toBe(0);
});
for (const lost of ["grant", "complete", "finish"] as const)
	test(`lost ${lost} acknowledgement reconciles the same grant and storage without duplicate dispatch`, async () => {
		const f = await fixture();
		const p = await runPrepareRecovery(f.context, f.args, f.remote);
		let lostOnce = false;
		if (lost === "finish") {
			const mutation = f.context.runMutation;
			f.context.runMutation = async (ref: any, args: any) => {
				const value = await mutation(ref, args);
				if (
					!lostOnce &&
					getFunctionName(ref).endsWith("mediaRecoveryRecords:finish")
				) {
					lostOnce = true;
					throw new Error("ack lost");
				}
				return value;
			};
		} else {
			const original = f.remote[lost];
			f.remote[lost] = async (...args: any[]) => {
				const value = await (original as any)(...args);
				if (!lostOnce) {
					lostOnce = true;
					throw new Error("ack lost");
				}
				return value;
			};
		}
		await runConfirmRecovery(f.context, confirmation(p), f.remote);
		expect(
			(await runConfirmRecovery(f.context, confirmation(p), f.remote)).status,
		).toBe("verified");
		expect(f.grantCalls()).toBe(1);
		expect(f.completeCalls()).toBe(1);
		expect(
			(await f.t.run((ctx) => ctx.db.get(f.transferId)))?.dispatchCount,
		).toBe(1);
	});
test("changed target evidence and revoked target session cannot activate a controller grant", async () => {
	const f = await fixture();
	const p = await runPrepareRecovery(f.context, f.args, f.remote);
	const granted = f.remote.grant;
	f.remote.grant = async (...a) => ({
		...((await granted(...a)) as object),
		storageId: "wrong-storage",
	});
	expect(
		(await runConfirmRecovery(f.context, confirmation(p), f.remote)).status,
	).toBe("granting");
	expect((await f.t.run((ctx) => ctx.db.get(f.transferId)))?.phase).toBe(
		"uploaded",
	);
	f.context.runAction = async () => ({
		token: "opaque",
		websiteKey: "aster",
		instanceKey: "aster:live",
		siteOrigin: "https://live.aster.example",
		capabilities: [],
		siteRole: "administrator",
		siteCapabilities: [],
		expiresAt: Date.now() + 60_000,
	});
	await expect(
		runConfirmRecovery(f.context, confirmation(p), f.remote),
	).rejects.toBeDefined();
});
test("controller confirmation uses actual target registered grants and storage metadata with no authored replay", async () => {
	const f = await fixture();
	const manifest = JSON.parse(f.originalRow!.manifestJson!);
	const site = convexTest({
		schema: siteSchema,
		modules: {
			"./convex/_generated/server.js": () =>
				import("../../../../backend/convex/_generated/server.js"),
			"./convex/contentPromotion/mediaUploads.ts": () =>
				import("../../../../backend/convex/contentPromotion/mediaUploads"),
			"./convex/contentPromotion/mediaRecovery.ts": () =>
				import("../../../../backend/convex/contentPromotion/mediaRecovery"),
		},
	});
	const ids = await site.run(async (ctx) => {
		const roleId = await ctx.db.insert("roles", {
			name: "Administrator",
			slug: "administrator",
			description: "Fixture",
			level: 100,
			type: "internal",
			status: "active",
			isDefault: false,
			isProtected: true,
			capabilities: ["manage_options", "media.upload"],
			pageAccess: [],
			createdAt: 1,
			updatedAt: 1,
		});
		const creator = await ctx.db.insert("users", {
			email: "creator@example.test",
			emailVerified: true,
			status: "active",
			authSource: "local",
			roleId,
			createdAt: 1,
			updatedAt: 1,
		});
		const beneficiary = await ctx.db.insert("users", {
			email: "beneficiary@example.test",
			emailVerified: true,
			status: "active",
			authSource: "local",
			roleId,
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("convexpress_siteIdentity", {
			...manifest.target,
			identityKey: "site-identity",
			managementOrigin: "https://aster-live.convex.site",
			siteContractVersion: "1",
			engineVersion: "1",
			managementCapabilities: [],
			initializedAt: 1,
			updatedAt: 1,
		});
		const storageId = await ctx.storage.store(
			new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], {
				type: "image/png",
			}),
		);
		// Restore only the Content-Type field omitted by convex-test storage fixtures.
		await ctx.db.patch(
			storageId as never,
			{ contentType: "image/png" } as never,
		);
		return { creator, beneficiary, storageId };
	});
	const creator = site.withIdentity({
			subject: ids.creator,
			issuer: "https://convexpress-admin.local",
		}),
		beneficiary = site.withIdentity({
			subject: ids.beneficiary,
			issuer: "https://convexpress-admin.local",
		});
	const transfer = (await f.t.run((ctx) => ctx.db.get(f.transferId)))!;
	const args = {
		source: manifest.source,
		target: manifest.target,
		media: {
			sha256: transfer.sha256,
			fileSize: transfer.fileSize,
			mimeType: transfer.mimeType,
		},
	};
	const begun = await creator.mutation(
		makeFunctionReference<"mutation">("contentPromotion/mediaUploads:begin"),
		args,
	);
	await f.t.run((ctx) =>
		ctx.db.patch(f.transferId, {
			targetIntentId: begun.result.intentId,
			storageId: ids.storageId,
		}),
	);
	const transport: RecoveryTransport = {
		export: f.remote.export,
		inspect: (_t, _token, args) =>
			beneficiary.query(
				makeFunctionReference<"query">(
					"contentPromotion/mediaRecovery:inspect",
				),
				args,
			),
		grant: (_t, _token, args) =>
			beneficiary.mutation(
				makeFunctionReference<"mutation">(
					"contentPromotion/mediaRecovery:grant",
				),
				args,
			),
		status: (_t, _token, args) =>
			beneficiary.query(
				makeFunctionReference<"query">("contentPromotion/mediaRecovery:status"),
				args,
			),
		complete: (_t, _token, args) =>
			beneficiary.mutation(
				makeFunctionReference<"mutation">(
					"contentPromotion/mediaRecovery:complete",
				),
				args,
			),
	};
	const p = await runPrepareRecovery(f.context, f.args, transport);
	const recovered = await runConfirmRecovery(
		f.context,
		confirmation(p),
		transport,
	);
	expect(recovered.status).toBe("verified");
	expect(recovered.storageId).toBe(ids.storageId);
	expect(
		(await runConfirmRecovery(f.context, confirmation(p), transport)).status,
	).toBe("verified");
	await site.run(async (ctx) => {
		const intent = (await ctx.db.get(begun.result.intentId))!;
		expect(intent.operatorId).toBe(ids.creator);
		expect(intent.status).toBe("verified");
		expect(
			await ctx.db.query("contentPromotion_mediaRecoveryGrants").collect(),
		).toHaveLength(1);
		expect(
			await ctx.db.query("contentPromotion_mediaRecoveryAudit").collect(),
		).toHaveLength(2);
		expect(await ctx.db.query("media").collect()).toHaveLength(0);
		expect(await ctx.db.system.query("_storage").collect()).toHaveLength(1);
		expect(
			await ctx.db.system.query("_scheduled_functions").collect(),
		).toHaveLength(0);
	});
	expect(
		(await f.t.run((ctx) => ctx.db.get(f.transferId)))?.dispatchCount,
	).toBe(1);
});
test("a departed beneficiary does not lock out a freshly authorized third operator", async () => {
	const f = await fixture();
	const p = await runPrepareRecovery(f.context, f.args, f.remote);
	const actualGrant = f.remote.grant;
	f.remote.grant = async (...args) => {
		await actualGrant(...args);
		throw new Error("grant ack lost");
	};
	expect(
		(await runConfirmRecovery(f.context, confirmation(p), f.remote)).status,
	).toBe("granting");
	const third = await f.t.run(async (ctx) => {
		await ctx.db.patch(f.ids.other, { isActive: false });
		return ctx.db.insert("overseer_users", {
			role: "owner",
			authUserId: "third",
			isActive: true,
			createdAt: 1,
		});
	});
	f.setActor(third);
	f.remote.grant = actualGrant;
	const own = await runReview(
		f.context,
		{
			...f.args,
			sourceConnectionId: f.ids.source.connection,
			targetConnectionId: f.ids.target.connection,
			requestJson: JSON.stringify({ ...f.request, requestKey: "third-review" }),
		},
		f.reviewRemote,
	);
	const thirdPrepared = await runPrepareRecovery(
		f.context,
		{
			...f.args,
			receiptId: own.receiptId,
			expectedReviewFingerprint: own.reviewFingerprint,
		},
		f.remote,
	);
	expect(
		(await runConfirmRecovery(f.context, confirmation(thirdPrepared), f.remote))
			.status,
	).toBe("verified");
	expect((await f.t.run((ctx) => ctx.db.get(f.transferId)))?.operatorId).toBe(
		f.ids.operator,
	);
	expect(
		(await f.t.run((ctx) => ctx.db.get(f.transferId)))?.dispatchCount,
	).toBe(1);
});
test("concurrent confirmations share one lease and expired confirmation cannot bypass it", async () => {
	const f = await fixture(),
		p = await runPrepareRecovery(f.context, f.args, f.remote);
	let entered!: () => void, release!: () => void;
	const entering = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const grant = f.remote.grant;
	f.remote.grant = async (...args) => {
		entered();
		await held;
		return grant(...args);
	};
	const first = runConfirmRecovery(f.context, confirmation(p), f.remote);
	await entering;
	await expect(
		runConfirmRecovery(f.context, confirmation(p), f.remote),
	).rejects.toThrow("BUSY");
	release();
	expect((await first).status).toBe("verified");
	expect(f.grantCalls()).toBe(1);
	const fresh = await fixture(),
		expired = await runPrepareRecovery(fresh.context, fresh.args, fresh.remote);
	await fresh.t.run((ctx) =>
		ctx.db.patch(expired.recoveryId, { expiresAt: Date.now() - 1 }),
	);
	await expect(
		runConfirmRecovery(fresh.context, confirmation(expired), fresh.remote),
	).rejects.toThrow("EXPIRED");
	expect(fresh.grantCalls()).toBe(0);
});
test("revocation after target completion preserves uncertainty and creator dispatch fence", async () => {
	const f = await fixture(),
		p = await runPrepareRecovery(f.context, f.args, f.remote);
	const complete = f.remote.complete;
	f.remote.complete = async (...args) => {
		const result = await complete(...args);
		await f.t.run((ctx) => ctx.db.patch(f.ids.other, { isActive: false }));
		return result;
	};
	await expect(
		runConfirmRecovery(f.context, confirmation(p), f.remote),
	).rejects.toBeDefined();
	const state = await f.t.run((ctx) => ctx.db.get(f.transferId));
	expect(state?.phase).toBe("uploaded");
	expect(state?.operatorId).toBe(f.ids.operator);
	expect(state?.dispatchCount).toBe(1);
	expect((await f.t.run((ctx) => ctx.db.get(p.recoveryId)))?.status).toBe(
		"granting",
	);
});
test("previously reused verified bytes retain a zero-dispatch ledger without acquiring upload permission", async () => {
	const f = await fixture();
	f.targetVerified();
	await f.t.run((ctx) =>
		ctx.db.patch(f.transferId, { phase: "verified", dispatchCount: 0 }),
	);
	const p = await runPrepareRecovery(f.context, f.args, f.remote);
	expect(
		(await runConfirmRecovery(f.context, confirmation(p), f.remote)).status,
	).toBe("verified");
	expect(
		(await f.t.run((ctx) => ctx.db.get(f.transferId)))?.dispatchCount,
	).toBe(0);
	expect(f.completeCalls()).toBe(0);
});
test("unvalidated target payloads and session echoes cannot enter public recovery DTOs", async () => {
	const f = await fixture(),
		p = await runPrepareRecovery(f.context, f.args, f.remote);
	const grant = f.remote.grant;
	f.remote.grant = async (...args) => ({
		...((await grant(...args)) as object),
		unexpected: "opaque-target-session-secret",
	});
	const result = await runConfirmRecovery(f.context, confirmation(p), f.remote);
	expect(result.status).toBe("granting");
	expect(JSON.stringify(result)).not.toContain("opaque-target-session-secret");
	expect(JSON.stringify(result)).not.toContain("unexpected");
	expect(
		(await f.t.run((ctx) => ctx.db.get(p.recoveryId)))?.targetGrantId,
	).toBeUndefined();
});
