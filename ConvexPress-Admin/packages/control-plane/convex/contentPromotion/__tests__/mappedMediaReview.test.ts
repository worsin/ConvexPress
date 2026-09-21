import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../../../backend/convex/schema";
import { fixture as brokerFixture } from "./harness";
import { runReview } from "../review";
import { inspect as inspectMediaTransfer } from "../mediaTransferRecords";
import { reviewedEnvelope } from "../applyPolicy";
async function fixture() {
	const f = await brokerFixture();
	f.request.selection.pageIds = [];
	f.request.selection.mediaIds = ["source-image"];
	f.args.requestJson = JSON.stringify(f.request);
	const site = convexTest({
		schema,
		modules: {
			"./convex/_generated/server.js": () =>
				import("../../../../backend/convex/_generated/server.js"),
			"./convex/contentPromotion/operations.ts": () =>
				import("../../../../backend/convex/contentPromotion/operations"),
		},
	});
	const { target, source } = JSON.parse(
		JSON.stringify({
			target: {
				websiteKey: "aster",
				instanceKey: "aster:live",
				deploymentOrigin: "https://aster-live.convex.cloud",
				siteOrigin: "https://live.aster.example",
				environmentKind: "live",
				schemaVersion: "1",
			},
			source: {
				websiteKey: "aster",
				instanceKey: "aster:staging",
				deploymentOrigin: "https://aster-staging.convex.cloud",
				siteOrigin: "https://staging.aster.example",
				environmentKind: "staging",
				schemaVersion: "1",
			},
		}),
	);
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
			capabilities: [
				"manage_options",
				"media.read",
				"media.upload",
				"media.update",
			],
			pageAccess: [],
			createdAt: 1,
			updatedAt: 1,
		});
		const user = await ctx.db.insert("users", {
			email: "operator@example.test",
			emailVerified: true,
			status: "active",
			authSource: "local",
			roleId,
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("convexpress_siteIdentity", {
			...target,
			identityKey: "site-identity",
			managementOrigin: "https://aster-live.convex.site",
			siteContractVersion: "1",
			engineVersion: "1",
			managementCapabilities: [],
			initializedAt: 1,
			updatedAt: 1,
		});
		const storageId = await ctx.storage.store(
			new Blob(["existing reviewed image"], { type: "image/png" }),
		);
		const storage = (await ctx.db.system.get(storageId))!;
		const data = {
			title: "Aster image",
			slug: "aster-image",
			fileName: "aster.png",
			mimeType: "image/png",
			mediaType: "image",
			sha256: storage.sha256,
			fileSize: storage.size,
		};
		const mediaId = await ctx.db.insert("media", {
			title: data.title,
			slug: data.slug,
			fileName: data.fileName,
			mimeType: data.mimeType,
			mediaType: "image",
			fileSize: storage.size,
			storageId,
			url: (await ctx.storage.getUrl(storageId))!,
			status: "active",
			uploadedBy: user,
			createdAt: 1,
			updatedAt: 1,
		});
		await ctx.db.insert("contentPromotion_mappings", {
			sourceInstanceKey: source.instanceKey,
			sourceKey: "media:source-image",
			kind: "media",
			targetId: mediaId,
			updatedAt: 1,
		});
		return { user, storageId, mediaId, data };
	});
	const authed = site.withIdentity({
		subject: ids.user,
		issuer: "https://convexpress-admin.local",
	});
	f.remote.export = async () => ({
		manifest: {
			version: 1,
			source,
			target,
			selection: structuredClone(f.request.selection),
			records: [
				{
					key: "media:source-image",
					kind: "media",
					sourceRevision: "image-v1",
					data: ids.data,
				},
			],
			dependencies: [],
			issues: [],
		},
		downloadUrls: [],
	});
	f.remote.dryRun = async (_target, _token, manifest, request) =>
		authed.mutation(
			makeFunctionReference<"mutation">("contentPromotion/operations:dryRun"),
			{
				manifest,
				mediaBindings: request.mediaBindings,
				dependencyBindings: request.dependencyBindings,
			},
		);
	return { ...f, site, ids, authed };
}
test("registered target's already-mapped verified bytes produce a durable ready broker review without a supplied binding", async () => {
	const f = await fixture();
	const result = await runReview(f.context, f.args, f.remote);
	expect(result.status).toBe("reviewed");
	expect(result.mediaReady).toBe(true);
	expect(result.mediaProvided).toBe(1);
	expect(result.canApply).toBe(true);
	const row = (await f.t.run((ctx) => ctx.db.get(result.receiptId)))!;
	const reviewed = reviewedEnvelope(row);
	expect(reviewed.request.mediaBindings).toHaveLength(0);
	const recoveryWork = await f.invoke(inspectMediaTransfer, {
		receiptId: result.receiptId,
		expectedReviewFingerprint: result.reviewFingerprint,
		mediaKey: "media:source-image",
	});
	expect(JSON.parse(recoveryWork.manifestJson).records[0].key).toBe(
		"media:source-image",
	);
	expect(reviewed.review.verifiedMedia).toEqual([
		{
			key: "media:source-image",
			storageId: f.ids.storageId,
			sha256: f.ids.data.sha256,
			fileSize: f.ids.data.fileSize,
			resolution: "existing-target",
			targetId: f.ids.mediaId,
		},
	]);
	const targetReceipt = await f.site.run((ctx) =>
		ctx.db.get(row.siteReceiptId as never),
	);
	expect(targetReceipt).toBeDefined();
	await f.site.run(async (ctx) => {
		expect(await ctx.db.query("media").collect()).toHaveLength(1);
		expect(await ctx.db.system.query("_storage").collect()).toHaveLength(1);
		expect(
			await ctx.db.system.query("_scheduled_functions").collect(),
		).toHaveLength(0);
	});
});
test("target IDs alone, missing evidence, mismatched bytes, extra keys and wrong explicit bindings cannot establish readiness", async () => {
	for (const corruption of [
		"missing",
		"hash",
		"size",
		"storage",
		"key",
		"target",
	]) {
		const f = await fixture();
		if (corruption === "storage") {
			f.request.mediaBindings = [
				{ key: "media:source-image", storageId: "not-the-reviewed-storage" },
			] as never;
			f.args.requestJson = JSON.stringify(f.request);
		}
		const dryRun = f.remote.dryRun;
		f.remote.dryRun = async (...args) => {
			const value = (await dryRun(...args)) as any;
			value.ready = true;
			value.issues = [];
			value.receiptId = value.receiptId ?? "pretend-site-receipt";
			if (corruption === "missing") delete value.verifiedMedia;
			else {
				value.verifiedMedia ??= [
					{
						key: "media:source-image",
						storageId: f.ids.storageId,
						sha256: f.ids.data.sha256,
						fileSize: f.ids.data.fileSize,
						resolution: "existing-target",
						targetId: f.ids.mediaId,
					},
				];
				if (corruption === "hash")
					value.verifiedMedia[0].sha256 = "a".repeat(64);
				if (corruption === "size") value.verifiedMedia[0].fileSize++;
				if (corruption === "key")
					value.verifiedMedia[0].key = "media:unselected";
				if (corruption === "target")
					value.verifiedMedia[0].targetId = "unrelated-target";
			}
			return value;
		};
		const result = await runReview(f.context, f.args, f.remote);
		expect(result.status).toBe("failed");
		expect(result.canApply).toBe(false);
		expect(result.mediaReady).toBe(false);
	}
});
test("removing target bytes before review blocks and removing them after review rejects actual Apply", async () => {
	const f = await fixture();
	const reviewed = await runReview(f.context, f.args, f.remote);
	expect(reviewed.status).toBe("reviewed");
	const row = (await f.t.run((ctx) => ctx.db.get(reviewed.receiptId)))!;
	await f.site.run((ctx) => ctx.storage.delete(f.ids.storageId));
	await expect(
		f.authed.mutation(
			makeFunctionReference<"mutation">("contentPromotion/operations:apply"),
			{
				receiptId: row.siteReceiptId,
				expectedDigest: row.siteDigest,
				confirmLive: true,
			},
		),
	).rejects.toBeDefined();
	const next = await runReview(
		f.context,
		{
			...f.args,
			requestJson: JSON.stringify({
				...f.request,
				requestKey: "missing-stored-bytes",
			}),
		},
		f.remote,
	);
	expect(next.status).toBe("blocked");
	expect(next.mediaReady).toBe(false);
	expect((await f.site.run((ctx) => ctx.db.get(f.ids.mediaId)))?.title).toBe(
		"Aster image",
	);
});
