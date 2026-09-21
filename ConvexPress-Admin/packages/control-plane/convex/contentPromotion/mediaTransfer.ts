"use node";
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
import type * as records from "./mediaTransferRecords";
import {
	mediaConfirmationArgs,
	mediaSummaryValidator,
	type MediaConfirmation,
	type MediaSummary,
	type MediaWork,
} from "./mediaTransferRecords";
import {
	readReviewedMedia,
	sourceStorageUrl,
	targetStorageUploadUrl,
	type MediaDescriptor,
} from "./mediaTransferProtocol";
import { boundedSiteFetch, exchangeBrokerSession, runReview } from "./review";
import {
	hash,
	requestSchema,
	validateExport,
	type BrokerTarget,
	type BrokerRequest,
} from "./policy";
import { promotionMediaSpecSchema } from "@convexpress/site-contract";
import { reviewResultValidator } from "./validators";
type RecordApi = ApiFromModules<{ records: typeof records }>["records"];
const ref = <N extends keyof RecordApi>(name: N) =>
	makeFunctionReference<
		"mutation",
		FunctionArgs<RecordApi[N]>,
		FunctionReturnType<RecordApi[N]>
	>(`contentPromotion/mediaTransferRecords:${name}`);
const claimRef = ref("claim"),
	dispatchRef = ref("dispatch"),
	rememberRef = ref("remember"),
	finishRef = ref("finish"),
	failRef = ref("fail");
const inspectRef = makeFunctionReference<"query", MediaConfirmation, MediaWork>(
	"contentPromotion/mediaTransferRecords:inspect",
);
const getRef = makeFunctionReference<
	"query",
	MediaConfirmation,
	MediaSummary | null
>("contentPromotion/mediaTransferRecords:get");
const exportRef = makeFunctionReference<
	"query",
	{ target: BrokerTarget["identity"]; selection: BrokerRequest["selection"] },
	unknown
>("contentPromotion/operations:exportManifest");
type TargetArgs = {
	source: BrokerTarget["identity"];
	target: BrokerTarget["identity"];
	media: MediaWork["media"];
};
const statusRef = makeFunctionReference<"query", TargetArgs, unknown>(
	"contentPromotion/mediaUploads:status",
);
const beginRef = makeFunctionReference<"mutation", TargetArgs, unknown>(
	"contentPromotion/mediaUploads:begin",
);
const completeRef = makeFunctionReference<
	"mutation",
	TargetArgs & { intentId: string; storageId: string },
	unknown
>("contentPromotion/mediaUploads:complete");
const resultSchema = z
	.object({
		intentId: z.string().min(1).max(200),
		transferKey: z.string().regex(/^[a-f0-9]{64}$/),
		status: z.enum(["issued", "verified"]),
		storageId: z
			.string()
			.regex(/^[A-Za-z0-9_-]{1,200}$/)
			.nullable(),
		sha256: z.string(),
		fileSize: z.number(),
		mimeType: z.string(),
	})
	.strict();
const beginSchema = z
	.object({ result: resultSchema, uploadUrl: z.string().max(4000).nullable() })
	.strict();
export interface MediaTransport {
	status(
		target: BrokerTarget,
		token: string,
		args: TargetArgs,
	): Promise<unknown>;
	begin(
		target: BrokerTarget,
		token: string,
		args: TargetArgs,
	): Promise<unknown>;
	complete(
		target: BrokerTarget,
		token: string,
		args: TargetArgs & { intentId: string; storageId: string },
	): Promise<unknown>;
	export(
		source: BrokerTarget,
		token: string,
		request: BrokerRequest,
		target: BrokerTarget,
	): Promise<unknown>;
	download(
		url: string,
		source: BrokerTarget,
		file: MediaDescriptor,
	): Promise<Uint8Array<ArrayBuffer>>;
	upload(
		url: string,
		target: BrokerTarget,
		bytes: Uint8Array<ArrayBuffer>,
		mimeType: string,
	): Promise<string>;
}
async function client<T>(
	target: BrokerTarget,
	token: string,
	call: (value: ConvexHttpClient) => Promise<T>,
) {
	const value = new ConvexHttpClient(target.identity.deploymentOrigin, {
		auth: token,
		logger: false,
		fetch: boundedSiteFetch(target.identity.deploymentOrigin),
	});
	try {
		return await call(value);
	} finally {
		value.clearAuth();
	}
}
const transport: MediaTransport = {
	status: (target, token, args) =>
		client(target, token, (value) => value.query(statusRef, args)),
	begin: (target, token, args) =>
		client(target, token, (value) => value.mutation(beginRef, args)),
	complete: (target, token, args) =>
		client(target, token, (value) => value.mutation(completeRef, args)),
	export: (source, token, request, target) =>
		client(source, token, (value) =>
			value.query(exportRef, {
				target: target.identity,
				selection: request.selection,
			}),
		),
	download: async (raw, source, file) => {
		const url = sourceStorageUrl(raw, source.identity.deploymentOrigin);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15_000);
		try {
			return await readReviewedMedia(
				await fetch(url, {
					method: "GET",
					redirect: "error",
					credentials: "omit",
					headers: { Accept: file.mimeType, "Accept-Encoding": "identity" },
					signal: controller.signal,
				}),
				file,
			);
		} finally {
			clearTimeout(timeout);
		}
	},
	upload: async (raw, target, bytes, mimeType) => {
		const url = targetStorageUploadUrl(raw, target.identity.deploymentOrigin);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15_000);
		try {
			const response = await fetch(url, {
				method: "POST",
				redirect: "error",
				credentials: "omit",
				headers: { "Content-Type": mimeType },
				body: bytes,
				signal: controller.signal,
			});
			if (!response.ok || response.redirected)
				throw new Error("MEDIA_UPLOAD_UNCERTAIN");
			const reader = response.body?.getReader();
			if (!reader) throw new Error("MEDIA_UPLOAD_UNCERTAIN");
			const buffer = new Uint8Array(4096);
			let offset = 0;
			try {
				while (true) {
					const next = await reader.read();
					if (next.done) break;
					if (next.value.length > buffer.length - offset)
						throw new Error("MEDIA_UPLOAD_UNCERTAIN");
					buffer.set(next.value, offset);
					offset += next.value.length;
				}
				return z
					.object({ storageId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/) })
					.strict()
					.parse(
						JSON.parse(new TextDecoder().decode(buffer.subarray(0, offset))),
					).storageId;
			} catch (error) {
				await reader.cancel().catch(() => {});
				throw error;
			} finally {
				reader.releaseLock();
			}
		} finally {
			clearTimeout(timeout);
		}
	},
};
function checked(value: unknown, work: MediaWork, tokens: string[] = []) {
	const encoded = JSON.stringify(value);
	if (encoded.length > 4096 || tokens.some((token) => encoded.includes(token)))
		throw new Error("MEDIA_TARGET_EVIDENCE_INVALID");
	const result = resultSchema.parse(value);
	const spec = promotionMediaSpecSchema.parse({
		sha256: result.sha256,
		fileSize: result.fileSize,
		mimeType: result.mimeType,
	});
	if (
		result.transferKey !== work.transferKey ||
		hash(spec) !== hash(work.media) ||
		(result.status === "verified" && !result.storageId)
	)
		throw new Error("MEDIA_TARGET_EVIDENCE_INVALID");
	return { ...result, ...spec };
}
/** A dispatched blob identity only permits status or known-ID completion, regardless of review or lease changes. */
export async function runMediaTransfer(
	ctx: ActionCtx,
	args: MediaConfirmation & { confirmStorageWrite: true },
	remote: MediaTransport = transport,
): Promise<MediaSummary> {
	if (args.confirmStorageWrite !== true)
		throw new Error("Confirm the reviewed media storage write.");
	const { confirmStorageWrite: _confirm, ...confirmation } = args;
	const leaseId = crypto.randomUUID();
	const claim = await ctx.runMutation(claimRef, { ...confirmation, leaseId });
	async function read() {
		const result = await ctx.runQuery(getRef, confirmation);
		if (!result) throw new Error("Media transfer receipt unavailable");
		return result;
	}
	if (!claim.work) return read();
	const work = claim.work;
	const checkpoint = { ...confirmation, transferId: claim.transferId, leaseId };
	let rawDispatched = claim.dispatchCount > 0;
	let knownStorageId = claim.storageId;
	const tokens: string[] = [];
	try {
		const targetSession = await exchangeBrokerSession(ctx, work.target);
		tokens.push(targetSession.token);
		if (!targetSession.siteCapabilities.includes("media.upload"))
			throw new Error("MEDIA_ACCESS_DENIED");
		const targetArgs: TargetArgs = {
			source: work.source.identity,
			target: work.target.identity,
			media: work.media,
		};
		const accept = async (value: unknown) => {
			const result = checked(value, work, tokens);
			if (result.status !== "verified" || !result.storageId)
				throw new Error("MEDIA_TARGET_EVIDENCE_INVALID");
			await ctx.runMutation(finishRef, {
				...checkpoint,
				targetIntentId: result.intentId,
				storageId: result.storageId,
				sha256: result.sha256,
				fileSize: result.fileSize,
				mimeType: result.mimeType,
			});
		};
		const rawStatus = await remote.status(
			work.target,
			targetSession.token,
			targetArgs,
		);
		const status = rawStatus === null ? null : checked(rawStatus, work, tokens);
		if (status?.status === "verified") {
			await accept(status);
			return read();
		}
		if (knownStorageId) {
			if (!status || status.intentId !== claim.targetIntentId)
				throw new Error("MEDIA_TARGET_INTENT_MISSING");
			await accept(
				await remote.complete(work.target, targetSession.token, {
					...targetArgs,
					intentId: status.intentId,
					storageId: knownStorageId,
				}),
			);
			return read();
		}
		if (rawDispatched) throw new Error("MEDIA_UPLOAD_UNCERTAIN");
		const sourceSession = await exchangeBrokerSession(ctx, work.source);
		tokens.push(sourceSession.token);
		const request = requestSchema.parse(JSON.parse(work.requestJson));
		const exported = await remote.export(
			work.source,
			sourceSession.token,
			request,
			work.target,
		);
		const manifest = validateExport(exported, work.source, work.target);
		if (tokens.some((token) => JSON.stringify(exported).includes(token)))
			throw new Error("MEDIA_SOURCE_INVALID");
		if (hash(manifest) !== hash(JSON.parse(work.manifestJson)))
			throw new Error("MEDIA_SOURCE_CHANGED");
		const urls = z
			.object({
				downloadUrls: z
					.array(
						z
							.object({ key: z.string().max(500), url: z.string().max(4000) })
							.strict(),
					)
					.max(100),
			})
			.passthrough()
			.parse(exported).downloadUrls;
		const matches = urls.filter((item) => item.key === args.mediaKey);
		if (matches.length !== 1) throw new Error("MEDIA_SOURCE_URL_INVALID");
		const url = sourceStorageUrl(
			matches[0].url,
			work.source.identity.deploymentOrigin,
		);
		const bytes = await remote.download(url, work.source, {
			key: args.mediaKey,
			...work.media,
		});
		await readReviewedMedia(
			new Response(bytes, { headers: { "Content-Type": work.media.mimeType } }),
			{ key: args.mediaKey, ...work.media },
		);
		const freshTargetSession =
			targetSession.expiresAt <= Date.now() + 10_000
				? await exchangeBrokerSession(ctx, work.target)
				: targetSession;
		tokens.push(freshTargetSession.token);
		if (!freshTargetSession.siteCapabilities.includes("media.upload"))
			throw new Error("MEDIA_ACCESS_DENIED");
		const begun = beginSchema.parse(
			await remote.begin(work.target, freshTargetSession.token, targetArgs),
		);
		const intent = checked(begun.result, work, tokens);
		if (intent.status === "verified") {
			await accept(intent);
			return read();
		}
		if (!begun.uploadUrl) throw new Error("MEDIA_TARGET_URL_INVALID");
		targetStorageUploadUrl(
			begun.uploadUrl,
			work.target.identity.deploymentOrigin,
		);
		if (
			tokens.includes(new URL(begun.uploadUrl).searchParams.get("token") ?? "")
		)
			throw new Error("MEDIA_TARGET_URL_INVALID");
		await ctx.runMutation(dispatchRef, {
			...checkpoint,
			targetIntentId: intent.intentId,
			sourceManifestJson: JSON.stringify(manifest),
		});
		rawDispatched = true;
		knownStorageId = await remote.upload(
			begun.uploadUrl,
			work.target,
			bytes,
			work.media.mimeType,
		);
		await ctx.runMutation(rememberRef, {
			...checkpoint,
			storageId: knownStorageId,
		});
		await accept(
			await remote.complete(work.target, freshTargetSession.token, {
				...targetArgs,
				intentId: intent.intentId,
				storageId: knownStorageId,
			}),
		);
	} catch {
		try {
			await ctx.runMutation(failRef, {
				...checkpoint,
				code: rawDispatched
					? knownStorageId
						? "MEDIA_COMPLETION_UNCERTAIN"
						: "MEDIA_UPLOAD_UNCERTAIN"
					: "MEDIA_CHECK_FAILED",
			});
		} catch {
			/* Expired/revoked leases and lost acknowledgements never authorize another upload. */
		}
	}
	return read();
}
export const execute = action({
	args: { ...mediaConfirmationArgs, confirmStorageWrite: v.literal(true) },
	returns: mediaSummaryValidator,
	handler: (ctx, args) => runMediaTransfer(ctx, args),
});
/** Verified bindings are used only in a fresh review, never patched into the original immutable envelope. */
export const reviewTransferred = action({
	args: mediaConfirmationArgs,
	returns: reviewResultValidator,
	handler: async (ctx, args) => {
		const work = await ctx.runQuery(inspectRef, args);
		const request = requestSchema.parse(JSON.parse(work.requestJson));
		const manifest = JSON.parse(work.manifestJson) as {
			records: Array<{ key: string; kind: string }>;
		};
		const mediaBindings: Array<{ key: string; storageId: string }> = [];
		for (const record of manifest.records.filter(
			(record) => record.kind === "media",
		)) {
			const status = await ctx.runQuery(getRef, {
				...args,
				mediaKey: record.key,
			});
			if (status?.phase !== "verified" || !status.storageId)
				throw new Error(
					"Verify every reviewed media file before creating its new review.",
				);
			mediaBindings.push({ key: record.key, storageId: status.storageId });
		}
		const next = {
			...request,
			requestKey: `media-${hash({ receiptId: args.receiptId, fingerprint: args.expectedReviewFingerprint, mediaBindings })}`,
			mediaBindings,
		};
		return runReview(ctx, {
			sourceConnectionId: work.source
				.connectionId as Id<"overseer_connections">,
			targetConnectionId: work.target
				.connectionId as Id<"overseer_connections">,
			requestJson: JSON.stringify(next),
		});
	},
});
