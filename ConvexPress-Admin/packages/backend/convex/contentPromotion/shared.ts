import {isLocaleKind,readLocaleGroup,validateLocalizationManifest,writeLocalization} from "./localization";
import {syncEventSearch} from "../search/events";
import {syncedClosureFromManifest} from "./syncedClosure";
import { assertCategoryNotDeleting, validateCategoryParent } from "../kb/helpers/categoryHierarchy";
import {validatePromotedEvent} from "./eventRsvp";
import { reconcileCurriculumWrite } from "../media/attachmentGuard";
import { syncCourseCatalog } from "../lms/courseCatalog";
import {parseCanonicalPromotionTree} from "../canonicalDocuments/foundation/promotionTree";
import {validateCanonicalTree} from "../canonicalDocuments/foundation/generated/instances";
import { recordCatalogWrite } from "../commerce/catalogRevision";
import {reconcileProductSaleWrite} from "../commerce/productSaleIndex";
import { syncProductDiscovery } from "../commerce/productDiscovery";
import { adjustTermCount } from "../helpers/termCounts";
import {eventIntervalBucket} from "../canonicalDocuments/foundation/eventIntervalIndex";
import { syncPostDiscovery, refreshTermDiscovery } from "../helpers/postDiscovery";
import { assertLegacyAuthoring } from "../helpers/authoringVersionFence";
import { reconcileOwnerReferences } from "../media/reverseIndex";
import { reconcilePostAuthorCounts } from "../media/attachmentGuard";
import { recordSyncedConsumerWrite } from "../syncedBlocks/consumerWrites";
import { assertAuthoringWrite } from "../helpers/authoringVersionFence";
import { validateLearningManifest } from "./learning";
import { assertMediaAttachments } from "../media/attachmentGuard";
import { validateCatalogManifest } from "./commerce";
import type { WithoutSystemFields } from "convex/server";
import { canonicalJson, sha256Hex } from "@convexpress/site-contract";
import {
	contentPromotionManifestSchema,
	promotionDataSchemas,
	PROMOTION_REFERENCE_PREFIX,
	PROMOTION_URL_PREFIX,
	MAX_PROMOTION_BYTES,
	type ContentPromotionManifest,
	type PromotionIdentity,
	type PromotionKind,
	type PromotionRecord,
} from "@convexpress/site-contract/content-promotion";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import {
	validateBlocks,
	validateBlocksAgainstCatalog,
	type StoredBlock,
} from "../blocks/helpers";
import { validateSectionValues } from "../settings/validation";

export const TABLES = {
  localeRouting:"locale_routing",localeGroup:"locale_translation_groups",
  course: "lms_courses", courseNode: "lms_nodes", coursePrerequisite: "lms_course_prerequisites", plan: "membership_plans", planBenefit: "membership_plan_benefits",
  product: "commerce_products",
  productCategory: "commerce_product_categories",
  productTag: "commerce_product_tags",
  productBrand: "commerce_product_brands",
  productVariant: "commerce_product_variants",
	page: "posts",
	post: "posts",
	media: "media",
	menu: "menus",
	menuItem: "menuItems",
	menuLocation: "menuLocations",
	term: "terms",
	termRelationship: "termRelationships",
	restriction: "membership_restriction_rules",
	event: "extension_events",
  eventCategory:"extension_event_categories",
  kbCategory:"kb_categories",
	presentation: "settings",
	postMeta: "postMeta",
} as const;
export type PromotionTable = (typeof TABLES)[PromotionKind];
export type Row = { _id: string; [key: string]: unknown };
export type ReadCtx = Pick<QueryCtx, "db" | "storage">;
export const plain = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);
export const hash = (value: unknown) => sha256Hex(canonicalJson(value));
/** Editorial conflict detection ignores target-local taxonomy count recovery. */
export function recordRevision(kind: PromotionKind, row: Row | null): string {
  if (kind !== "term" || row === null) return hash(row);
  const { count: _count, countReady: _ready, countState: _state, ...authored } = row;
  return hash(authored);
}

export function fail(code: string, message: string): never {
	throw new ConvexError({ code, message });
}
export const ref = (key: string) => PROMOTION_REFERENCE_PREFIX + key;
export function referencedKey(value: string): string | null {
	return value.startsWith(PROMOTION_REFERENCE_PREFIX)
		? value.slice(PROMOTION_REFERENCE_PREFIX.length)
		: value.startsWith(PROMOTION_URL_PREFIX)
			? value.slice(PROMOTION_URL_PREFIX.length)
			: null;
}
export function walk(
	value: unknown,
	visit: (value: string, path: string[]) => unknown,
	path: string[] = [],
): unknown {
	if (typeof value === "string") return visit(value, path);
	if (Array.isArray(value))
		return value.map((item, i) => walk(item, visit, [...path, String(i)]));
	if (plain(value))
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				walk(item, visit, [...path, key]),
			]),
		);
	return value;
}
export function pickData(
	kind: PromotionKind,
	row: Record<string, unknown>,
): Record<string, unknown> {
  if (kind === "page" || kind === "post") { if(row.blocksVersion===2) validateCanonicalTree(row.blocks); else assertLegacyAuthoring(row); }
	return Object.fromEntries(
		Object.keys(promotionDataSchemas[kind].shape)
			.filter((key) => row[key] !== undefined)
			.map((key) => [key, row[key]]),
	);
}
export async function identity(
	ctx: Pick<QueryCtx, "db">,
): Promise<PromotionIdentity> {
	const row = await ctx.db
		.query("convexpress_siteIdentity")
		.withIndex("by_identity_key", (q) => q.eq("identityKey", "site-identity"))
		.unique();
	if (!row)
		fail(
			"PROMOTION_IDENTITY_REQUIRED",
			"This environment has no verified site identity.",
		);
	return {
		websiteKey: row.websiteKey,
		instanceKey: row.instanceKey,
		deploymentOrigin: row.deploymentOrigin,
		siteOrigin: row.siteOrigin,
		environmentKind: row.environmentKind,
		schemaVersion: row.schemaVersion,
	};
}
export async function read(
	ctx: Pick<QueryCtx, "db">,
	kind: PromotionKind,
	id: string,
): Promise<Row | null> {
	const table = TABLES[kind];
	const normalized = ctx.db.normalizeId(table, id);
	if (!normalized) return null;
	const row=(await ctx.db.get(table, normalized)) as Row | null;
  return kind==="localeGroup"&&row?readLocaleGroup(ctx,row):row;
}
export function validateManifest(raw: unknown): ContentPromotionManifest {
	if (
		new TextEncoder().encode(JSON.stringify(raw)).byteLength >
		MAX_PROMOTION_BYTES
	)
		fail(
			"PROMOTION_LIMIT",
			"Selection exceeds the 500KB atomic promotion limit. Split the authored selection; do not use a database snapshot.",
		);
	const parsed = contentPromotionManifestSchema.safeParse(raw);
	if (!parsed.success)
		fail(
			"INVALID_PROMOTION",
			parsed.error.issues
				.map((i) => `${i.path.join(".")}: ${i.message}`)
				.slice(0, 5)
				.join("; "),
		);
	const manifest = parsed.data;
  const syncedClosure=syncedClosureFromManifest(manifest);
  validateCatalogManifest(manifest);
  validateLearningManifest(manifest);
  validateLocalizationManifest(manifest);
	const identities = new Set<string>();
	// Legacy membership rules address blocks globally. Canonical identities are
	// document-local and must never satisfy that legacy policy namespace.
	const blockIds = new Set<string>();
	for (const record of manifest.records) {
    if (record.kind === "restriction" && record.data.resourceType === "route") {
      if (!manifest.selection.includeRoutePolicies) fail("ROUTE_POLICY_SELECTION_REQUIRED", "Include site access rules explicitly before promoting route policies.");
      const pattern = String(record.data.resourceIdOrKey);
      if (!pattern.startsWith("/") || pattern.startsWith("//") || /[?#\\\u0000-\u001f]/.test(pattern))
        fail("PROMOTION_ROUTE_PATTERN", "Route policies must use local path patterns without query strings or fragments.");
    }
		const natural =
			record.kind === "presentation" ? record.data.section : record.data.slug;
		if (natural) {
			const signature = JSON.stringify([
				record.kind,
				natural,
				record.data.taxonomy ?? null,
			]);
			if (identities.has(signature))
				fail(
					"PROMOTION_DUPLICATE_IDENTITY",
					"Two authored records use the same target identity. Resolve the duplicate before promotion.",
				);
			identities.add(signature);
		}
		if (record.kind === "page" || record.kind === "post") {
			if (!/^[a-z0-9][a-z0-9_-]*$/.test(String(record.data.slug)))
				fail(
					"PROMOTION_SLUG_INVALID",
					`${record.key}: use a canonical single-segment slug.`,
				);
			const visit = (blocks: unknown[]) => {
				for (const block of blocks) {
					if (!plain(block)) continue;
					if ("children" in block)
						fail(
							"PROMOTION_BLOCK_CONTRACT_UNSUPPORTED",
							"The unified children tree needs the generated reference-metadata promotion adapter before it can be promoted.",
						);
					const id = String(block.id);
					if (blockIds.has(id))
						fail(
							"PROMOTION_BLOCK_ID_COLLISION",
							"The selection contains repeated block IDs. Give copied blocks distinct identities before promotion.",
						);
					blockIds.add(id);
					if (Array.isArray(block.innerBlocks)) visit(block.innerBlocks);
				}
			};
      if(record.data.blocksVersion===2){
        // This validates uniqueness within the document, including descendants.
        // Separate pages created from one template may reuse its local IDs.
        parseCanonicalPromotionTree(record.data.canonical);
      }else if (Array.isArray(record.data.blocks)) visit(record.data.blocks);
		}
	}
	if (
		manifest.source.websiteKey !== manifest.target.websiteKey ||
		manifest.source.instanceKey === manifest.target.instanceKey ||
		manifest.source.environmentKind !== "staging" ||
		manifest.target.environmentKind !== "live"
	)
		fail(
			"PROMOTION_TARGET_MISMATCH",
			"Content promotion requires staging and a different live instance of the same website.",
		);
	const keys = new Set<string>();
	for (const record of manifest.records) {
		if (keys.has(record.key))
			fail("INVALID_PROMOTION", `Duplicate source key ${record.key}`);
		keys.add(record.key);
		validateRecord(record);
	}
	for (const dependency of manifest.dependencies) {
		if (keys.has(dependency.key))
			fail("INVALID_PROMOTION", `Duplicate dependency ${dependency.key}`);
		keys.add(dependency.key);
	}
  for(const source of syncedClosure?.sources??[]){
    const sourceKey=referencedKey(source.key);
    if(!sourceKey||keys.has(sourceKey))fail("INVALID_PROMOTION","Reusable source keys must be unique.");
    keys.add(sourceKey);
  }
	const kinds = new Map<string,string>([
		...manifest.records.map((r) => [r.key, r.kind] as const),
		...manifest.dependencies.map((d) => [d.key, d.kind] as const),
    ...(syncedClosure?.sources??[]).map(s=>[referencedKey(s.key)!,"syncedBlock"] as const),
	]);
  const canonicalTrees=[...manifest.records.filter(record=>record.data.blocksVersion===2).map(record=>parseCanonicalPromotionTree(record.data.canonical)),...(syncedClosure?.sources??[]).flatMap(source=>source.revisions.map(version=>version.tree))];
  for(const tree of canonicalTrees){
    for(const binding of tree.references){
      const key=referencedKey(binding.key);if(!key||!keys.has(key))fail("PROMOTION_DEPENDENCY_MISSING","Canonical dependency is missing.");
      const expected=({category:"term",tag:"term",membershipPlan:"plan"} as Record<string,string>)[binding.kind]??binding.kind;
      if(kinds.get(key)!==expected)fail("PROMOTION_REFERENCE_KIND","Canonical dependency kind does not match its generated field.");
      if(binding.kind==="category" || binding.kind==="tag"){
        const term=manifest.records.find(item=>item.key===key);
        if(!term || term.data.taxonomy!==(binding.kind==="category"?"category":"post_tag"))fail("PROMOTION_REFERENCE_KIND","Canonical taxonomy dependency has the wrong taxonomy.");
      }
    }
  }
	for (const record of manifest.records)
		walkPortable(record.data, (value, path) => {
			const key = referencedKey(value);
			if (key && !keys.has(key))
				fail(
					"PROMOTION_DEPENDENCY_MISSING",
					`${record.key}.${path.join(".")} references missing dependency ${key}`,
				);
			if (key) {
				const field = path[path.length - 1] ?? "",
					parent = path[path.length - 2] ?? "";
				const kind = kinds.get(key);
				const fieldKinds: Record<string, string[]> = {
					featuredImageId: ["media"],
          featuredMediaId: ["media"],
          thumbnailMediaId: ["media"],
          logoMediaId: ["media"],
          brandId: ["productBrand"],
          variantId: ["productVariant"],
					mediaId: ["media"],
					imageId: ["media"],
					logoId: ["media"],
					faviconId: ["media"],
					siteLogo: ["media"],
					postId: ["page", "post"],
					pageId: ["page"],
					homepageId: ["page"],
          landingPageId:["page"],documentId:["page","post"],
					postsPageId: ["page"],
					menuId: ["menu"],
					parentItemId: ["menuItem"],
					termId: ["term"],
					productId: ["product"],
					courseId: ["course"],
          prereqCourseId: ["course"],
          videoMediaId: ["media"], audioMediaId: ["media"], captionsMediaId: ["media"], aiVideoMediaId: ["media"],
					planId: ["plan"],
					formId: ["form"],
					eventId: ["event"],
          ...(record.kind==="event"?{categoryId:["eventCategory"]}:{}),
				};
				let expected: string[] | null = value.startsWith(PROMOTION_URL_PREFIX)
					? ["media"]
					: (fieldKinds[field] ?? null);
				if (field === "parentId")
					expected = [record.kind === "kbCategory" ? "kbCategory" : record.kind === "term" ? "term" : record.kind === "productCategory" ? "productCategory" : record.kind === "courseNode" ? "courseNode" : "page"];
				if (/^(galleryMediaIds)$/.test(parent)) expected = ["media"];
        if (parent === "categoryIds" && record.kind !== "course") expected = ["productCategory"];
        if (parent === "tagIds" && record.kind === "product") expected = ["productTag"];
        if (/^(upsellProductIds|crossSellProductIds)$/.test(parent)) expected = ["product"];
        if (/^(productIds|courseIds|planIds|formIds|eventIds)$/.test(parent))
					expected = [parent.slice(0, -3)];
				if (field === "objectId" && record.kind === "menuItem")
					expected = ["category", "tag"].includes(String(record.data.itemType))
						? ["term"]
						: [String(record.data.itemType)];
				if (field === "resourceIdOrKey" && record.kind === "restriction")
					expected = [String(record.data.resourceType)];
				if (expected && !expected.includes(String(kind)))
					fail(
						"PROMOTION_REFERENCE_KIND",
						`${record.key}.${path.join(".")}: wrong dependency kind.`,
					);
			}
			return value;
		});
	const pages = new Map(
		manifest.records
			.filter((record) => record.kind === "page")
			.map((record) => [record.key, record]),
	);
	const resolving = new Set<string>();
	const resolvedPaths = new Map<string, string>();
	const pagePath = (record: PromotionRecord): string => {
		if (resolvedPaths.has(record.key)) return resolvedPaths.get(record.key)!;
		if (resolving.has(record.key))
			fail("PROMOTION_REFERENCE_CYCLE", "Page parents form a cycle.");
		resolving.add(record.key);
		const parentKey =
			typeof record.data.parentId === "string"
				? referencedKey(record.data.parentId)
				: null;
		const parent = parentKey ? pages.get(parentKey) : null;
		if (parentKey && !parent)
			fail(
				"PROMOTION_PARENT_REQUIRED",
				"A page parent must be included in this authored unit.",
			);
		const expected = `${parent ? pagePath(parent) : ""}/${record.data.slug}`;
		if (record.data.path !== undefined && record.data.path !== expected)
			fail(
				"PROMOTION_PAGE_PATH_MISMATCH",
				`${record.key}: page path does not match its parent and slug.`,
			);
		resolving.delete(record.key);
		resolvedPaths.set(record.key, expected);
		return expected;
	};
	for (const record of manifest.records)
		if (
			record.kind === "restriction" &&
			record.data.resourceType === "block" &&
			!blockIds.has(String(record.data.resourceIdOrKey))
		)
			fail(
				"PROMOTION_BLOCK_POLICY_TARGET",
				"A block policy must target a block included in this authored selection.",
			);
	for (const record of pages.values()) {
		record.data.path = pagePath(record);
		record.data.depth =
			String(record.data.path).split("/").filter(Boolean).length - 1;
		if (Number(record.data.depth) > 4)
			fail("PROMOTION_PAGE_DEPTH", "Page nesting cannot exceed five levels.");
	}
	return manifest;
}
const GENERAL_FIELDS = new Set(["siteTitle", "tagline", "siteLogo", "logoUrl"]);
const READING_FIELDS = new Set([
	"homepageDisplays",
	"homepageId",
	"postsPageId",
	"postsPerPage",
]);
export function validateRecord(record: PromotionRecord) {
	const data = record.data;
	validatePortableReferences(record);
	if (record.kind === "page" || record.kind === "post") {
		if (data.blocksVersion===2) parseCanonicalPromotionTree(data.canonical);
		else if (data.blocks) {
			validateBlocks(data.blocks as StoredBlock[]);
			validateBlocksAgainstCatalog(
				walk(data.blocks, (value) =>
					value.startsWith(PROMOTION_URL_PREFIX)
						? "https://promotion.invalid/media"
						: value,
				) as StoredBlock[],
			);
		}
		if (data.content) {
			try {
				const parsed = JSON.parse(String(data.content));
				if (!plain(parsed) || parsed.type !== "doc")
					fail(
						"PROMOTION_CONTENT_FORMAT",
						"Article content must be a portable TipTap document.",
					);
			} catch {
				fail(
					"PROMOTION_CONTENT_FORMAT",
					`${record.key}: legacy HTML content needs an explicit import adapter.`,
				);
			}
		}
	}
	if (record.kind === "presentation") {
		const values = data.values as Record<string, unknown>;
		const section = String(data.section);
		const allowed =
			section === "general"
				? GENERAL_FIELDS
				: section === "reading"
					? READING_FIELDS
					: null;
		if (allowed && Object.keys(values).some((key) => !allowed.has(key)))
			fail(
				"PROMOTION_SETTING_FORBIDDEN",
				`${section}: only authored presentation fields may be promoted; origins, auth and integrations stay on target.`,
			);
		if (section === "appearance.template") {
			const errors = validateSectionValues(section, values);
			if (errors.length)
				fail("PROMOTION_PRESENTATION_INVALID", errors[0].message);
		}
	}
}
export async function assertTarget(
	ctx: Pick<QueryCtx, "db">,
	manifest: ContentPromotionManifest,
) {
	const current = await identity(ctx);
	if (canonicalJson(current) !== canonicalJson(manifest.target))
		fail(
			"PROMOTION_TARGET_MISMATCH",
			"The reviewed target identity, origin or schema version changed. Export and review again.",
		);
	if (manifest.source.schemaVersion !== current.schemaVersion)
		fail(
			"PROMOTION_SCHEMA_MISMATCH",
			"Source and target schema versions differ. Update the environments before promoting.",
		);
	return current;
}
export async function write(
	ctx: MutationCtx,
	kind: PromotionKind,
	id: string | null,
	data: Record<string, unknown>,
): Promise<string> {
if(isLocaleKind(kind))return writeLocalization(ctx,kind,id,data);
	const table = TABLES[kind];
	const existing = id ? await read(ctx, kind, id) : null;
  if (kind === "kbCategory") {
    if (existing) assertCategoryNotDeleting(existing);
    const candidate = { ...existing, ...data };
    await validateCategoryParent(ctx, candidate.parentId as Id<"kb_categories"> | undefined, id ? ctx.db.normalizeId("kb_categories", id) ?? undefined : undefined);
  }
  if (kind === "event") {
    await validatePromotedEvent(ctx,id,data);
    const event={...existing,...data};
    if(typeof event.startsAt!=="number"||typeof event.endsAt!=="number")fail("PROMOTION_EVENT_INVALID","Event times are invalid.");
    data={...data,calendarBucket:eventIntervalBucket(event.startsAt,event.endsAt)};
  }
	if (kind === "media" && existing && existing.status !== "active" && existing.status !== "processing") fail("PROMOTION_MEDIA_UNAVAILABLE", "The mapped target media is unavailable; restore it explicitly or choose another mapping.");
	assertAuthoringWrite({ table, operation: id ? "patch" : "insert", id: id ?? undefined, previous: existing, value: data });
	await assertMediaAttachments(ctx, table, { ...existing, ...data });
	// The manifest's strict kind schema and the adapter below define this dynamic boundary;
	// Convex also validates the resulting concrete table document transactionally.
	if (id) {
		const normalized = ctx.db.normalizeId(table, id);
		if (!normalized)
			fail("PROMOTION_MAPPING_INVALID", "Invalid target mapping.");
		await ctx.db.patch(table, normalized, data as Partial<Doc<typeof table>>);
    await reconcileCurriculumWrite(ctx, table, normalized, existing, { ...existing, ...data });
    await recordCatalogWrite(ctx, table, "patch", data);
		await reconcileOwnerReferences(ctx, table, normalized, { ...existing, ...data });
    if(table==="extension_events")await syncEventSearch(ctx,normalized as Id<"extension_events">);
    await reconcileProductSaleWrite(ctx,table,normalized,existing,{...existing,...data});
    if (table === "lms_courses") {
      await syncCourseCatalog(ctx, normalized as Id<"lms_courses">, { ...existing, ...data });
      await ctx.db.patch("lms_courses", normalized as Id<"lms_courses">, {catalogIndexVersion:1});
    }
    if (table === "commerce_products") {
      await syncProductDiscovery(ctx, normalized as Id<"commerce_products">, { ...existing, ...data });
      await ctx.db.patch("commerce_products", normalized as Id<"commerce_products">, {collectionIndexVersion:1});
    }
		await reconcilePostAuthorCounts(ctx, table, existing, { ...existing, ...data });
    if (table === "posts") await recordSyncedConsumerWrite(ctx, normalized as Id<"posts">, { ...existing, ...data });
    if (table === "posts") await syncPostDiscovery(ctx, id as Id<"posts">, { ...existing, ...data } as Doc<"posts">, undefined, existing);
    if (table === "termRelationships") await refreshTermDiscovery(ctx, id as Id<"termRelationships">, undefined, existing as Doc<"termRelationships"> | null);
    if (table === "terms") await adjustTermCount(ctx, id as Id<"terms">, null);
		return id;
	}
	const created = await ctx.db.insert(
		table,
		data as WithoutSystemFields<Doc<typeof table>>,
	);
	await reconcileOwnerReferences(ctx, table, created, data);
  if(table==="extension_events")await syncEventSearch(ctx,created as Id<"extension_events">);
  await reconcileCurriculumWrite(ctx, table, created, null, data);
  await recordCatalogWrite(ctx, table, "insert", data);
  await reconcileProductSaleWrite(ctx,table,created,null,data);
  if (table === "lms_courses") {
    await syncCourseCatalog(ctx, created as Id<"lms_courses">, data);
    await ctx.db.patch("lms_courses", created as Id<"lms_courses">, {catalogIndexVersion:1});
  }
  if (table === "commerce_products") {
    await syncProductDiscovery(ctx, created as Id<"commerce_products">, data);
    await ctx.db.patch("commerce_products", created as Id<"commerce_products">, {collectionIndexVersion:1});
  }
	await reconcilePostAuthorCounts(ctx, table, null, data);
  if (table === "posts") await recordSyncedConsumerWrite(ctx, created as Id<"posts">, data);
  if (table === "posts") await syncPostDiscovery(ctx, created as Id<"posts">, data as Doc<"posts">, undefined, null);
  if (table === "termRelationships") await refreshTermDiscovery(ctx, created as Id<"termRelationships">);
  if (table === "terms") await adjustTermCount(ctx, created as Id<"terms">, null);
	return created;
}

/** Serialized editor documents use the same dependency rules as structured block attrs. */
export function walkPortable(
	value: unknown,
	visit: (value: string, path: string[]) => unknown,
): unknown {
  if(plain(value) && value.blocksVersion===2 && value.canonical!==undefined){
    const parsed=parseCanonicalPromotionTree(value.canonical),{canonical:_canonical,...rest}=value;
    return {...walkPortable(rest,visit) as Record<string,unknown>,canonical:{...parsed,references:parsed.references.map((reference,index)=>({...reference,key:visit(reference.key,["canonical","references",String(index),"key"])}))}};
  }
	return walk(value, (item, path) => {
		if (path[path.length - 1] === "content" && item.startsWith("{")) {
			try {
				const parsed = JSON.parse(item);
				if (plain(parsed) && parsed.type === "doc")
					return JSON.stringify(walk(parsed, visit, path));
			} catch {}
		}
		return visit(item, path);
	});
}
function validatePortableReferences(record: PromotionRecord) {
	walkPortable(record.data, (value, path) => {
		const field = path[path.length - 1] ?? "",
			parent = path[path.length - 2] ?? "";
		if (/Id$/.test(field) && field !== "id" && value && !referencedKey(value))
			fail(
				"UNMAPPED_PROMOTION_REFERENCE",
				`${record.key}.${path.join(".")}: raw document references are forbidden.`,
			);
		const identifier =
      (record.kind === "product" && parent === "tagIds") ||
			/^(brandId|logoMediaId|featuredMediaId|thumbnailMediaId|variantId|featuredImageId|mediaId|imageId|logoId|faviconId|siteLogo|postId|pageId|homepageId|postsPageId|menuId|parentItemId|termId|productId|courseId|planId|formId|eventId|categoryId|parentId)$/.test(
				field,
			) || (/^(planIds|productIds|courseIds|formIds|eventIds|galleryMediaIds|categoryIds|upsellProductIds|crossSellProductIds)$/.test(parent) && !(record.kind === "course" && parent === "categoryIds"));
		const objectReference =
			field === "objectId" &&
			record.kind === "menuItem" &&
			["page", "post", "category", "tag"].includes(
				String(record.data.itemType),
			);
		const restrictionReference =
			field === "resourceIdOrKey" &&
			record.kind === "restriction" &&
			["page", "post", "product", "course"].includes(String(record.data.resourceType));
		if (
			value &&
			(identifier || objectReference || restrictionReference) &&
			!referencedKey(value)
		)
			fail(
				"UNMAPPED_PROMOTION_REFERENCE",
				`${record.key}.${path.join(".")}: source document IDs must be replaced with reviewed dependency references.`,
			);
		if (value.includes("/api/storage/"))
			fail(
				"UNMAPPED_PROMOTION_MEDIA",
				`${record.key}.${path.join(".")}: use a verified target media URL reference.`,
			);
		return value;
	});
}
