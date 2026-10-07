import {isLocaleKind,assertLocalizationState,writeLocalization} from "./localization";
import {syncEventSearch} from "../search/events";
import { assertCategoryNotDeleting, validateCategoryParent } from "../kb/helpers/categoryHierarchy";
import {validatePromotedEvent} from "./eventRsvp";
import { reconcileCurriculumWrite } from "../media/attachmentGuard";
import { syncCourseCatalog } from "../lms/courseCatalog";
import { makeFunctionReference } from "convex/server";
import { allocateCanonicalPromotionTarget, type CanonicalPromotionAllocation } from './canonicalAllocation';
import { syncedClosureFromManifest } from './syncedClosure';
import { applySyncedTargets, restoreSyncedTargets, type SyncedTargetBackup } from './syncedTarget';
import type { CanonicalTree } from '../canonicalDocuments/foundation/generated/types';
import type { MutationCtx } from "../_generated/server";
// A nested mutation keeps the full writer graph out of export/review's isolate.
// Convex retains the parent transaction: a later refusal rolls every write back.
async function writePromotedCanonicalDocument(ctx:MutationCtx,targetId:Id<"posts">|null,fields:Record<string,unknown>,restoring=false,allocation?:CanonicalPromotionAllocation):Promise<Id<"posts">> {
  return ctx.runMutation(makeFunctionReference<"mutation",{targetId:Id<"posts">|null;fieldsJson:string;clearFields:string[];restoring:boolean;allocation?:CanonicalPromotionAllocation},Id<"posts">>("canonicalDocuments/promotion:write"),{
    targetId,fieldsJson:JSON.stringify(fields),clearFields:Object.keys(fields).filter(key=>fields[key]===undefined),restoring,...(allocation?{allocation}:{}),
  });
}
import {importCanonicalPromotionTree} from "../canonicalDocuments/foundation/promotionTree";
import { recordCatalogWrite } from "../commerce/catalogRevision";
import {reconcileProductSaleWrite} from "../commerce/productSaleIndex";
import { syncProductDiscovery } from "../commerce/productDiscovery";
import { recordRevision } from "./shared";
import { adjustTermCount } from "../helpers/termCounts";
import {eventIntervalBucket} from "../canonicalDocuments/foundation/eventIntervalIndex";
import { syncPostDiscovery, refreshTermDiscovery } from "../helpers/postDiscovery";
import { reconcileOwnerReferences } from "../media/reverseIndex";
import { assertAuthoringWrite } from "../helpers/authoringVersionFence";
import { catalogFields, isCatalogKind, updateCatalogCounts } from "./commerce";
import { assertMediaAttachments, reconcilePostAuthorCounts } from "../media/attachmentGuard";
import { recordSyncedConsumerWrite } from "../syncedBlocks/consumerWrites";
import { promotionAuthorization } from "./authorization";
import { v } from "convex/values";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type {
	ContentPromotionManifest,
	PromotionIdentity,
	PromotionKind,
  PromotionRecord,
	PromotionIssue,
	PromotionVerifiedMedia,
} from "@convexpress/site-contract/content-promotion";
import {
	promotionDataSchemas,
	promotionPresentationSchemas,
	PROMOTION_URL_PREFIX,
} from "@convexpress/site-contract/content-promotion";
import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
	validateBlocksAgainstCatalog,
	type StoredBlock,
} from "../blocks/helpers";
import { exportAuthoredManifest } from "./exporter";
import {
	planPromotion,
	orderedRecords,
	type Bindings,
	type Plan,
} from "./planner";
import {
	validateManifest,
	hash,
	fail,
	identity,
	read,
	write,
	walk,
	referencedKey,
	plain,
	TABLES,
	type Row,
} from "./shared";

const identityArgs = v.object({
	websiteKey: v.string(),
	instanceKey: v.string(),
	deploymentOrigin: v.string(),
	siteOrigin: v.string(),
	environmentKind: v.union(
		v.literal("live"),
		v.literal("staging"),
		v.literal("beta"),
		v.literal("preview"),
		v.literal("development"),
		v.literal("local"),
		v.literal("custom"),
	),
	schemaVersion: v.string(),
});
const selectionArgs = v.object({
	pageIds: v.array(v.string()),
	postIds: v.array(v.string()),
	menuIds: v.array(v.string()),
	mediaIds: v.array(v.string()),
	eventIds: v.array(v.string()),
	productIds: v.optional(v.array(v.string())),
	courseIds: v.optional(v.array(v.string())),
	planIds: v.optional(v.array(v.string())),
	productCategoryIds: v.optional(v.array(v.string())),
	productTagIds: v.optional(v.array(v.string())),
	productBrandIds: v.optional(v.array(v.string())),
	includePresentation: v.boolean(),
  includeAppearance: v.optional(v.boolean()),
  includeRoutePolicies: v.optional(v.boolean()),
  includeLocalization: v.optional(v.boolean()),
  localeGroupKeys: v.optional(v.array(v.string())),
});
const bindingArgs = {
	mediaBindings: v.array(v.object({ key: v.string(), storageId: v.string() })),
	dependencyBindings: v.array(
		v.object({ key: v.string(), targetId: v.string() }),
	),
};
const issueResult = v.object({
	code: v.string(),
	key: v.string(),
	path: v.string(),
	message: v.string(),
});
const canonicalTransportResult=v.object({
 contract:v.literal("canonical-promotion-tree-v1"),blocks:v.array(v.any()),
 references:v.array(v.object({blockId:v.string(),path:v.array(v.union(v.string(),v.number())),kind:v.string(),storage:v.union(v.literal("id"),v.literal("slug")),key:v.string()})),
});
// Return the reviewed envelope as a real wire contract. Authored record data
// remains heterogeneous and is validated by the strict shared Zod schema.
const manifestResult = v.object({
	version: v.literal(1),
	source: identityArgs,
	target: identityArgs,
	selection: selectionArgs,
  synced:v.optional(v.object({
    contract:v.literal("synced-promotion-closure-v1"),
    scope:v.object({websiteKey:v.string(),instanceKey:v.string(),deploymentOrigin:v.string()}),
    sources:v.array(v.object({key:v.string(),generation:v.number(),publishedRevision:v.number(),isLocked:v.optional(v.boolean()),revisions:v.array(v.object({revision:v.number(),title:v.string(),tree:canonicalTransportResult}))})),
  })),
	records: v.array(
		v.object({
			key: v.string(),
			kind: v.union(
				v.literal("course"),
				v.literal("courseNode"),
				v.literal("coursePrerequisite"),
				v.literal("plan"),
				v.literal("planBenefit"),
				v.literal("product"),
				v.literal("productCategory"),
				v.literal("productTag"),
				v.literal("productBrand"),
				v.literal("productVariant"),
				v.literal("page"),
				v.literal("post"),
				v.literal("media"),
				v.literal("menu"),
				v.literal("menuItem"),
				v.literal("menuLocation"),
				v.literal("term"),
				v.literal("termRelationship"),
				v.literal("restriction"),
				v.literal("event"),
        v.literal("eventCategory"),
        v.literal("kbCategory"),
				v.literal("presentation"),
				v.literal("postMeta"),
        v.literal("localeRouting"), v.literal("localeGroup"),
			),
			sourceRevision: v.string(),
			data: v.record(v.string(), v.any()),
		}),
	),
	dependencies: v.array(
		v.object({
			key: v.string(),
			kind: v.union(
				v.literal("course"),
				v.literal("courseNode"),
				v.literal("coursePrerequisite"),
				v.literal("plan"),
				v.literal("planBenefit"),
				v.literal("product"),
				v.literal("course"),
				v.literal("plan"),
				v.literal("form"),
        v.literal("mailingList"),
				v.literal("role"),
				v.literal("plugin"),
				v.literal("catalog"),
			),
			sourceId: v.optional(v.string()),
			slug: v.optional(v.string()),
			requiredBy: v.array(v.string()),
		}),
	),
	issues: v.array(issueResult),
});
const mappingResult = v.object({
	key: v.string(),
	kind: v.string(),
	targetId: v.string(),
});
type Applied = {
	receiptId: string;
	digest: string;
	status: "applied";
	mappings: Array<{ key: string; kind: string; targetId: string }>;
};
type Review = {
	ready: boolean;
	digest: string;
	receiptId: string | null;
	issues: PromotionIssue[];
	changes: Plan["changes"];
	verifiedMedia: PromotionVerifiedMedia[];
};

export const exportManifest: RegisteredQuery<
	"public",
	{
		target: PromotionIdentity;
		selection: ContentPromotionManifest["selection"];
	},
	{
		manifest: ContentPromotionManifest;
		downloadUrls: Array<{ key: string; url: string }>;
	}
> = query({
	args: { target: identityArgs, selection: selectionArgs },
	returns: v.object({
		manifest: manifestResult,
		downloadUrls: v.array(v.object({ key: v.string(), url: v.string() })),
	}),
	handler: exportAuthoredManifest,
});
export const createMediaUploadUrl: RegisteredMutation<"public", {}, string> =
	mutation({
		args: {},
		returns: v.string(),
		handler: async (ctx) => {
			await requireCan(ctx, "manage_options");
			await requireCan(ctx, "media.upload");
			const site = await identity(ctx);
			if (site.environmentKind !== "live")
				fail(
					"PROMOTION_TARGET_MISMATCH",
					"Promotion uploads belong to the reviewed live target.",
				);
			return ctx.storage.generateUploadUrl();
		},
	});
export const dryRun: RegisteredMutation<
	"public",
	{ manifest: unknown } & Bindings,
	Review
> = mutation({
	args: { manifest: v.any(), ...bindingArgs },
	returns: v.object({
		ready: v.boolean(),
		digest: v.string(),
		receiptId: v.union(v.string(), v.null()),
		issues: v.array(issueResult),
		verifiedMedia: v.array(
			v.object({
				key: v.string(),
				storageId: v.string(),
				sha256: v.string(),
				fileSize: v.number(),
				resolution: v.union(v.literal("binding"), v.literal("existing-target")),
				targetId: v.union(v.string(), v.null()),
			}),
		),
		changes: v.array(
			v.object({
				key: v.string(),
				kind: v.string(),
				targetId: v.union(v.string(), v.null()),
				beforeRevision: v.string(),
				fields: v.array(v.string()),
			}),
		),
	}),
	handler: async (ctx, args) => {
		const operator = await requireCan(ctx, "manage_options");
		const manifest = validateManifest(args.manifest);
		const bindings = {
			mediaBindings: args.mediaBindings,
			dependencyBindings: args.dependencyBindings,
		};
		const { plan, issues } = await planPromotion(ctx, manifest, bindings);
		const digest = hash({ manifest, bindings, plan });
		const verifiedMedia: PromotionVerifiedMedia[] = plan.media.map((blob) => ({
			key: blob.key,
			storageId: blob.storageId,
			sha256: blob.sha256,
			fileSize: blob.size,
			resolution: bindings.mediaBindings.some(
				(binding) => binding.key === blob.key,
			)
				? "binding"
				: "existing-target",
			targetId:
				plan.changes.find((change) => change.key === blob.key)?.targetId ??
				null,
		}));
		if (issues.length)
			return {
				ready: false,
				digest,
				receiptId: null,
				issues,
				changes: plan.changes,
				verifiedMedia,
			};
		const receiptId = await ctx.db.insert("contentPromotion_receipts", {
			digest,
			manifestJson: JSON.stringify(manifest),
			planJson: JSON.stringify({ plan, bindings }),
			operatorId: operator._id,
			targetInstanceKey: manifest.target.instanceKey,
			status: "ready",
			createdAt: Date.now(),
			expiresAt: Date.now() + 15 * 60_000,
		});
		return {
			ready: true,
			digest,
			receiptId,
			issues: [],
			changes: plan.changes,
			verifiedMedia,
		};
	},
});
export const apply: RegisteredMutation<
	"public",
	{ receiptId: string; expectedDigest: string; confirmLive: boolean },
	Applied
> = mutation({
	args: {
		receiptId: v.string(),
		expectedDigest: v.string(),
		confirmLive: v.boolean(),
	},
	returns: v.object({
		receiptId: v.string(),
		digest: v.string(),
		status: v.literal("applied"),
		mappings: v.array(mappingResult),
	}),
	handler: async (ctx, args) => {
		const operator = await requireCan(ctx, "manage_options");
		const id = ctx.db.normalizeId("contentPromotion_receipts", args.receiptId);
		const receipt = id ? await ctx.db.get(id) : null;
		if (
			!receipt ||
			receipt.operatorId !== operator._id ||
			receipt.digest !== args.expectedDigest
		)
			fail(
				"PROMOTION_RECEIPT_INVALID",
				"Review this selection using the current target operator before applying.",
			);
		const manifest = validateManifest(JSON.parse(receipt.manifestJson));
		const currentIdentity = await identity(ctx);
		if (hash(currentIdentity) !== hash(manifest.target))
			fail(
				"PROMOTION_TARGET_MISMATCH",
				"Target identity changed after review.",
			);
		if (!args.confirmLive)
			fail(
				"LIVE_CONFIRMATION_REQUIRED",
				"Confirm this reviewed authored-content change on the live website.",
			);
		if (receipt.status === "applied") {
			if (!receipt.resultJson)
				fail("PROMOTION_RECEIPT_INVALID", "Applied receipt is incomplete.");
			return JSON.parse(receipt.resultJson) as Applied;
		}
		if (receipt.status !== "ready" || receipt.expiresAt <= Date.now())
			fail("PROMOTION_REVIEW_EXPIRED", "Review expired. Run a fresh dry run.");
		const saved = JSON.parse(receipt.planJson) as {
			plan: Plan;
			bindings: Bindings;
		};
		const refreshed = await planPromotion(ctx, manifest, saved.bindings);
		if (refreshed.issues.length || hash(refreshed.plan) !== hash(saved.plan))
			fail(
				"PROMOTION_CONFLICT",
				"Target content or dependencies changed after review. Nothing was applied; run a fresh dry run.",
			);
		const ids = new Map(
			saved.plan.dependencies.map((dep) => [dep.key, dep.targetId]),
		);
		const urls = new Map<string, string>();
		const mappings: Applied["mappings"] = [];
		const now = Date.now();
		const beforeRecords = new Map<string, Row | null>();
		for (const change of saved.plan.changes.filter(change => change.kind !== 'syncedBlock'))
			beforeRecords.set(
				change.key,
				change.targetId ? await read(ctx, change.kind as PromotionKind, change.targetId) : null,
			);
		const backupIds: Id<'contentPromotion_backups'>[] = [];
    const reserved = new Map<string, Id<'posts'>>(), importedDocuments = new Map<string, CanonicalTree>();
    const canonical = (record: PromotionRecord) => ['page','post'].includes(record.kind) && record.data.blocksVersion === 2;
    const ordered = orderedRecords(manifest);
    if (manifest.synced) for (const record of ordered.filter(canonical)) {
      const current = beforeRecords.get(record.key);
      if (current) ids.set(record.key, current._id);
    }
		const applyRecord = async (record: PromotionRecord) => {
			const planned = saved.plan.changes.find(
				(change) => change.key === record.key,
			)!;
			const before = beforeRecords.get(record.key) ?? null;
			const resolve = (value: string) => {
				const key = referencedKey(value);
				if (!key) return value;
				const mapped = value.startsWith(PROMOTION_URL_PREFIX)
					? urls.get(key)
					: ids.get(key);
				if (!mapped)
					fail(
						"PROMOTION_DEPENDENCY_MISSING",
						`Missing target dependency ${key}.`,
					);
				return mapped;
			};
			let data:Record<string,unknown>;
      if(record.data.blocksVersion===2){
        const {canonical,...rest}=record.data;
        data=walk(rest,resolve) as Record<string,unknown>;
        data.blocks=importedDocuments.get(record.key) ?? await importCanonicalPromotionTree(canonical,async binding=>{
          const key=referencedKey(binding.key);const id=key ? ids.get(key) : undefined;
          const dependency=manifest.records.find(item=>item.key===key);
          if(!id || !dependency)fail("PROMOTION_DEPENDENCY_MISSING","Canonical target dependency is unavailable.");
          const target=await read(ctx,dependency.kind,id);
          if(!target)fail("PROMOTION_DEPENDENCY_MISSING","Canonical target record no longer exists.");
          if(binding.storage==="id")return target._id;
          if(typeof target.slug!=="string" || !target.slug)fail("PROMOTION_DEPENDENCY_MISSING","Canonical target slug is unavailable.");
          return target.slug;
        });
      }else data = walk(record.data, resolve) as Record<string, unknown>;
			if (typeof data.content === "string" && data.content)
				data.content = JSON.stringify(walk(JSON.parse(data.content), resolve));
			const fields: Record<string, unknown> = {};
			for (const key of Object.keys(promotionDataSchemas[record.kind].shape)) {
        // Older manifests predate these fields. Only explicit source values replace target assignments.
        if (record.kind === "product" && (key === "tagIds" || key === "isFeatured" || key === "brandId") && !(key in data)) continue;
        fields[key] = record.kind === "product" && key === "brandId" && data[key] === null ? undefined : data[key];
      }
			if (record.kind === "presentation") {
				const oldValues = plain(before?.values) ? before.values : {};
				const remaining = { ...oldValues };
				for (const key of Object.keys(
					promotionPresentationSchemas[
						data.section as keyof typeof promotionPresentationSchemas
					].shape,
				))
					delete remaining[key];
				fields.values =
					data.section === "appearance.template"
						? data.values
						: { ...remaining, ...(data.values as Record<string, unknown>) };
				fields.updatedAt = now;
				fields.updatedBy = operator._id;
				if (data.section === "appearance.template")
					fields.legacyAppearanceMigration = { version: 2, migratedAt: now };
			} else if(isLocaleKind(record.kind)){
        fields.updatedBy=operator._id;
      } else if (
				record.kind === "postMeta" ||
				record.kind === "termRelationship" ||
				record.kind === "coursePrerequisite"
			) {
				// Junction/metadata tables deliberately contain no author or timestamp fields.
			} else {
				fields.updatedAt = now;
				if (!before) fields.createdAt = now;
			}
			if (record.kind === "page" || record.kind === "post") {
        delete fields.canonical;
				fields.type = record.kind;
				fields.authorId = data.blocksVersion===2 ? before?.authorId ?? operator._id : operator._id;
				fields.blocksRevision = Number(before?.blocksRevision ?? 0) + 1;
				fields.blocksVersion = data.blocksVersion===2 ? 2 : 1;
				if(data.blocksVersion===2){fields.blocks=data.blocks;fields.content="";}
        else if (Array.isArray(data.blocks))
					fields.blocks = validateBlocksAgainstCatalog(
						data.blocks as StoredBlock[],
					);
			}
			if (record.kind === "coursePrerequisite" && !before)
				fields.createdAt = now;
			if (record.kind === "course") {
				fields.authorId = before?.authorId ?? operator._id;
				fields.topicCount = manifest.records.filter(
					(r) =>
						r.kind === "courseNode" &&
						referencedKey(String(r.data.courseId)) === record.key &&
						r.data.kind === "topic",
				).length;
				fields.lessonCount = manifest.records.filter(
					(r) =>
						r.kind === "courseNode" &&
						referencedKey(String(r.data.courseId)) === record.key &&
						r.data.kind === "lesson",
				).length;
				if (data.status === "published" && !before?.publishedAt)
					fields.publishedAt = now;
			}
			if (isCatalogKind(record.kind)) {
				Object.assign(
					fields,
					await catalogFields(
						ctx,
						record,
						data,
						before,
						manifest.target.instanceKey + ":" + record.key,
					),
				);
				delete fields.options;
				if (record.kind === "product") {
					fields.authorId = before?.authorId ?? operator._id;
					if (data.status === "publish" && !before?.publishedAt)
						fields.publishedAt = now;
				}
			}
			if (record.kind === "media") {
				delete fields.sha256;
				const blob = saved.plan.media.find((item) => item.key === record.key)!;
				const storageId = ctx.db.system.normalizeId("_storage", blob.storageId);
				if (!storageId)
					fail(
						"PROMOTION_MEDIA_INVALID",
						"Target storage reference is invalid.",
					);
				const url = await ctx.storage.getUrl(storageId);
				if (!url)
					fail(
						"PROMOTION_MEDIA_MISSING",
						"Reviewed target blob no longer exists.",
					);
				fields.storageId = storageId;
				fields.url = url;
				fields.status = "active";
				fields.uploadedBy = operator._id;
				urls.set(record.key, url);
			}
			if (record.kind === "menu") {
				fields.createdBy = operator._id;
				fields.itemCount = manifest.records.filter(
					(item) =>
						item.kind === "menuItem" &&
						referencedKey(String(item.data.menuId)) === record.key,
				).length;
			}
			if (record.kind === "term") {
				if (!before) {
					fields.count = 0;
					fields.isDefault = false;
				}
				fields.createdBy = operator._id;
			}
      if (record.kind === "kbCategory" && !before) fields.articleCount = 0;
			if (record.kind === "event") {
        fields.createdBy = operator._id;
        // Pre-RSVP manifests cannot express an instruction to disable existing registrations.
        if(data.rsvp===undefined)delete fields.rsvp;
      }
			const targetId = (record.kind==="page" || record.kind==="post")
        ? await writePromotedCanonicalDocument(ctx,reserved.get(record.key) ?? (planned.targetId ? ctx.db.normalizeId("posts",planned.targetId) : null),fields,false,reserved.has(record.key)?{receiptId:receipt._id,key:record.key}:undefined)
        : await write(ctx, record.kind, planned.targetId, fields);
			ids.set(record.key, targetId);
			mappings.push({ key: record.key, kind: record.kind, targetId });
			const previousMapping = await ctx.db
				.query("contentPromotion_mappings")
				.withIndex("by_source_key", (q) =>
					q
						.eq("sourceInstanceKey", manifest.source.instanceKey)
						.eq("sourceKey", record.key),
				)
				.unique();
			if (previousMapping)
				await ctx.db.patch("contentPromotion_mappings", previousMapping._id, { targetId, updatedAt: now });
			else
				await ctx.db.insert("contentPromotion_mappings", {
					sourceInstanceKey: manifest.source.instanceKey,
					sourceKey: record.key,
					kind: record.kind,
					targetId,
					updatedAt: now,
				});
			if (
				(record.kind === "page" || record.kind === "post") &&
        data.blocksVersion !== 2 &&
				before &&
				(before.status === "publish") !== (data.status === "publish")
			) {
				const relations = await ctx.db
					.query("termRelationships")
					.withIndex("by_post", (q) =>
						q.eq("postId", ctx.db.normalizeId("posts", targetId)!),
					)
					.take(101);
				for (const relation of relations) {
					const term = await ctx.db.get(relation.termId);
					if (term)
						await ctx.db.patch("terms", term._id, {
							count: Math.max(
								0,
								term.count + (data.status === "publish" ? 1 : -1),
							),
						});
				}
			}
			if (record.kind === "termRelationship" && !before) {
				const post = await ctx.db.get(
					ctx.db.normalizeId("posts", String(data.postId))!,
				);
				const term = await ctx.db.get(
					ctx.db.normalizeId("terms", String(data.termId))!,
				);
				if (post?.status === "publish" && term)
					await ctx.db.patch("terms", term._id, { count: term.count + 1 });
			}
      if (reserved.has(record.key)) {
        const allocationBackup = (await ctx.db.query('contentPromotion_backups').withIndex('by_receipt',q=>q.eq('receiptId',receipt._id)).take(101)).find(b=>b.key===record.key);
        if (!allocationBackup || allocationBackup.kind !== record.kind) fail('PROMOTION_ALLOCATION_INVALID','The reserved document was not finalized.');
        backupIds.push(allocationBackup._id);
      } else backupIds.push(
				await ctx.db.insert("contentPromotion_backups", {
					receiptId: receipt._id,
					key: record.key,
					kind: record.kind,
					targetId,
					beforeJson: before ? JSON.stringify(before) : null,
					afterRevision: "",
				}),
			);
		};
    const closure = syncedClosureFromManifest(manifest);
    if (closure) {
      if (!saved.plan.synced) fail('PROMOTION_RECEIPT_INVALID','Review reusable content with the current engine.');
      const imported = await applySyncedTargets(ctx, closure, saved.plan.synced, async binding => {
        const key = referencedKey(binding.key), id = key ? ids.get(key) : undefined;
        const record = manifest.records.find(r=>r.key===key);
        if (!id || !record) fail('PROMOTION_DEPENDENCY_MISSING','The reusable target dependency is unavailable.');
        const target = await read(ctx,record.kind,id);
        if (!target) fail('PROMOTION_DEPENDENCY_MISSING','The reusable target dependency no longer exists.');
        if (binding.storage === 'id') return target._id;
        if (typeof target.slug !== 'string' || !target.slug) fail('PROMOTION_DEPENDENCY_MISSING','The reusable target slug is unavailable.');
        return target.slug;
      }, undefined, async () => {
        for (const record of ordered.filter(canonical)) if (!ids.has(record.key)) {
          const id = await allocateCanonicalPromotionTarget(ctx,{receiptId:receipt._id,key:record.key});
          reserved.set(record.key,id); ids.set(record.key,id);
        }
        for (const record of ordered.filter(r=>!canonical(r))) await applyRecord(record);
      });
      for (const document of imported.documents) importedDocuments.set(document.key,document.blocks);
      for (const backup of imported.backups) {
        const key = referencedKey(backup.key)!;
        mappings.push({key,kind:'syncedBlock',targetId:backup.targetId});
        await ctx.db.insert('contentPromotion_backups',{receiptId:receipt._id,key,kind:'syncedBlock',targetId:backup.targetId,beforeJson:backup.before?JSON.stringify(backup.before):null,afterRevision:backup.afterRevision});
      }
      for (const record of ordered.filter(canonical)) await applyRecord(record);
    } else for (const record of ordered) await applyRecord(record);
    if(manifest.records.some(r=>isLocaleKind(r.kind)))await assertLocalizationState(ctx);
		await updateCatalogCounts(
			ctx,
			mappings
				.filter((item) => item.kind === "product")
				.map((item) => ({
					before: beforeRecords.get(item.key) ?? null,
					targetId: item.targetId,
				})),
		);
		for (const backupId of backupIds) {
			const backup = await ctx.db.get(backupId);
			if (backup)
				await ctx.db.patch("contentPromotion_backups", backupId, {
					afterRevision: recordRevision(backup.kind as PromotionKind,
						await read(
							ctx,
							backup.kind as keyof typeof TABLES,
							backup.targetId,
						),
					),
				});
		}
		const result: Applied = {
			receiptId: receipt._id,
			digest: receipt.digest,
			status: "applied",
			mappings,
		};
		await ctx.db.patch("contentPromotion_receipts", receipt._id, {
			status: "applied",
			appliedAt: now,
			resultJson: JSON.stringify(result),
		});
		return result;
	},
});
/** Automatic rollback is limited to updates with unchanged post-apply fingerprints.
 * Created records can acquire new external references, so deletion needs its own review. */
export const rollback: RegisteredMutation<
	"public",
	{ receiptId: string; expectedDigest: string; confirmLive: boolean },
	{ receiptId: string; status: "rolled-back" }
> = mutation({
	args: {
		receiptId: v.string(),
		expectedDigest: v.string(),
		confirmLive: v.boolean(),
	},
	returns: v.object({
		receiptId: v.string(),
		status: v.literal("rolled-back"),
	}),
	handler: async (
		ctx,
		args,
	): Promise<{ receiptId: string; status: "rolled-back" }> => {
		const operator = await requireCan(ctx, "manage_options");
		const id = ctx.db.normalizeId("contentPromotion_receipts", args.receiptId);
		const receipt = id ? await ctx.db.get(id) : null;
		if (
			!receipt ||
			receipt.operatorId !== operator._id ||
			receipt.digest !== args.expectedDigest
		)
			fail(
				"PROMOTION_RECEIPT_INVALID",
				"Use the operator who reviewed this promotion.",
			);
		const manifest = validateManifest(JSON.parse(receipt.manifestJson));
		if (hash(await identity(ctx)) !== hash(manifest.target))
			fail("PROMOTION_TARGET_MISMATCH", "The target identity changed.");
		if (!args.confirmLive)
			fail(
				"LIVE_CONFIRMATION_REQUIRED",
				"Confirm restoring these reviewed authored fields on the live website.",
			);
		if (receipt.status === "rolled-back")
			return { receiptId: receipt._id, status: "rolled-back" };
		if (receipt.status !== "applied")
			fail("PROMOTION_NOT_APPLIED", "This receipt has not been applied.");
		const authorization = await promotionAuthorization(ctx);
		const backups = await ctx.db
			.query("contentPromotion_backups")
			.withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
			.take(101);
		if (backups.length !== manifest.records.length + (manifest.synced?.sources.length ?? 0) || new Set(backups.map(b=>b.key)).size !== backups.length)
			fail(
				"PROMOTION_BACKUP_INCOMPLETE",
				"This promotion backup is incomplete. No records were restored.",
			);
		if (backups.some((backup) => backup.beforeJson === null))
			fail(
				"PROMOTION_ROLLBACK_CREATIONS_REQUIRE_REVIEW",
				"This promotion created records. Review their current references before removing them; automatic rollback never deletes newly referenced content or media.",
			);
    const sourceBackups: SyncedTargetBackup[] = backups.filter(b=>b.kind==='syncedBlock').map(b=>{
      if (!manifest.synced?.sources.some(s=>referencedKey(s.key)===b.key)) fail('PROMOTION_BACKUP_INCOMPLETE','Unexpected reusable source backup.');
      const id = ctx.db.normalizeId('syncedBlocks',b.targetId);
      if (!id) fail('PROMOTION_BACKUP_INCOMPLETE','Invalid reusable source backup target.');
      return {key:`@promotion:${b.key}`,targetId:id,before:JSON.parse(b.beforeJson!) as import('../_generated/dataModel').Doc<'syncedBlocks'>,afterRevision:b.afterRevision};
    });
    const recordBackups = backups.filter(b=>b.kind!=='syncedBlock');
		for (const backup of recordBackups) {
			const record = manifest.records.find(
				(record) => record.key === backup.key,
			);
      if (!record || record.kind!==backup.kind) fail('PROMOTION_BACKUP_INCOMPLETE','Unexpected authored record backup.');
			await authorization.write(record, JSON.parse(backup.beforeJson!) as Row);
			await assertMediaAttachments(ctx, TABLES[backup.kind as keyof typeof TABLES], JSON.parse(backup.beforeJson!) as Row);
			const kind = backup.kind as keyof typeof TABLES;
			if (recordRevision(kind, await read(ctx, kind, backup.targetId)) !== backup.afterRevision)
				fail(
					"PROMOTION_ROLLBACK_CONFLICT",
					"Content changed after this promotion. No records were restored.",
				);
		}
		// Restore reusable publications and the prior template before consumers.
    if (sourceBackups.length) await restoreSyncedTargets(ctx,sourceBackups);
    const restorationOrder = [...recordBackups].sort((a,b)=>Number(JSON.parse(b.beforeJson!).section === "appearance.template")-Number(JSON.parse(a.beforeJson!).section === "appearance.template"));
    for (const backup of restorationOrder) {
			const before = JSON.parse(backup.beforeJson!) as Row;
			const { _id, _creationTime, ...fields } = before;
			const table = TABLES[backup.kind as keyof typeof TABLES];
			const targetId = ctx.db.normalizeId(table, backup.targetId);
			if (!targetId)
				fail("PROMOTION_MAPPING_INVALID", "Invalid backup target.");
			const previous = await read(ctx, backup.kind as PromotionKind, backup.targetId);
      if(isLocaleKind(backup.kind)){await writeLocalization(ctx,backup.kind,backup.targetId,{...fields,updatedBy:operator._id});continue;}
      if (table === "kb_categories") {
        if (previous) assertCategoryNotDeleting(previous);
        await validateCategoryParent(ctx, fields.parentId as Id<"kb_categories"> | undefined, targetId as Id<"kb_categories">);
      }
      if(table === "extension_events") {
        await validatePromotedEvent(ctx,backup.targetId,fields,true);
        if(typeof fields.startsAt!=="number"||typeof fields.endsAt!=="number")fail("PROMOTION_EVENT_INVALID","Event backup times are invalid.");
        fields.calendarBucket=eventIntervalBucket(fields.startsAt,fields.endsAt);
      }
      if(table==="posts" && fields.blocksVersion===2){
        await writePromotedCanonicalDocument(ctx,targetId as Id<"posts">,fields,true);
        continue;
      }
			assertAuthoringWrite({ table, operation: "replace", id: targetId, previous, value: fields });
			await ctx.db.replace(
				table,
				targetId,
				fields as import("convex/server").WithoutSystemFields<
					import("../_generated/dataModel").Doc<typeof table>
				>,
			);
			await reconcileOwnerReferences(ctx, table, targetId, fields);
      if(table==="extension_events")await syncEventSearch(ctx,targetId as Id<"extension_events">);
      await reconcileCurriculumWrite(ctx, table, targetId, previous, fields);
      await recordCatalogWrite(ctx, table, "replace", fields);
      await reconcileProductSaleWrite(ctx,table,targetId,previous,fields);
      if (table === "lms_courses") {
        await syncCourseCatalog(ctx, targetId as Id<"lms_courses">, fields);
        await ctx.db.patch("lms_courses", targetId as Id<"lms_courses">, {catalogIndexVersion:1});
      }
      if (table === "commerce_products") {
        await syncProductDiscovery(ctx, targetId as Id<"commerce_products">, fields);
        await ctx.db.patch("commerce_products", targetId as Id<"commerce_products">, {collectionIndexVersion:1});
      }
			await reconcilePostAuthorCounts(ctx, table, previous, fields);
      if (table === "posts") await recordSyncedConsumerWrite(ctx, targetId as Id<"posts">, fields);
      if (table === "posts") await syncPostDiscovery(ctx, targetId as Id<"posts">, fields as import("../_generated/dataModel").Doc<"posts">, undefined, previous);
      if (table === "termRelationships") await refreshTermDiscovery(ctx, targetId as Id<"termRelationships">, undefined, previous as import("../_generated/dataModel").Doc<"termRelationships"> | null);
      if (table === "terms") await adjustTermCount(ctx, targetId as Id<"terms">, null);
		}
		if(manifest.records.some(r=>isLocaleKind(r.kind)))await assertLocalizationState(ctx);
    await ctx.db.patch("contentPromotion_receipts", receipt._id, { status: "rolled-back" });
		return { receiptId: receipt._id, status: "rolled-back" };
	},
});
/** Fence an expired review in the same transaction as apply's receipt read.
 * A concurrent apply either commits first and is reported, or conflicts with
 * retirement and must reread the retired state. A read-only ready status cannot
 * provide that guarantee. This never edits authored content or extends a lease. */
type RetiredReviewResult = {
 receiptId: string; digest: string; status: "retired" | "applied" | "rolled-back";
 targetInstanceKey: string; expiresAt: number;
};
export const retireExpiredReview: RegisteredMutation<"public", { receiptId: string; expectedDigest: string }, RetiredReviewResult> = mutation({
 args: { receiptId: v.string(), expectedDigest: v.string() },
 returns: v.object({
  receiptId: v.string(), digest: v.string(),
  status: v.union(v.literal("retired"), v.literal("applied"), v.literal("rolled-back")),
  targetInstanceKey: v.string(), expiresAt: v.number(),
 }),
 handler: async (ctx, args): Promise<RetiredReviewResult> => {
  const operator = await requireCan(ctx, "manage_options");
  const id = ctx.db.normalizeId("contentPromotion_receipts", args.receiptId);
  const receipt = id ? await ctx.db.get(id) : null;
  if (!receipt || receipt.operatorId !== operator._id || receipt.digest !== args.expectedDigest)
   fail("PROMOTION_RECEIPT_INVALID", "Recover this review using its current target operator.");
  const current = await identity(ctx);
  const manifest = validateManifest(JSON.parse(receipt.manifestJson));
  if (receipt.targetInstanceKey !== current.instanceKey || hash(current) !== hash(manifest.target))
   fail("PROMOTION_TARGET_MISMATCH", "Target identity changed after review.");
  if (receipt.status === "ready") {
   if (receipt.expiresAt > Date.now()) fail("PROMOTION_REVIEW_ACTIVE", "This review has not expired.");
   await ctx.db.patch("contentPromotion_receipts", receipt._id, { status: "retired" });
  }
  return { receiptId: receipt._id, digest: receipt.digest,
   status: receipt.status === "ready" ? "retired" as const : receipt.status,
   targetInstanceKey: receipt.targetInstanceKey, expiresAt: receipt.expiresAt };
 },
});

export const receiptStatus: RegisteredQuery<
	"public",
	{ receiptId: string },
	{
		receiptId: string;
		digest: string;
		status: "ready" | "applied" | "rolled-back" | "retired";
		targetInstanceKey: string;
		expiresAt: number;
	} | null
> = query({
	args: { receiptId: v.string() },
	returns: v.union(
		v.null(),
		v.object({
			receiptId: v.string(),
			digest: v.string(),
			status: v.union(
				v.literal("ready"),
				v.literal("applied"),
				v.literal("rolled-back"),
				v.literal("retired"),
			),
			targetInstanceKey: v.string(),
			expiresAt: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const operator = await requireCan(ctx, "manage_options");
		const id = ctx.db.normalizeId("contentPromotion_receipts", args.receiptId);
		const receipt = id ? await ctx.db.get(id) : null;
		if (!receipt || receipt.operatorId !== operator._id) return null;
		const current = await identity(ctx);
		if (receipt.targetInstanceKey !== current.instanceKey) return null;
		return {
			receiptId: receipt._id,
			digest: receipt.digest,
			status: receipt.status,
			targetInstanceKey: receipt.targetInstanceKey,
			expiresAt: receipt.expiresAt,
		};
	},
});
