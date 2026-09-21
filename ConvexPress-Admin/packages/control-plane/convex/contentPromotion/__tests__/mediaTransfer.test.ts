import { convexTest } from "convex-test";
import { test, expect } from "bun:test";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { fixture } from "./harness";
import { runReview } from "../review";
import {
	execute,
	reviewTransferred,
	runMediaTransfer,
	type MediaTransport,
} from "../mediaTransfer";
import * as records from "../mediaTransferRecords";
import { hash } from "../policy";
import { promotionMediaTransferKey } from "@convexpress/site-contract";
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
async function mediaFixture(fileSize = bytes.length) {
	const f = await fixture();
	const sha256 = Buffer.from(
		await crypto.subtle.digest("SHA-256", bytes),
	).toString("base64");
	const exporter = f.remote.export;
	f.remote.export = async (...args) => {
		const result = (await exporter(...args)) as any;
		result.manifest.records.push({
			key: "media:source-photo",
			kind: "media",
			sourceRevision: "photo-v1",
			data: {
				title: "Photo",
				fileName: "photo.png",
				slug: "photo",
				mimeType: "image/png",
				mediaType: "image",
				fileSize,
				sha256,
				altText: "A synthetic test image",
			},
		});
		result.downloadUrls = [
			{
				key: "media:source-photo",
				url: `${args[0].identity.deploymentOrigin}/api/storage/source-file`,
			},
		];
		return result;
	};
	f.remote.dryRun = async (_target, _token, manifest) => ({
		ready: false,
		digest: hash(manifest),
		receiptId: null,
		issues: [
			{
				key: "media:source-photo",
				path: "storageId",
				code: "TARGET_MEDIA_UPLOAD_REQUIRED",
				message: "Target file required",
			},
		],
		changes: manifest.records.map((record) => ({
			key: record.key,
			kind: record.kind,
			targetId: null,
			beforeRevision: hash(null),
			fields: Object.keys(record.data),
		})),
	});
	const review = await runReview(f.context, f.args, f.remote);
	const confirmation = {
		receiptId: review.receiptId,
		expectedReviewFingerprint: review.reviewFingerprint,
		mediaKey: "media:source-photo",
		confirmStorageWrite: true as const,
	};
	const calls: string[] = [];
	const context = {
		...f.context,
		runAction: async (ref: any, args: any) => {
			const session = await f.context.runAction(ref, args);
			return {
				...session,
				siteCapabilities: [...session.siteCapabilities, "media.upload"],
			};
		},
		runMutation: async (ref: any, args: any) => {
			const name = getFunctionName(ref).split(":")[1];
			calls.push(name);
			return f.invoke((records as any)[name], args);
		},
		runQuery: async (ref: any, args: any) =>
			f.invoke((records as any)[getFunctionName(ref).split(":")[1]], args),
	};
	let status: any = null;
	let uploads = 0;
	const remote: MediaTransport = {
		export: (...args) => f.remote.export(...args),
		download: async () => new Uint8Array(bytes),
		upload: async () => {
			calls.push("raw-post");
			uploads++;
			return "target-storage";
		},
		status: async () => status,
		begin: async (target, _token, args) => {
			status = {
				intentId: "target-intent",
				transferKey: promotionMediaTransferKey(
					args.source,
					args.target,
					args.media,
				),
				status: "issued",
				storageId: null,
				...args.media,
			};
			return {
				result: status,
				uploadUrl: `${target.identity.deploymentOrigin}/api/storage/upload?token=fixture-upload`,
			};
		},
		complete: async (_target, _token, args) => {
			status = { ...status, status: "verified", storageId: args.storageId };
			return status;
		},
	};
	return {
		...f,
		review,
		confirmation,
		reviewContext: f.context,
		reviewRemote: f.remote,
		context,
		remote,
		calls,
		uploads: () => uploads,
		setStatus: (next: any) => {
			status = next;
		},
		status: () => status,
	};
}
test("media transfer validates, records dispatch before one raw upload, finalizes and reuses verified storage", async () => {
	const f = await mediaFixture();
	const result = await runMediaTransfer(f.context, f.confirmation, f.remote);
	expect(result.phase).toBe("verified");
	expect(result.storageId).toBe("target-storage");
	expect(result.dispatchCount).toBe(1);
	expect(f.calls.indexOf("dispatch")).toBeLessThan(f.calls.indexOf("raw-post"));
	expect(
		(await runMediaTransfer(f.context, f.confirmation, f.remote)).phase,
	).toBe("verified");
	expect(f.uploads()).toBe(1);
	expect(JSON.stringify(result)).not.toContain("opaque-");
	expect(JSON.stringify(result)).not.toContain("fixture-upload");
});
test("lost native upload response remains uncertain across lease expiry and a different review ID", async () => {
	const f = await mediaFixture();
	const upload = f.remote.upload;
	f.remote.upload = async (...args) => {
		await upload(...args);
		throw new Error("Upload response lost");
	};
	expect(
		(await runMediaTransfer(f.context, f.confirmation, f.remote))
			.possibleOrphan,
	).toBe(true);
	const next = await runReview(
		f.reviewContext,
		{
			...f.args,
			requestJson: JSON.stringify({
				...f.request,
				requestKey: "another-media-review",
			}),
		},
		f.reviewRemote,
	);
	expect(
		(
			await runMediaTransfer(
				f.context,
				{
					...f.confirmation,
					receiptId: next.receiptId,
					expectedReviewFingerprint: next.reviewFingerprint,
				},
				f.remote,
			)
		).phase,
	).toBe("uncertain");
	expect(f.uploads()).toBe(1);
});
test("lost finalization and CP acknowledgements recover status or known ID without another upload", async () => {
	for (const layer of ["target", "cp", "remember"]) {
		const f = await mediaFixture();
		if (layer === "target") {
			const complete = f.remote.complete;
			f.remote.complete = async (...args) => {
				await complete(...args);
				throw new Error("Target acknowledgement lost");
			};
		} else {
			const mutate = f.context.runMutation;
			let once = true;
			f.context.runMutation = async (ref: any, args: any) => {
				const result = await mutate(ref, args);
				if (
					once &&
					getFunctionName(ref).endsWith(
						layer === "cp" ? ":finish" : ":remember",
					)
				) {
					once = false;
					throw new Error("CP acknowledgement lost");
				}
				return result;
			};
		}
		await runMediaTransfer(f.context, f.confirmation, f.remote);
		expect(
			(await runMediaTransfer(f.context, f.confirmation, f.remote)).phase,
		).toBe("verified");
		expect(f.uploads()).toBe(1);
	}
});
test("concurrent claims cannot issue a second raw POST and a dispatched stale lease cannot be reclaimed as a new upload", async () => {
	const f = await mediaFixture();
	const { confirmStorageWrite, ...args } = f.confirmation;
	const first = await f.invoke(records.claim, { ...args, leaseId: "first" });
	const second = await f.invoke(records.claim, { ...args, leaseId: "second" });
	expect(second.work).toBeNull();
	await f.invoke(records.dispatch, {
		...args,
		transferId: first.transferId,
		leaseId: "first",
		targetIntentId: "target-intent",
		sourceManifestJson: first.work.manifestJson,
	});
	await f.t.run((ctx) => ctx.db.patch(first.transferId, { leaseExpiresAt: 1 }));
	const next = await f.invoke(records.claim, { ...args, leaseId: "third" });
	expect(next.dispatchCount).toBe(1);
	await expect(
		f.invoke(records.dispatch, {
			...args,
			transferId: first.transferId,
			leaseId: "third",
			targetIntentId: "another",
			sourceManifestJson: first.work.manifestJson,
		}),
	).rejects.toThrow();
	expect(f.uploads()).toBe(0);
});
test("changed source bytes or target metadata cannot become a verified binding", async () => {
	const f = await mediaFixture();
	f.remote.download = async () => new Uint8Array([...bytes, 9]);
	expect(
		(await runMediaTransfer(f.context, f.confirmation, f.remote)).phase,
	).toBe("planned");
	expect(f.uploads()).toBe(0);
	const g = await mediaFixture();
	const complete = g.remote.complete;
	g.remote.complete = async (...args) => ({
		...((await complete(...args)) as any),
		fileSize: 999,
	});
	expect(
		(await runMediaTransfer(g.context, g.confirmation, g.remote)).phase,
	).toBe("uncertain");
	expect(g.uploads()).toBe(1);
});
test("revoked target connection before dispatch never uploads", async () => {
	const f = await mediaFixture();
	const download = f.remote.download;
	f.remote.download = async (...args) => {
		const value = await download(...args);
		await f.t.run((ctx) =>
			ctx.db.patch(f.ids.target.connection, { isActive: false }),
		);
		return value;
	};
	await expect(
		runMediaTransfer(f.context, f.confirmation, f.remote),
	).rejects.toThrow();
	expect(f.uploads()).toBe(0);
});

test("an oversized reviewed image is refused by the actual broker claim before transport", async () => {
	const f = await mediaFixture(2 * 1024 * 1024 + 1);
	await expect(
		runMediaTransfer(f.context, f.confirmation, f.remote),
	).rejects.toThrow();
	expect(f.uploads()).toBe(0);
	expect(f.calls).toEqual(["claim"]);
});
test("known returned storage survives failed target completion and retries only that completion", async () => {
	const f = await mediaFixture();
	const complete = f.remote.complete;
	let first = true;
	f.remote.complete = async (...args) => {
		if (first) {
			first = false;
			throw new Error("Target unavailable before completion");
		}
		return complete(...args);
	};
	expect(
		(await runMediaTransfer(f.context, f.confirmation, f.remote)).phase,
	).toBe("uncertain");
	expect(
		(await runMediaTransfer(f.context, f.confirmation, f.remote)).phase,
	).toBe("verified");
	expect(f.uploads()).toBe(1);
});

test("registered broker uses real target intents/storage/dry-run handlers and keeps transfer separate from authored apply", async () => {
	const siteSchema = (await import("../../../../backend/convex/schema"))
		.default;
	const site = convexTest({
		schema: siteSchema,
		modules: {
			"./convex/_generated/server.js": () =>
				import("../../../../backend/convex/_generated/server.js"),
			"./convex/contentPromotion/mediaUploads.ts": () =>
				import("../../../../backend/convex/contentPromotion/mediaUploads"),
			"./convex/contentPromotion/operations.ts": () =>
				import("../../../../backend/convex/contentPromotion/operations"),
		},
	});
	const user = await site.run(async (ctx) => {
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
				"page.create",
				"page.update",
				"page.publish",
				"page.set_parent",
				"page.read",
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
			websiteKey: "aster",
			instanceKey: "aster:live",
			deploymentOrigin: "https://aster-live.convex.cloud",
			siteOrigin: "https://live.aster.example",
			environmentKind: "live",
			schemaVersion: "1",
			identityKey: "site-identity",
			managementOrigin: "https://aster-live.convex.site",
			siteContractVersion: "1.0.0",
			engineVersion: "1",
			managementCapabilities: [],
			initializedAt: 1,
			updatedAt: 1,
		});
		return user;
	});
	const authed = site.withIdentity({
		subject: user,
		issuer: "https://convexpress-admin.local",
	});
	const f = await mediaFixture();
	const oldReceipt = await f.t.run((ctx) => ctx.db.get(f.review.receiptId));
	const work = await f.invoke(records.inspect, {
		receiptId: f.review.receiptId,
		expectedReviewFingerprint: f.review.reviewFingerprint,
		mediaKey: f.confirmation.mediaKey,
	});
	const cpRecords = await import("../records");
	const recordContext = {
		...f.context,
		runMutation: (ref: any, args: any) =>
			getFunctionName(ref).startsWith("contentPromotion/mediaTransferRecords:")
				? f.context.runMutation(ref, args)
				: f.invoke(
						(cpRecords as any)[getFunctionName(ref).split(":")[1]],
						args,
					),
		runQuery: (ref: any, args: any) =>
			getFunctionName(ref).startsWith("contentPromotion/mediaTransferRecords:")
				? f.context.runQuery(ref, args)
				: f.invoke(cpRecords.get, args),
	};
	const originalFetch = globalThis.fetch;
	let uploads = 0;
	const paths: string[] = [];
	globalThis.fetch = (async (input: any, init: any) => {
		const url = new URL(String(input));
		expect(init.redirect).toBe("error");
		if (url.pathname.startsWith("/api/storage/")) {
			expect(new Headers(init.headers).get("Authorization")).toBeNull();
			expect(init.credentials).toBe("omit");
			if (init.method === "GET") {
				expect(url.origin).toBe(work.source.identity.deploymentOrigin);
				return new Response(bytes, {
					headers: { "Content-Type": "image/png" },
				});
			}
			expect(url.origin).toBe(work.target.identity.deploymentOrigin);
			expect(init.method).toBe("POST");
			uploads++;
			const storageId = await site.run(async (ctx) => {
				const id = await ctx.storage.store(
					new Blob([init.body], { type: init.headers["Content-Type"] }),
				); /* convex-test lacks actual upload Content-Type metadata. */
				await ctx.db.patch(id as never, { contentType: "image/png" } as never);
				return id;
			});
			return new Response(JSON.stringify({ storageId }));
		}
		const body = JSON.parse(init.body);
		const args = body.args[0];
		paths.push(body.path);
		expect(new Headers(init.headers).get("Authorization")).toBe(
			url.hostname.includes("staging")
				? "Bearer opaque-source-session-secret"
				: "Bearer opaque-target-session-secret",
		);
		let value: any;
		if (body.path.endsWith(":exportManifest"))
			value = await f.reviewRemote.export(
				work.source,
				"fixture",
				{ ...f.request, selection: args.selection },
				work.target,
			);
		else if (url.pathname === "/api/query")
			value = await authed.query(
				makeFunctionReference<"query">(body.path),
				args,
			);
		else {
			value = await authed.mutation(
				makeFunctionReference<"mutation">(body.path),
				args,
			);
			if (value.uploadUrl)
				value.uploadUrl = value.uploadUrl.replace(
					"some-deployment.convex.cloud",
					"aster-live.convex.cloud",
				); /* Convex-test's generated URL has a fixed fake hostname; bind it to this fixture's exact target. */
		}
		return new Response(JSON.stringify({ status: "success", value }), {
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;
	try {
		const result = await (execute as any)._handler(
			recordContext,
			f.confirmation,
		);
		expect(result.phase).toBe("verified");
		expect(uploads).toBe(1);
		const beforeApply = await site.run(async (ctx) => ({
			media: await ctx.db.query("media").take(10),
			posts: await ctx.db.query("posts").take(10),
			jobs: await ctx.db.system.query("_scheduled_functions").take(10),
		}));
		expect(beforeApply).toEqual({ media: [], posts: [], jobs: [] });
		const { confirmStorageWrite, ...confirmation } = f.confirmation;
		const review = await (reviewTransferred as any)._handler(
			recordContext,
			confirmation,
		);
		expect(review.receiptId).not.toBe(f.review.receiptId);
		expect(review.canApply).toBe(true);
		expect(review.mediaReady).toBe(true);
		expect(await f.t.run((ctx) => ctx.db.get(f.review.receiptId))).toEqual(
			oldReceipt,
		);
		const stored = await f.t.run((ctx) => ctx.db.get(review.receiptId));
		await authed.mutation(
			makeFunctionReference<"mutation">("contentPromotion/operations:apply"),
			{
				receiptId: stored!.siteReceiptId,
				expectedDigest: stored!.siteDigest,
				confirmLive: true,
			},
		);
		const snapshot = await site.run(async (ctx) => ({
			media: await ctx.db.query("media").take(10),
			storage: await ctx.db.system.query("_storage").take(10),
			jobs: await ctx.db.system.query("_scheduled_functions").take(10),
			orders: await ctx.db.query("commerce_orders").take(10),
		}));
		expect(snapshot.media).toHaveLength(1);
		expect(snapshot.media[0].storageId).toBe(result.storageId);
		expect(snapshot.storage).toHaveLength(1);
		expect(snapshot.jobs).toHaveLength(0);
		expect(snapshot.orders).toHaveLength(0);
		expect(
			(await (execute as any)._handler(recordContext, f.confirmation)).phase,
		).toBe("verified");
		expect(uploads).toBe(1);
		expect(paths.some((path) => /snapshot|rollback/.test(path))).toBe(false);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("lost controller dispatch acknowledgement never authorizes a POST or a later reupload", async () => {
	const f = await mediaFixture();
	const mutate = f.context.runMutation;
	let once = true;
	f.context.runMutation = async (ref: any, args: any) => {
		const result = await mutate(ref, args);
		if (once && getFunctionName(ref).endsWith(":dispatch")) {
			once = false;
			throw new Error("Dispatch ack lost");
		}
		return result;
	};
	expect(
		(await runMediaTransfer(f.context, f.confirmation, f.remote)).phase,
	).toBe("uncertain");
	expect(
		(await runMediaTransfer(f.context, f.confirmation, f.remote)).phase,
	).toBe("uncertain");
	expect(f.uploads()).toBe(0);
});

test("target session echoes are never accepted as upload tokens or receipt evidence", async () => {
	const f = await mediaFixture();
	const begin = f.remote.begin;
	f.remote.begin = async (...args) => ({
		...((await begin(...args)) as any),
		uploadUrl: `${args[0].identity.deploymentOrigin}/api/storage/upload?token=${args[1]}`,
	});
	const result = await runMediaTransfer(f.context, f.confirmation, f.remote);
	expect(result.phase).toBe("planned");
	expect(f.uploads()).toBe(0);
	expect(JSON.stringify(result)).not.toContain("opaque-");
});

test("target revocation after POST prevents finalization and never permits an upload replay", async () => {
	const f = await mediaFixture();
	const upload = f.remote.upload;
	f.remote.upload = async (...args) => {
		const id = await upload(...args);
		await f.t.run((ctx) =>
			ctx.db.patch(f.ids.target.connection, { isActive: false }),
		);
		return id;
	};
	await expect(
		runMediaTransfer(f.context, f.confirmation, f.remote),
	).rejects.toThrow();
	expect(f.uploads()).toBe(1);
	await f.t.run(async (ctx) => {
		await ctx.db.patch(f.ids.target.connection, { isActive: true });
		const row = (
			await ctx.db.query("overseer_contentPromotionMedia").take(2)
		)[0];
		await ctx.db.patch(row._id, { leaseExpiresAt: 1 });
	});
	const result = await runMediaTransfer(f.context, f.confirmation, f.remote);
	expect(result.phase).toBe("uncertain");
	expect(result.possibleOrphan).toBe(true);
	expect(f.uploads()).toBe(1);
});
