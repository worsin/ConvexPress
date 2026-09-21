import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
const modules = {
	"./convex/_generated/server.js": () => import("../../_generated/server.js"),
	"./convex/contentPromotion/mediaUploads.ts": () => import("../mediaUploads"),
	"./convex/contentPromotion/mediaRecovery.ts": () =>
		import("../mediaRecovery"),
};
const mutation = (name: string) =>
	makeFunctionReference<"mutation">(`contentPromotion/mediaRecovery:${name}`);
const query = (name: string) =>
	makeFunctionReference<"query">(`contentPromotion/mediaRecovery:${name}`);
async function fixture() {
	const t = convexTest({ schema, modules });
	const target = {
		websiteKey: "site",
		instanceKey: "site:live",
		deploymentOrigin: "https://target.convex.cloud",
		siteOrigin: "https://target.example.test",
		environmentKind: "live" as const,
		schemaVersion: "1",
	};
	const ids = await t.run(async (ctx) => {
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
		async function user(email: string) {
			return ctx.db.insert("users", {
				email,
				emailVerified: true,
				status: "active",
				authSource: "local",
				roleId,
				createdAt: 1,
				updatedAt: 1,
			});
		}
		const creator = await user("creator@example.test"),
			beneficiary = await user("beneficiary@example.test"),
			third = await user("third@example.test");
		await ctx.db.insert("convexpress_siteIdentity", {
			...target,
			identityKey: "site-identity",
			managementOrigin: "https://target.convex.site",
			siteContractVersion: "1",
			engineVersion: "1",
			managementCapabilities: [],
			initializedAt: 1,
			updatedAt: 1,
		});
		const bytes = new Blob(
			[new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])],
			{ type: "image/png" },
		);
		const storageId = await ctx.storage.store(bytes); // convex-test omits Content-Type on its storage fixture.
		await ctx.db.patch(
			storageId as never,
			{ contentType: bytes.type } as never,
		);
		const storage = (await ctx.db.system.get(storageId))!;
		return {
			creator,
			beneficiary,
			third,
			storageId,
			media: {
				sha256: storage.sha256,
				fileSize: storage.size,
				mimeType: "image/png" as const,
			},
		};
	});
	const auth = (subject: typeof ids.creator) =>
		t.withIdentity({ subject, issuer: "https://convexpress-admin.local" });
	const args = {
		source: {
			...target,
			instanceKey: "site:staging",
			environmentKind: "staging" as const,
			deploymentOrigin: "https://source.convex.cloud",
			siteOrigin: "https://source.example.test",
		},
		target,
		media: ids.media,
	};
	const begun = await auth(ids.creator).mutation(
		makeFunctionReference<"mutation">("contentPromotion/mediaUploads:begin"),
		args,
	);
	const grantArgs = {
		...args,
		intentId: begun.result.intentId,
		storageId: ids.storageId,
		recoveryKey: "a".repeat(64),
		reviewFingerprint: "b".repeat(64),
		reason: "Recover verified authored image after operator departure",
	};
	return { t, ids, auth, args, grantArgs, begun };
}
test("target beneficiary grant reconciles only exact existing bytes and preserves creator with atomic audit", async () => {
	const f = await fixture();
	const b = f.auth(f.ids.beneficiary);
	await f.t.run((ctx) => ctx.db.patch(f.ids.creator, { status: "inactive" }));
	await expect(
		b.query(
			makeFunctionReference<"query">("contentPromotion/mediaUploads:status"),
			f.args,
		),
	).rejects.toBeDefined();
	expect((await b.query(query("inspect"), f.args)).creatorId).toBe(
		f.ids.creator,
	);
	const grant = await b.mutation(mutation("grant"), f.grantArgs);
	expect(grant.creatorId).toBe(f.ids.creator);
	expect(grant.beneficiaryId).toBe(f.ids.beneficiary);
	expect(grant.result.status).toBe("issued");
	expect((await b.mutation(mutation("grant"), f.grantArgs)).grantId).toBe(
		grant.grantId,
	);
	const result = await b.mutation(mutation("complete"), {
		...f.args,
		grantId: grant.grantId,
	});
	expect(result.result.status).toBe("verified");
	expect(result.result.storageId).toBe(f.ids.storageId);
	await b.mutation(mutation("complete"), { ...f.args, grantId: grant.grantId });
	await f.t.run(async (ctx) => {
		expect((await ctx.db.get(f.begun.result.intentId))?.operatorId).toBe(
			f.ids.creator,
		);
		expect(
			await ctx.db.query("contentPromotion_mediaRecoveryGrants").collect(),
		).toHaveLength(1);
		expect(
			await ctx.db.query("contentPromotion_mediaRecoveryAudit").collect(),
		).toHaveLength(2);
		expect(await ctx.db.query("media").collect()).toHaveLength(0);
		expect(
			await ctx.db.system.query("_scheduled_functions").collect(),
		).toHaveLength(0);
	});
});
test("target recovery rejects other beneficiary, revoked scope, replaced IDs and changed confirmation", async () => {
	const f = await fixture(),
		b = f.auth(f.ids.beneficiary);
	const grant = await b.mutation(mutation("grant"), f.grantArgs);
	await expect(
		f.auth(f.ids.third).query(query("status"), {
			...f.args,
			recoveryKey: f.grantArgs.recoveryKey,
		}),
	).rejects.toBeDefined();
	await expect(
		b.mutation(mutation("grant"), {
			...f.grantArgs,
			reason: "Changed reviewed reason",
		}),
	).rejects.toBeDefined();
	const wrong = await f.t.run((ctx) =>
		ctx.storage.store(new Blob(["wrong"], { type: "image/png" })),
	);
	await expect(
		b.mutation(mutation("grant"), {
			...f.grantArgs,
			recoveryKey: "c".repeat(64),
			storageId: wrong,
		}),
	).rejects.toBeDefined();
	await expect(
		b.query(query("inspect"), {
			...f.args,
			target: { ...f.args.target, instanceKey: "another" },
		}),
	).rejects.toBeDefined();
	await f.t.run((ctx) =>
		ctx.db.patch(f.ids.beneficiary, { status: "inactive" }),
	);
	await expect(
		b.mutation(mutation("complete"), { ...f.args, grantId: grant.grantId }),
	).rejects.toBeDefined();
	expect(
		(await f.t.run((ctx) => ctx.db.get(f.begun.result.intentId)))?.status,
	).toBe("issued");
});
test("target multiple audited beneficiaries share same verified binding without destructive adoption", async () => {
	const f = await fixture();
	const b = f.auth(f.ids.beneficiary),
		c = f.auth(f.ids.third);
	const first = await b.mutation(mutation("grant"), f.grantArgs);
	await b.mutation(mutation("complete"), { ...f.args, grantId: first.grantId });
	const second = await c.mutation(mutation("grant"), {
		...f.grantArgs,
		recoveryKey: "d".repeat(64),
		reviewFingerprint: "e".repeat(64),
	});
	expect(second.creatorId).toBe(f.ids.creator);
	expect(second.storageId).toBe(first.storageId);
	expect(second.beneficiaryId).toBe(f.ids.third);
	expect(
		(
			await b.query(query("status"), {
				...f.args,
				recoveryKey: f.grantArgs.recoveryKey,
			})
		).grantId,
	).toBe(first.grantId);
});
test("target recovery rechecks upload policy and actual metadata before issuing a grant or completing", async () => {
	const f = await fixture(),
		b = f.auth(f.ids.beneficiary);
	const settings = await f.t.run((ctx) =>
		ctx.db.insert("settings", {
			section: "media",
			values: { maxUploadSize: 1 },
			updatedBy: f.ids.beneficiary,
			updatedAt: 1,
		}),
	);
	await expect(
		b.mutation(mutation("grant"), f.grantArgs),
	).rejects.toBeDefined();
	await f.t.run((ctx) => ctx.db.delete(settings));
	const grant = await b.mutation(mutation("grant"), f.grantArgs);
	await f.t.run((ctx) =>
		ctx.db.patch(
			f.ids.storageId as never,
			{ contentType: "image/jpeg" } as never,
		),
	);
	await expect(
		b.mutation(mutation("complete"), { ...f.args, grantId: grant.grantId }),
	).rejects.toBeDefined();
	expect(
		(await f.t.run((ctx) => ctx.db.get(f.begun.result.intentId)))?.status,
	).toBe("issued");
});
