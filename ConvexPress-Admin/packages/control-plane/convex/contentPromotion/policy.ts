import type { Id } from "../_generated/dataModel";
import { z } from "zod";
import { promotionChangeKindSchema } from '@convexpress/site-contract/content-promotion';
import {
	canonicalJson,
	sha256Hex,
	CURRENT_SITE_CONTRACT_VERSION,
	normalizeDeploymentOrigin,
} from "@convexpress/site-contract";
import {
	contentPromotionManifestSchema,
	promotionVerifiedMediaSchema,
	promotionIdentitySchema,
	type PromotionIdentity,
	promotionDataSchemas,
	type PromotionKind,
} from "@convexpress/site-contract/content-promotion";

export const REVIEW_TTL_MS = 10 * 60_000;
export const hash = (value: unknown) => sha256Hex(canonicalJson(value));
export const selectionSchema = z
	.object({
		pageIds: z.array(z.string()).max(100),
		postIds: z.array(z.string()).max(100),
		menuIds: z.array(z.string()).max(100),
		mediaIds: z.array(z.string()).max(100),
		eventIds: z.array(z.string()).max(100),
		productIds: z.array(z.string()).max(100).optional(),
		productCategoryIds: z.array(z.string()).max(100).optional(),
		productTagIds: z.array(z.string()).max(100).optional(),
		courseIds: z.array(z.string()).max(100).optional(),
		planIds: z.array(z.string()).max(100).optional(),
		includePresentation: z.boolean(),
    includeRoutePolicies: z.boolean().optional(),
	})
	.strict();
export const bindingsSchema = z
	.object({
		mediaBindings: z
			.array(
				z
					.object({
						key: z.string().min(1).max(500),
						storageId: z.string().min(1).max(200),
					})
					.strict(),
			)
			.max(100),
		dependencyBindings: z
			.array(
				z
					.object({
						key: z.string().min(1).max(500),
						targetId: z.string().min(1).max(200),
					})
					.strict(),
			)
			.max(200),
	})
	.strict();
export const requestSchema = z
	.object({
		requestKey: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
		selection: selectionSchema,
		...bindingsSchema.shape,
	})
	.strict()
	.superRefine((request, ctx) => {
		for (const field of ["mediaBindings", "dependencyBindings"] as const)
			if (
				new Set(request[field].map((b) => b.key)).size !== request[field].length
			)
				ctx.addIssue({
					code: "custom",
					path: [field],
					message: "Duplicate binding keys are not allowed",
				});
	});
export const issueSchema = z
	.object({
		code: z.string().min(1).max(100),
		key: z.string().max(500),
		path: z.string().max(500),
		message: z.string().max(2000),
	})
	.strict();
export const siteReviewSchema = z
	.object({
		verifiedMedia: z.array(promotionVerifiedMediaSchema).max(100).optional(),
		ready: z.boolean(),
		digest: z.string().regex(/^[0-9a-f]{64}$/),
		receiptId: z.string().max(200).nullable(),
		issues: z.array(issueSchema).max(400),
		changes: z
			.array(
				z
					.object({
						key: z.string().max(500),
						kind: promotionChangeKindSchema,
						targetId: z.string().nullable(),
						beforeRevision: z.string().max(100),
						fields: z.array(z.string().max(100)).max(100),
					})
					.strict(),
			)
			.max(100),
	})
	.strict();
export type ReviewResult = z.infer<typeof siteReviewSchema>;
export type BrokerRequest = z.infer<typeof requestSchema>;
export interface BrokerTarget {
	connectionId: Id<"overseer_connections">;
	instanceId: Id<"overseer_websiteInstances">;
	websiteId: Id<"overseer_websites">;
	identity: PromotionIdentity;
	authorityHash: string;
}
export function assertPromotionIdentity(target: {
	deploymentOrigin: string;
	managementOrigin: string;
	siteOrigin: string;
	siteContractVersion?: string;
	schemaVersion?: string;
	compatibility: string;
	provisioning: string;
}): void {
	// These origins come from an authorized, enrolled controller connection.
	// Cloud and self-hosted Convex use the same identity and transport checks.
	for (const origin of [target.deploymentOrigin, target.managementOrigin, target.siteOrigin]) {
		if (normalizeDeploymentOrigin(origin) !== origin) throw new Error("Site origin is invalid");
	}
	if (new URL(target.deploymentOrigin).hostname.endsWith(".convex.cloud") &&
		(target.deploymentOrigin !== `https://${new URL(target.deploymentOrigin).hostname}` ||
		target.managementOrigin !== target.deploymentOrigin.replace(".convex.cloud", ".convex.site")))
		throw new Error("Convex Cloud management origin does not match its deployment");
	if (
		target.siteContractVersion !== CURRENT_SITE_CONTRACT_VERSION ||
		!target.schemaVersion ||
		target.compatibility !== "compatible" ||
		target.provisioning !== "ready"
	)
		throw new Error("Compatible provisioned site versions are required");
}
export function assertPair(source: BrokerTarget, target: BrokerTarget): void {
	if (
		source.websiteId !== target.websiteId ||
		source.identity.websiteKey !== target.identity.websiteKey ||
		source.instanceId === target.instanceId ||
		source.identity.instanceKey === target.identity.instanceKey ||
		source.identity.deploymentOrigin === target.identity.deploymentOrigin ||
		source.identity.environmentKind !== "staging" ||
		target.identity.environmentKind !== "live" ||
		source.identity.schemaVersion !== target.identity.schemaVersion
	)
		throw new Error(
			"Promotion requires distinct compatible staging and live instances of the same website",
		);
}
export function validateExport(
	value: unknown,
	source: BrokerTarget,
	target: BrokerTarget,
) {
	const result = z
		.object({
			manifest: contentPromotionManifestSchema,
			downloadUrls: z
				.array(z.object({ key: z.string(), url: z.string() }))
				.max(100),
		})
		.strict()
		.parse(value);
	if (
		hash(promotionIdentitySchema.parse(result.manifest.source)) !==
			hash(source.identity) ||
		hash(promotionIdentitySchema.parse(result.manifest.target)) !==
			hash(target.identity)
	)
		throw new Error(
			"Site export identity differs from the reviewed environments",
		);
	if (
		new TextEncoder().encode(JSON.stringify(result.manifest)).length > 500_000
	)
		throw new Error("Authored manifest exceeds the bounded review size");
	const selectedKinds = {
		pageIds: "page",
		postIds: "post",
		menuIds: "menu",
		mediaIds: "media",
		eventIds: "event",
		productIds: "product",
		productCategoryIds: "productCategory",
		productTagIds: "productTag",
		courseIds: "course",
		planIds: "plan",
	} as const;
	const keys = new Map(
		result.manifest.records.map((record) => [record.key, record.kind]),
	);
	for (const [field, kind] of Object.entries(selectedKinds))
		for (const id of result.manifest.selection[
			field as keyof typeof selectedKinds
		] ?? [])
			if (keys.get(`${kind}:${id}`) !== kind)
				throw new Error("Source export omitted selected content");
	return result.manifest;
}

export const SAFE_FAILURE_CODES = new Set([
	"SITE_REVIEW_FAILED",
  "ROUTE_POLICY_SELECTION_REQUIRED",
	"CATALOG_ADAPTER_REQUIRED",
	"LEARNING_ADAPTER_REQUIRED",
	"PLAN_BINDING_ADAPTER_REQUIRED",
	"PLAN_BENEFIT_ADAPTER_REQUIRED",
	"PROMOTION_DEPENDENCY_MISSING",
	"PROMOTION_LIMIT",
	"PROMOTION_SCAN_LIMIT",
	"PROMOTION_EXPORT_BLOCKED",
	"FORBIDDEN",
	"PLUGIN_DISABLED",
]);
export function safeFailureCode(error: unknown): string {
	if (error && typeof error === "object" && "data" in error) {
		const data = error.data;
		if (
			data &&
			typeof data === "object" &&
			"code" in data &&
			typeof data.code === "string" &&
			SAFE_FAILURE_CODES.has(data.code)
		)
			return data.code;
	}
	return "SITE_REVIEW_FAILED";
}

/** Server-authored confirmation identity. Private site receipt material is bound, never disclosed. */
export function reviewFingerprint(receipt: {
	_id: string;
	requestHash: string;
	authorityHash: string;
	manifestHash?: string;
	sourceRevisionHash?: string;
	siteReceiptId?: string;
	siteDigest?: string;
	expiresAt: number;
}) {
	return hash({
		receiptId: receipt._id,
		requestHash: receipt.requestHash,
		authorityHash: receipt.authorityHash,
		manifestHash: receipt.manifestHash ?? null,
		sourceRevisionHash: receipt.sourceRevisionHash ?? null,
		siteReceiptId: receipt.siteReceiptId ?? null,
		siteDigest: receipt.siteDigest ?? null,
		expiresAt: receipt.expiresAt,
	});
}
