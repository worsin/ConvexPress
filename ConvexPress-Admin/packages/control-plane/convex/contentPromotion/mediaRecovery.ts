"use node";
import { normalizeDeploymentOrigin } from "@convexpress/site-contract";
import { ConvexHttpClient } from "convex/browser";
import {
	makeFunctionReference,
	type ApiFromModules,
	type FunctionArgs,
	type FunctionReturnType,
} from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import { action, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type * as records from "./mediaRecoveryRecords";
import {
	recoverySummaryValidator,
	type RecoverySummary,
} from "./mediaRecoveryRecords";
import {
	mediaConfirmationArgs,
	type MediaConfirmation,
	type MediaWork,
} from "./mediaTransferRecords";
import { exchangeBrokerSession, boundedSiteFetch } from "./review";
import {
	hash,
	requestSchema,
	validateExport,
	type BrokerTarget,
	type BrokerRequest,
} from "./policy";
import { promotionMediaSpecSchema } from "@convexpress/site-contract";
import { recoveryDisposition } from "./mediaRecoveryProtocol";
type RecordApi = ApiFromModules<{ records: typeof records }>["records"];
function mr<N extends keyof RecordApi>(name: N) {
	return makeFunctionReference<
		"mutation",
		FunctionArgs<RecordApi[N]>,
		FunctionReturnType<RecordApi[N]>
	>(`contentPromotion/mediaRecoveryRecords:${name}`);
}
function qr<N extends keyof RecordApi>(name: N) {
	return makeFunctionReference<
		"query",
		FunctionArgs<RecordApi[N]>,
		FunctionReturnType<RecordApi[N]>
	>(`contentPromotion/mediaRecoveryRecords:${name}`);
}
type TargetArgs = {
	source: BrokerTarget["identity"];
	target: BrokerTarget["identity"];
	media: MediaWork["media"];
};
type GrantArgs = TargetArgs & {
	recoveryKey: string;
	reviewFingerprint: string;
	intentId: string;
	storageId: string;
	reason: string;
};
export interface RecoveryTransport {
	export(
		source: BrokerTarget,
		token: string,
		request: BrokerRequest,
		target: BrokerTarget,
	): Promise<unknown>;
	inspect(
		target: BrokerTarget,
		token: string,
		args: TargetArgs,
	): Promise<unknown>;
	grant(target: BrokerTarget, token: string, args: GrantArgs): Promise<unknown>;
	status(
		target: BrokerTarget,
		token: string,
		args: TargetArgs & { recoveryKey: string },
	): Promise<unknown>;
	complete(
		target: BrokerTarget,
		token: string,
		args: TargetArgs & { grantId: string },
	): Promise<unknown>;
}
async function client<T>(
	target: BrokerTarget,
	token: string,
	call: (c: ConvexHttpClient) => Promise<T>,
) {
	const c = new ConvexHttpClient(target.identity.deploymentOrigin, {
		auth: token,
		logger: false,
		fetch: boundedSiteFetch(target.identity.deploymentOrigin),
	});
	try {
		return await call(c);
	} finally {
		c.clearAuth();
	}
}
const remote: RecoveryTransport = {
	export: (s, token, r, t) =>
		client(s, token, (c) =>
			c.query(
				makeFunctionReference<
					"query",
					{
						target: BrokerTarget["identity"];
						selection: BrokerRequest["selection"];
					},
					unknown
				>("contentPromotion/operations:exportManifest"),
				{ target: t.identity, selection: r.selection },
			),
		),
	inspect: (t, token, a) =>
		client(t, token, (c) =>
			c.query(
				makeFunctionReference<"query", TargetArgs, unknown>(
					"contentPromotion/mediaRecovery:inspect",
				),
				a,
			),
		),
	grant: (t, token, a) =>
		client(t, token, (c) =>
			c.mutation(
				makeFunctionReference<"mutation", GrantArgs, unknown>(
					"contentPromotion/mediaRecovery:grant",
				),
				a,
			),
		),
	status: (t, token, a) =>
		client(t, token, (c) =>
			c.query(
				makeFunctionReference<
					"query",
					TargetArgs & { recoveryKey: string },
					unknown
				>("contentPromotion/mediaRecovery:status"),
				a,
			),
		),
	complete: (t, token, a) =>
		client(t, token, (c) =>
			c.mutation(
				makeFunctionReference<
					"mutation",
					TargetArgs & { grantId: string },
					unknown
				>("contentPromotion/mediaRecovery:complete"),
				a,
			),
		),
};
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
	digest = z.string().regex(/^[a-f0-9]{64}$/);
const resultSchema = z
	.object({
		intentId: id,
		transferKey: digest,
		status: z.enum(["issued", "verified"]),
		storageId: id.nullable(),
		sha256: z.string().max(100),
		fileSize: z.number(),
		mimeType: z.string().max(100),
	})
	.strict();
const inspectSchema = z
	.object({ creatorId: id, result: resultSchema })
	.strict();
const grantSchema = z
	.object({
		grantId: id,
		recoveryKey: digest,
		fingerprint: digest,
		creatorId: id,
		beneficiaryId: id,
		intentId: id,
		storageId: id,
		reviewFingerprint: digest,
		result: resultSchema,
	})
	.strict();
function safe(value: unknown, tokens: string[]) {
	const text = JSON.stringify(value);
	if (!text || text.length > 4096 || tokens.some((t) => text.includes(t)))
		throw new Error("MEDIA_RECOVERY_EVIDENCE_INVALID");
	return value;
}
function checkedResult(result: z.infer<typeof resultSchema>, work: MediaWork) {
	if (
		result.transferKey !== work.transferKey ||
		hash(
			promotionMediaSpecSchema.parse({
				sha256: result.sha256,
				fileSize: result.fileSize,
				mimeType: result.mimeType,
			}),
		) !== hash(work.media) ||
		(result.status === "verified" && !result.storageId)
	)
		throw new Error("MEDIA_RECOVERY_EVIDENCE_CHANGED");
}
async function sessionsAndSource(
	ctx: ActionCtx,
	work: MediaWork,
	transport: RecoveryTransport,
) {
	for (const origin of [work.source.identity.deploymentOrigin, work.target.identity.deploymentOrigin]) {
		try { if (normalizeDeploymentOrigin(origin) !== origin) throw Error(); }
		catch { throw new Error("MEDIA_RECOVERY_ORIGIN_INVALID"); }
	}
	const source = await exchangeBrokerSession(ctx, work.source),
		target = await exchangeBrokerSession(ctx, work.target);
	if (!target.siteCapabilities.includes("media.upload"))
		throw new Error("MEDIA_RECOVERY_ACCESS_DENIED");
	const tokens = [source.token, target.token];
	const exported = await transport.export(
		work.source,
		source.token,
		requestSchema.parse(JSON.parse(work.requestJson)),
		work.target,
	);
	if (tokens.some((t) => JSON.stringify(exported).includes(t)))
		throw new Error("MEDIA_SOURCE_INVALID");
	const manifest = validateExport(exported, work.source, work.target);
	if (hash(manifest) !== hash(JSON.parse(work.manifestJson)))
		throw new Error("MEDIA_SOURCE_CHANGED");
	return {
		target,
		tokens,
		manifest,
		targetArgs: {
			source: work.source.identity,
			target: work.target.identity,
			media: work.media,
		},
	};
}
export async function runPrepareRecovery(
	ctx: ActionCtx,
	args: MediaConfirmation & { reason: string },
	transport: RecoveryTransport = remote,
): Promise<RecoverySummary> {
	const { reason, ...confirmation } = args;
	if (!reason.trim() || reason.length > 500)
		throw new Error("Describe why these existing bytes need recovery.");
	const inspected = await ctx.runQuery(qr("inspect"), confirmation);
	const session = await sessionsAndSource(ctx, inspected.work, transport);
	if (session.tokens.some((t) => reason.includes(t)))
		throw new Error("MEDIA_RECOVERY_EVIDENCE_INVALID");
	const target = inspectSchema.parse(
		safe(
			await transport.inspect(
				inspected.work.target,
				session.target.token,
				session.targetArgs,
			),
			session.tokens,
		),
	);
	checkedResult(target.result, inspected.work);
	const disposition = recoveryDisposition(
		inspected.evidence,
		target.result,
		Date.now(),
	);
	if (disposition === "busy" || disposition === "unresolved")
		throw new Error("MEDIA_RECOVERY_EXISTING_BYTES_REQUIRED");
	const storageId = target.result.storageId ?? inspected.evidence.storageId;
	if (!storageId) throw new Error("MEDIA_RECOVERY_EXISTING_BYTES_REQUIRED");
	return ctx.runMutation(mr("prepare"), {
		...confirmation,
		reason,
		sourceManifestJson: JSON.stringify(session.manifest),
		expectedEvidenceHash: inspected.evidenceHash,
		targetCreatorId: target.creatorId,
		targetIntentId: target.result.intentId,
		targetStatus: target.result.status,
		storageId,
	});
}
type Confirmation = {
	recoveryId: Id<"overseer_contentPromotionMediaRecoveries">;
	expectedFingerprint: string;
	confirmExistingBytes: true;
};
export async function runConfirmRecovery(
	ctx: ActionCtx,
	args: Confirmation,
	transport: RecoveryTransport = remote,
): Promise<RecoverySummary> {
	if (args.confirmExistingBytes !== true)
		throw new Error("Confirm recovery of the reviewed existing bytes.");
	const { confirmExistingBytes: _confirm, ...confirmation } = args;
	const before = await ctx.runQuery(qr("work"), confirmation);
	const session = await sessionsAndSource(ctx, before.work, transport);
	const leaseId = crypto.randomUUID();
	const claimed = await ctx.runMutation(mr("claim"), {
		...confirmation,
		leaseId,
		sourceManifestJson: JSON.stringify(session.manifest),
	});
	function checked(value: unknown) {
		const g = grantSchema.parse(safe(value, session.tokens));
		checkedResult(g.result, claimed.work);
		const expected = hash({
			recoveryKey: claimed.recoveryKey,
			reviewFingerprint: claimed.reviewFingerprint,
			transferKey: claimed.work.transferKey,
			intentId: claimed.targetIntentId,
			storageId: claimed.storageId,
			creatorId: claimed.targetCreatorId,
			beneficiaryId: g.beneficiaryId,
			reason: claimed.reason,
		});
		if (
			g.recoveryKey !== claimed.recoveryKey ||
			g.reviewFingerprint !== claimed.reviewFingerprint ||
			g.intentId !== claimed.targetIntentId ||
			g.storageId !== claimed.storageId ||
			g.creatorId !== claimed.targetCreatorId ||
			g.fingerprint !== expected ||
			g.result.intentId !== claimed.targetIntentId ||
			(g.result.storageId && g.result.storageId !== claimed.storageId)
		)
			throw new Error("MEDIA_RECOVERY_EVIDENCE_CHANGED");
		return g;
	}
	try {
		let raw = await transport.status(
			claimed.work.target,
			session.target.token,
			{ ...session.targetArgs, recoveryKey: claimed.recoveryKey },
		);
		if (raw === null)
			raw = await transport.grant(claimed.work.target, session.target.token, {
				...session.targetArgs,
				recoveryKey: claimed.recoveryKey,
				reviewFingerprint: claimed.reviewFingerprint,
				intentId: claimed.targetIntentId,
				storageId: claimed.storageId,
				reason: claimed.reason,
			});
		let grant = checked(raw);
		if (grant.result.status !== "verified")
			grant = checked(
				await transport.complete(claimed.work.target, session.target.token, {
					...session.targetArgs,
					grantId: grant.grantId,
				}),
			);
		if (
			grant.result.status !== "verified" ||
			grant.result.storageId !== claimed.storageId
		)
			throw new Error("MEDIA_RECOVERY_EVIDENCE_CHANGED");
		return await ctx.runMutation(mr("finish"), {
			...confirmation,
			leaseId,
			targetGrantId: grant.grantId,
			targetGrantFingerprint: grant.fingerprint,
			targetBeneficiaryId: grant.beneficiaryId,
		});
	} catch {
		try {
			await ctx.runMutation(mr("release"), { ...confirmation, leaseId });
		} catch {
			/* A revoked actor cannot release another actor's lease or bypass the persistent dispatch fence. */
		}
		return ctx.runQuery(qr("get"), confirmation);
	}
}
export const prepare = action({
	args: { ...mediaConfirmationArgs, reason: v.string() },
	returns: recoverySummaryValidator,
	handler: (ctx, args) => runPrepareRecovery(ctx, args),
});
export const confirm = action({
	args: {
		recoveryId: v.id("overseer_contentPromotionMediaRecoveries"),
		expectedFingerprint: v.string(),
		confirmExistingBytes: v.literal(true),
	},
	returns: recoverySummaryValidator,
	handler: (ctx, args) => runConfirmRecovery(ctx, args),
});
