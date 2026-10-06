import {captureSyncedPromotionClosure} from "./syncedClosure";
import {RequestReadLedger} from "../helpers/requestReadLedger";
import type {CanonicalReference} from "../canonicalDocuments/foundation/promotionTree";
import { assertCategoryNotDeleting } from "../kb/helpers/categoryHierarchy";
import {exportCanonicalPromotionTree} from "../canonicalDocuments/foundation/promotionTree";
import { recordRevision } from "./shared";
import { requirePluginEnabled } from "../helpers/plugins";
import { assertPortableLearningSource, learningChildren } from "./learning";
import type { IndexRangeBuilder } from "convex/server";
import type { Doc } from "../_generated/dataModel";
import { promotionAuthorization } from "./authorization";
import type {
	ContentPromotionManifest,
	PromotionRecord,
	PromotionKind,
	PromotionDependency,
	PromotionIssue,
	PromotionIdentity,
} from "@convexpress/site-contract/content-promotion";
import {
	MAX_PROMOTION_RECORDS,
	PROMOTION_URL_PREFIX,
} from "@convexpress/site-contract/content-promotion";
import type { QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { readAppearance } from "../settings/appearanceMigration";
import {
	hash,
	identity,
	read,
	ref,
	pickData,
	plain,
	fail,
	type Row,
	referencedKey,
	validateManifest,
} from "./shared";

export async function exportAuthoredManifest(
	ctx: QueryCtx,
	args: {
		target: PromotionIdentity;
		selection: ContentPromotionManifest["selection"];
	},
) {
	await requireCan(ctx, "manage_options");
	const source = await identity(ctx);
	const authorization = await promotionAuthorization(ctx);
	if (source.environmentKind !== "staging")
		fail(
			"PROMOTION_SOURCE_MISMATCH",
			"Export authored promotion content from staging.",
		);
	if (
		args.target.websiteKey !== source.websiteKey ||
		args.target.instanceKey === source.instanceKey ||
		args.target.environmentKind !== "live" ||
		args.target.schemaVersion !== source.schemaVersion
	)
		fail(
			"PROMOTION_TARGET_MISMATCH",
			"Select a different live instance of the same website and schema version.",
		);
	const records = new Map<string, PromotionRecord>();
	const dependencies = new Map<string, PromotionDependency>();
	const issues: PromotionIssue[] = [];
	let inspectedRows = 0;
  const canonicalReferenceKeys=new Map<string,string>();
  const canonicalDocuments=new Map<string,unknown>();
  function reserveCanonicalRead(){if(++inspectedRows>500)fail("PROMOTION_SCAN_LIMIT","Canonical dependencies exceed the bounded inspection budget. Split the selection.");}
	async function bounded<T>(query: Promise<T[]>): Promise<T[]> {
		const rows = await query;
		inspectedRows += rows.length;
		if (inspectedRows > 500)
			fail(
				"PROMOTION_SCAN_LIMIT",
				"This selection exceeds the bounded dependency inspection budget. Split the selection into smaller authored units.",
			);
		return rows;
	}
	const urls: Array<{ key: string; url: string }> = [];
	const mediaUrls = new Map<string, string>();
	const issue = (code: string, key: string, path: string, message: string) => {
		if (issues.length >= 200)
			fail(
				"PROMOTION_ISSUE_LIMIT",
				"This selection has too many unsupported dependencies. Resolve reported adapters before exporting a larger selection.",
			);
		issues.push({ code, key, path, message });
	};
	function dependency(
		kind: PromotionDependency["kind"],
		value: string,
		owner: string,
		slug?: string,
	) {
		const dependencyPlugin = {
			product: "commerceEnabled",
			course: "lmsEnabled",
			plan: "membershipEnabled",
			form: "formsEnabled",
		};
		if (kind in dependencyPlugin)
			dependency(
				"plugin",
				dependencyPlugin[kind as keyof typeof dependencyPlugin],
				owner,
			);
		const key = `${kind}:${value}`;
		const old = dependencies.get(key);
		if (old) {
			if (!old.requiredBy.includes(owner)) old.requiredBy.push(owner);
		} else {
			if (dependencies.size >= 200)
				fail(
					"PROMOTION_DEPENDENCY_LIMIT",
					"Split the selection into smaller dependency units.",
				);
			dependencies.set(key, {
				key,
				kind,
				sourceId: value,
				...(slug ? { slug } : {}),
				requiredBy: [owner],
			});
		}
		return ref(key);
	}
	async function mediaFromUrl(value: string, owner: string, path: string) {
		if (!mediaUrls.has(value)) {
			const candidates = await bounded(ctx.db.query("media").take(101));
			const found = candidates.find((row) => row.url === value);
			if (found) await add("media", found._id, found as Row);
		}
		const key = mediaUrls.get(value);
		if (!key) {
			issue(
				"UNMAPPED_MEDIA_URL",
				owner,
				path,
				"Select the source media record for this stored image URL; raw source storage URLs cannot be promoted.",
			);
			return value;
		}
		return PROMOTION_URL_PREFIX + key;
	}
	async function transform(
		value: unknown,
		owner: string,
		path: string[] = [],
	): Promise<unknown> {
		if (Array.isArray(value)) {
			const output: unknown[] = [];
			for (const [index, item] of value.entries())
				output.push(await transform(item, owner, [...path, String(index)]));
			return output;
		}
		if (plain(value)) {
			const output: Record<string, unknown> = {};
			for (const [field, item] of Object.entries(value)) {
				if (owner.startsWith("course:") && ["categoryIds", "tagIds"].includes(field)) { output[field] = item; continue; }
        if (typeof item === "string" && item) {
					if (referencedKey(item)) {
						output[field] = item;
						continue;
					}
					const fieldPath = [...path, field].join(".");
					if (
						/^(logoMediaId|videoMediaId|audioMediaId|captionsMediaId|aiVideoMediaId|featuredMediaId|thumbnailMediaId|featuredImageId|mediaId|imageId|logoId|faviconId|siteLogo)$/i.test(
							field,
						)
					) {
						output[field] = ref(await add("media", item));
						continue;
					}
					if (/^(postId|pageId|homepageId|postsPageId)$/i.test(field)) {
						const row = await ctx.db.get(
							ctx.db.normalizeId("posts", item) ??
								fail(
									"PROMOTION_DEPENDENCY_MISSING",
									`Invalid content reference ${owner}.${fieldPath}`,
								),
						);
						if (!row)
							fail("PROMOTION_DEPENDENCY_MISSING", `Missing content ${item}`);
						output[field] = ref(await add(row.type, item, row as Row));
						continue;
					}
          if (field === "brandId" && owner.startsWith("product:")) { output[field] = ref(await add("productBrand", item)); continue; }
					if (field === "menuId") {
						output[field] = ref(await add("menu", item));
						continue;
					}
					if (field === "parentItemId") {
						output[field] = ref(await add("menuItem", item));
						continue;
					}
					if (field === "termId") {
						output[field] = ref(await add("term", item));
						continue;
					}
					if (field === "eventId") {
						output[field] = ref(await add("event", item));
						continue;
					}
					if (field === "productId") { output[field] = ref(await add("product", item)); continue; }
          if (field === "variantId") { output[field] = ref(await add("productVariant", item)); continue; }
          if (field === "courseId" || field === "prereqCourseId") { output[field] = ref(await add("course", item)); continue; }
          if (field === "planId") { output[field] = ref(await add("plan", item)); continue; }
          if (/^(formId)$/.test(field)) {
						output[field] = dependency(
							field.slice(0, -2) as "product" | "course" | "plan" | "form",
							item,
							owner,
						);
						continue;
					}
					if (/Ids$/.test(field)) {
						issue(
							"UNSUPPORTED_REFERENCE",
							owner,
							fieldPath,
							"This reference field needs an explicit dependency adapter.",
						);
					}
					if (/Id$/.test(field) && field !== "id" && field !== "parentId") {
						issue(
							"UNSUPPORTED_REFERENCE",
							owner,
							fieldPath,
							`No promotion adapter is registered for ${field}.`,
						);
					}
					if (
						item.includes("/api/storage/") ||
						(/^(src|logoUrl)$/.test(field) && item.includes(".convex."))
					) {
						output[field] = await mediaFromUrl(item, owner, fieldPath);
						continue;
					}
					if (item === source.siteOrigin) {
						output[field] = "/";
						continue;
					}
					if (item.startsWith(source.siteOrigin + "/")) {
						output[field] = item.slice(source.siteOrigin.length);
						continue;
					}
				}
				if (Array.isArray(item) && ["galleryMediaIds", "categoryIds", "tagIds", "productIds", "upsellProductIds", "crossSellProductIds"].includes(field)) {
          const kind = field === "galleryMediaIds" ? "media" : field === "categoryIds" ? "productCategory" : field === "tagIds" ? "productTag" : "product";
          output[field] = [];
          for (const id of item) (output[field] as string[]).push(referencedKey(String(id)) ? String(id) : ref(await add(kind, String(id))));
          continue;
        }
        if (Array.isArray(item) && field === "eventIds") {
					output[field] = await Promise.all(
						item.map(async (id) => ref(await add("event", String(id)))),
					);
					continue;
				}
				if (Array.isArray(item) && field === "planIds") {
					output[field] = await Promise.all(item.map(async id => ref(await add("plan", String(id)))));
					continue;
				}
				if (Array.isArray(item) && field === "courseIds") { output[field] = await Promise.all(item.map(async id => ref(await add("course",String(id))))); continue; }
        if (
					Array.isArray(item) &&
					/^(productIds|formIds)$/.test(field)
				) {
					output[field] = item.map((id) =>
						dependency(
							field.slice(0, -3) as "product" | "course" | "form",
							String(id),
							owner,
						),
					);
					continue;
				}
				if (Array.isArray(item) && field === "productSlugs" && item.length) {
          for (const slug of item) {
            const product = await ctx.db.query("commerce_products").withIndex("by_slug", q=>q.eq("slug",String(slug))).unique();
            if (!product) fail("PROMOTION_DEPENDENCY_MISSING", `Missing source product slug ${slug}`);
            await add("product", product._id, product);
          }
        }
				if (Array.isArray(item) && field === "roles")
					for (const slug of item)
						dependency("role", String(slug), owner, String(slug));
				if (Array.isArray(item) && field === "membershipPlans") for (const slug of item) { const plan = await ctx.db.query("membership_plans").withIndex("by_slug", q => q.eq("slug",String(slug))).unique(); if (!plan) fail("PROMOTION_DEPENDENCY_MISSING","Missing membership plan slug."); await add("plan",plan._id,plan); }
				if (Array.isArray(item) && /Ids$/.test(field))
					issue(
						"UNSUPPORTED_REFERENCE",
						owner,
						[...path, field].join("."),
						"This reference list needs an explicit promotion adapter.",
					);
				output[field] = await transform(item, owner, [...path, field]);
			}
			return output;
		}
		return value;
	}
  let localeConfig:Doc<'locale_routing'>|null|undefined;
  let localeStarted=false;
  async function includeLocaleConfiguration(){
    if(localeConfig===undefined){reserveCanonicalRead();localeConfig=await ctx.db.query('locale_routing').withIndex('by_key',q=>q.eq('key','site')).unique();}
    if(!args.selection.includeLocalization){if(localeConfig)fail('LOCALIZATION_SELECTION_REQUIRED','Include site languages to review configured destinations and translation mappings.');return;}
    if(localeStarted)return;localeStarted=true;
    await add('localeRouting',localeConfig?._id??'site-absent',localeConfig??{_id:'site-absent',key:'site',enabled:false,locales:[]});
  }
  async function includeDocumentLocalization(id:string){
    await includeLocaleConfiguration();
    if(!args.selection.includeLocalization)return;
    const documentId=ctx.db.normalizeId('posts',id);if(!documentId)fail('PROMOTION_MAPPING_INVALID','Invalid language document.');
    reserveCanonicalRead();const membership=await ctx.db.query('locale_translations').withIndex('by_document',q=>q.eq('documentId',documentId)).unique();
    if(membership)await add('localeGroup',membership.groupId);
  }
	async function add(
		kind: PromotionKind,
		id: string,
		supplied?: Row,
	): Promise<string> {
		const key = `${kind}:${id}`;
		if (records.has(key)) return key;
		if (records.size >= MAX_PROMOTION_RECORDS)
			fail(
				"PROMOTION_LIMIT",
				"Authored dependency graph exceeds 100 records. Split the selection into explicitly reviewed promotion units.",
			);
		await authorization.read(kind);
		const row = supplied ?? (await read(ctx, kind, id));
		if (!row) fail("PROMOTION_DEPENDENCY_MISSING", `Missing source ${key}`);
		await authorization.read(kind, row);
		let data = pickData(kind, row);
    const canonicalSource=(kind==="page" || kind==="post") && row.blocksVersion===2;
    if(canonicalSource){delete data.blocks;delete data.contentMode;canonicalDocuments.set(key,row.blocks);}
		records.set(key, { key, kind, sourceRevision: recordRevision(kind, row), data });
    if(kind==='localeRouting'){
      const locales=[];
      for(const locale of row.locales as Doc<'locale_routing'>['locales'])locales.push({...locale,landingPageId:ref(await add('page',locale.landingPageId))});
      data.locales=locales;return key;
    }
    if(kind==='localeGroup'){
      const translations=[];
      for(const entry of row.translations as Array<{code:string;documentId:string}>){
        reserveCanonicalRead();const post=await read(ctx,'page',entry.documentId);if(!post||(post.type!=='page'&&post.type!=='post'))fail('PROMOTION_LOCALE_DOCUMENT','A source translation document is missing.');
        translations.push({code:entry.code,documentId:ref(await add(post.type,entry.documentId,post))});
      }
      inspectedRows+=translations.length;if(inspectedRows>500)fail('PROMOTION_SCAN_LIMIT','Language dependencies exceed the inspection budget.');
      data.translations=translations;return key;
    }
		if (kind === "page" || kind === "post") {
			await includeDocumentLocalization(row._id);
			if (row.type !== kind)
				fail("PROMOTION_SELECTION_INVALID", `${key} is not a ${kind}.`);
			if (
				row.visibility === "password" ||
				row.status === "future" ||
				row.status === "trash" ||
				row.status === "auto-draft"
			)
				issue(
					"UNSUPPORTED_CONTENT_STATE",
					key,
					"status",
					"Password-protected, scheduled, trashed or auto-draft content requires explicit target authoring; its credentials/queue state are never copied.",
				);
			if (Array.isArray(row.pageSections) && row.pageSections.length)
				issue(
					"LEGACY_SECTIONS_ADAPTER_REQUIRED",
					key,
					"pageSections",
					"Convert legacy page sections to validated blocks before promotion.",
				);
			if (row.layoutId)
				issue(
					"LEGACY_LAYOUT_ADAPTER_REQUIRED",
					key,
					"layoutId",
					"Replace the legacy layout with a template pack before promotion.",
				);
			if (row.parentId)
				data.parentId = ref(await add("page", String(row.parentId)));
			if (typeof row.content === "string" && row.content) {
				let parsed: unknown;
				try {
					parsed = JSON.parse(row.content);
				} catch {
					issue(
						"LEGACY_CONTENT_ADAPTER_REQUIRED",
						key,
						"content",
						"Convert legacy HTML to a portable TipTap document before promotion.",
					);
				}
				if (parsed !== undefined)
					data.content = JSON.stringify(
						await transform(parsed, key, ["content"]),
					);
			}
			const relations = await bounded(
				ctx.db
					.query("termRelationships")
					.withIndex("by_post", (q) => q.eq("postId", row._id as never))
					.take(101),
			);
			for (const relation of relations)
				await add("termRelationship", relation._id, relation as Row);
			const meta = await bounded(
				ctx.db
					.query("postMeta")
					.withIndex("by_post", (q) => q.eq("postId", row._id as never))
					.take(101),
			);
			for (const entry of meta) {
				if (
					[
						"_seo_title",
						"_seo_description",
						"_seo_noindex",
						"_seo_nofollow",
					].includes(entry.key)
				)
					await add("postMeta", entry._id, entry as Row);
				else if (
					!entry.key.startsWith("_wp") &&
					!["_edit_lock", "_edit_last", "_scheduled_fn"].includes(entry.key)
				)
					issue(
						"POST_META_ADAPTER_REQUIRED",
						key,
						entry.key,
						"This custom/SEO metadata field needs an explicit portable adapter.",
					);
			}
			const rules = await bounded(
				ctx.db
					.query("membership_restriction_rules")
					.withIndex("by_resource", (q) =>
						q.eq("resourceType", kind).eq("resourceIdOrKey", id),
					)
					.take(101),
			);
			for (const rule of rules) await add("restriction", rule._id, rule as Row);
			const blocks = Array.isArray(data.blocks)
				? structuredClone(data.blocks)
				: [];
			if (Array.isArray(data.blocks)) data.blocks = blocks;
			async function inspectBlocks(items: unknown[]) {
				for (const item of items) {
					if (!plain(item)) continue;
					const name = String(item.name ?? "");
					if (name.startsWith("commerce/"))
						dependency("plugin", "commerceEnabled", key);
					if (
						[
							"commerce/product-showcase",
							"commerce/category-tiles",
							"core/featured-products",
						].includes(name)
          ) {
            // The whole bounded published catalog is reviewed explicitly; no runtime rows are copied.
            const products = await bounded(ctx.db.query("commerce_products").withIndex("by_status", q=>q.eq("status","publish")).take(101));
            if (products.length > 100) fail("PROMOTION_LIMIT", "Published catalog exceeds this atomic adapter; select a smaller explicit product unit.");
            for (const product of products) await add("product",product._id,product);
            if (name === "commerce/category-tiles") {
              const categories = await bounded(ctx.db.query("commerce_product_categories").take(101));
              if (categories.length > 100) fail("PROMOTION_LIMIT", "Category catalog exceeds this atomic adapter.");
              for (const category of categories) await add("productCategory",category._id,category);
            }
          }

					if (name === "events/upcoming") {
						dependency("plugin", "eventsEnabled", key);
						for (const event of await bounded(
							ctx.db
								.query("extension_events")
								.withIndex("by_status_start", (q) =>
									q.eq("status", "published"),
								)
								.take(101),
						))
							await add("event", event._id, event as Row);
					}
					if (name === "core/latest-posts" || name === "core/tag-cloud")
						dependency("catalog", "posts-and-taxonomy", key);
					if (
						name === "blocks/product-collection" &&
						plain(item.attrs) &&
						item.attrs.mode !== "manual"
					)
						dependency("catalog", "products", key);
					if (name.startsWith("lms/")) dependency("catalog", "courses", key);
					if (name === "core/author-bio" && plain(item.attrs))
						item.attrs = { ...item.attrs, userId: "" };
					if (typeof item.id === "string") {
						const sourceBlockId = item.id;
						item.id =
							"p-" +
							hash(source.instanceKey + ":" + sourceBlockId).slice(0, 24);
						const blockRules = await bounded(
							ctx.db
								.query("membership_restriction_rules")
								.withIndex("by_resource", (q) =>
									q
										.eq("resourceType", "block")
										.eq("resourceIdOrKey", sourceBlockId),
								)
								.take(101),
						);
						for (const rule of blockRules)
							await add("restriction", rule._id, rule as Row);
					}
					if (Array.isArray(item.innerBlocks))
						await inspectBlocks(item.innerBlocks);
				}
			}
			await inspectBlocks(blocks);
		}
		if (kind === "media") {
			if (row.status !== "active" || !row.storageId)
				issue(
					"MEDIA_UPLOAD_REQUIRED",
					key,
					"storageId",
					"Source media must be an active stored file; URL-only or processing media cannot be copied safely.",
				);
			else {
				const storage = await ctx.db.system.get(
					ctx.db.system.normalizeId("_storage", String(row.storageId)) ??
						fail("PROMOTION_MEDIA_INVALID", "Invalid source storage ID"),
				);
				if (!storage)
					fail("PROMOTION_MEDIA_MISSING", `Missing source file for ${key}`);
				data.sha256 = storage.sha256;
				data.fileSize = storage.size;
				const url = await ctx.storage.getUrl(row.storageId as never);
				if (url) urls.push({ key, url });
				mediaUrls.set(String(row.url), key);
			}
		}
		if (kind === "menu") {
			for (const item of await bounded(
				ctx.db
					.query("menuItems")
					.withIndex("by_menu", (q) => q.eq("menuId", row._id as never))
					.take(101),
			))
				await add("menuItem", item._id, item as Row);
			for (const location of await bounded(
				ctx.db
					.query("menuLocations")
					.withIndex("by_menu", (q) => q.eq("menuId", row._id as never))
					.take(101),
			))
				await add("menuLocation", location._id, location as Row);
		}
		if (kind === "menuItem" && row.objectId) {
			if (row.itemType === "post" || row.itemType === "page")
				data.objectId = ref(await add(row.itemType, String(row.objectId)));
			else if (row.itemType === "category" || row.itemType === "tag")
				data.objectId = ref(await add("term", String(row.objectId)));
			else
				issue(
					"MENU_TARGET_ADAPTER_REQUIRED",
					key,
					"objectId",
					"This menu target requires an explicit dependency adapter; raw source IDs are forbidden.",
				);
		}
		if (kind === "term" && row.parentId)
			data.parentId = ref(await add("term", String(row.parentId)));
		if (kind === "restriction" && row.resourceType === "block")
			data.resourceIdOrKey =
				"p-" +
				hash(source.instanceKey + ":" + String(row.resourceIdOrKey)).slice(
					0,
					24,
				);
		if (["course", "courseNode", "coursePrerequisite", "plan", "planBenefit"].includes(kind)) {
      dependency("plugin", kind.startsWith("course") ? "lmsEnabled" : "membershipEnabled", key);
      await requirePluginEnabled(ctx, kind.startsWith("course") ? "lms" : "membership");
      assertPortableLearningSource(kind,row);
      if (kind === "course") {
        data.accessMode = row.accessMode ?? "members";
        for (const child of await learningChildren(ctx,"courseNode",row._id)) await add("courseNode",child._id,child);
        for (const child of await learningChildren(ctx,"coursePrerequisite",row._id)) await add("coursePrerequisite",child._id,child);
      }
      if (kind === "plan") for (const child of await learningChildren(ctx,"planBenefit",row._id)) await add("planBenefit",child._id,child);
      if (kind === "courseNode" && row.parentId) data.parentId = ref(await add("courseNode",String(row.parentId)));
    }
    if (kind === "course" || kind === "product") {
      for (const rule of await bounded(ctx.db.query("membership_restriction_rules").withIndex("by_resource",q=>q.eq("resourceType",kind).eq("resourceIdOrKey",row._id)).take(101))) await add("restriction",rule._id,rule);
    }
    if (kind === "restriction") {
			dependency("plugin", "membershipEnabled", key);
			if (row.resourceType === "page" || row.resourceType === "post" || row.resourceType === "course" || row.resourceType === "product")
				data.resourceIdOrKey = ref(
					await add(row.resourceType as "page" | "post" | "course" | "product", String(row.resourceIdOrKey)),
				);
		}
    if (kind === "productTag" || kind === "productBrand") dependency("plugin", "commerceEnabled", key);

    if (kind === "productCategory") {
      dependency("plugin", "commerceEnabled", key);
      if (row.parentId) data.parentId = ref(await add("productCategory", String(row.parentId)));
    }
    if (kind === "product" || kind === "productVariant") {
      dependency("plugin", "commerceEnabled", key);
      if (row.isVirtual || row.isDownloadable || row.requiresLicense || row.productType === "external" || row.shippingClassId || row.preferredPackageId || row.shippingClassOverrideNone || (Array.isArray(row.productAttributes) ? row.productAttributes.length : row.productAttributes) || row.tags || row.productTags)
        fail("CATALOG_ADAPTER_REQUIRED", `${key}: digital/external delivery, tags, global attributes and target shipping-class/package associations need explicit adapters.`);
      if (kind === "product") {
        data.tagIds = row.tagIds ?? [];
        data.brandId = row.brandId ?? null;
        data.isFeatured = row.isFeatured ?? false;
        const id = ctx.db.normalizeId("commerce_products", row._id)!;
        if (await ctx.db.query("commerce_bundles").withIndex("by_product",q=>q.eq("productId",id)).first()) fail("CATALOG_ADAPTER_REQUIRED", `${key}: bundle structure needs its own adapter.`);
        data.options = (Array.isArray(row.optionTypes) ? row.optionTypes : []).map(option=>{
          if (!plain(option) || typeof option.name !== "string" || !Array.isArray(option.values)) fail("CATALOG_OPTIONS_INVALID", `${key}: malformed source option model.`);
          return { name: option.name, values: option.values.map(value=>{
            if (!plain(value) || typeof value.label !== "string" || value.active === false) fail("CATALOG_OPTIONS_INVALID", `${key}: invalid/inactive option values need explicit review.`);
            return value.label;
          }) };
        });
        const variants = await bounded<Doc<"commerce_product_variants">>(ctx.db.query("commerce_product_variants").withIndex("by_product",(q: IndexRangeBuilder<Doc<"commerce_product_variants">, ["productId", "_creationTime"]>)=>q.eq("productId",id)).take(101));
        if (variants.length > 100) fail("PROMOTION_LIMIT", "Variant collection exceeds this atomic adapter.");
        for (const variant of variants) await add("productVariant",variant._id,variant);
      } else {
        data.productId = ref(await add("product", String(row.productId)));
        data.status = row.status ?? "publish";
        data.options = (Array.isArray(row.selections) ? row.selections : []).map(selection=>{
          if(!plain(selection) || typeof selection.optionTypeName !== "string" || typeof selection.optionValueLabel !== "string") fail("CATALOG_VARIANTS_INVALID", `${key}: malformed variant selections.`);
          return {name:selection.optionTypeName,value:selection.optionValueLabel};
        });
      }
    }
		if (kind === "event" || kind === "eventCategory") dependency("plugin", "eventsEnabled", key);
    if(kind==="event"){
      data.rsvp=row.rsvp??{mode:"closed",capacity:null,closesAt:null};
      if(plain(data.rsvp)&&data.rsvp.mode!=="closed")dependency("plugin","formsEnabled",key);
    }
    if (kind === "kbCategory") {
      assertCategoryNotDeleting(row);
      dependency("plugin", "knowledgeBaseEnabled", key);
      if (typeof row.parentId === "string") data.parentId = ref(await add("kbCategory", row.parentId));
    }
    if(kind === "event" && typeof row.categoryId === "string")data.categoryId=ref(await add("eventCategory",row.categoryId));
    const canonical=canonicalSource ? await exportCanonicalPromotionTree(row.blocks,reference=>resolveCanonicalReference(reference,key)) : null;
		data = (await transform(data, key)) as Record<string, unknown>;
    if(canonical)data.canonical=canonical;
		records.set(key, { key, kind, sourceRevision: recordRevision(kind, row), data });

		return key;
	}
  async function resolveCanonicalReference(reference:CanonicalReference,key:string):Promise<string>{
    if(reference.kind==="syncedBlock"){if(reference.storage!=="id")fail("CANONICAL_REFERENCE_ADAPTER_REQUIRED","Reusable sources require ID storage.");return ref("synced:"+reference.value);}

      const cacheKey=JSON.stringify([reference.kind,reference.storage,reference.value]);
      const cached=canonicalReferenceKeys.get(cacheKey);if(cached)return cached;
      const aliases:Record<string,PromotionKind>={category:"term",tag:"term",membershipPlan:"plan"};
      const targetKind=aliases[reference.kind]??reference.kind;
      const supported:PromotionKind[]=["media","page","post","menu","product","productCategory","productTag","productBrand","term","event","eventCategory","kbCategory","course","plan"];
      if(!supported.includes(targetKind as PromotionKind))fail("CANONICAL_REFERENCE_ADAPTER_REQUIRED",`A reviewed ${reference.kind} adapter is required for ${key}.${reference.blockId}.`);
      let sourceId=reference.value;
      if(reference.storage==="slug"){
        const query=targetKind==="product" ? ctx.db.query("commerce_products").withIndex("by_slug",q=>q.eq("slug",sourceId)) :
          targetKind==="productCategory" ? ctx.db.query("commerce_product_categories").withIndex("by_slug",q=>q.eq("slug",sourceId)) :
          targetKind==="productTag" ? ctx.db.query("commerce_product_tags").withIndex("by_slug",q=>q.eq("slug",sourceId)) :
          targetKind==="term" ? ctx.db.query("terms").withIndex("by_slug_taxonomy",q=>q.eq("slug",sourceId).eq("taxonomy",reference.kind==="category"?"category":"post_tag")) : null;
        if(!query)fail("CANONICAL_REFERENCE_ADAPTER_REQUIRED",`No slug adapter for ${reference.kind}.`);
        reserveCanonicalRead();const record=await query.unique();if(!record)fail("PROMOTION_DEPENDENCY_MISSING",`Missing source ${reference.kind}.`);sourceId=record._id;
      }
      reserveCanonicalRead();const sourceRecord=await read(ctx,targetKind as PromotionKind,sourceId);
      if(!sourceRecord)fail("PROMOTION_DEPENDENCY_MISSING",`Missing source ${reference.kind}.`);
      if(targetKind==="term" && sourceRecord.taxonomy!==(reference.kind==="category"?"category":"post_tag"))fail("PROMOTION_REFERENCE_KIND","Wrong source taxonomy kind.");
      const result=ref(await add(targetKind as PromotionKind,sourceId,sourceRecord));canonicalReferenceKeys.set(cacheKey,result);return result;

  }

	if(args.selection.includeLocalization)await includeLocaleConfiguration();
  if(args.selection.localeGroupKeys?.length&&!args.selection.includeLocalization)fail('LOCALIZATION_SELECTION_REQUIRED','Include site languages before selecting translation groups.');
  for(const key of args.selection.localeGroupKeys??[]){reserveCanonicalRead();const group=await ctx.db.query('locale_translation_groups').withIndex('by_key',q=>q.eq('key',key)).unique();if(!group)fail('PROMOTION_DEPENDENCY_MISSING','Selected translation group is missing.');await add('localeGroup',group._id);}
	for (const id of args.selection.mediaIds) await add("media", id);
	for (const id of args.selection.pageIds) await add("page", id);
	for (const id of args.selection.postIds) await add("post", id);
	for (const id of args.selection.menuIds) await add("menu", id);
	for (const id of args.selection.eventIds) await add("event", id);
  for (const id of args.selection.courseIds ?? []) await add("course", id);
  for (const id of args.selection.planIds ?? []) await add("plan", id);
  for (const id of args.selection.productIds ?? []) await add("product", id);
  for (const id of args.selection.productCategoryIds ?? []) await add("productCategory", id);
  for (const id of args.selection.productTagIds ?? []) await add("productTag", id);
  for (const id of args.selection.productBrandIds ?? []) await add("productBrand", id);
	if (args.selection.includePresentation) {
		for (const location of await bounded(
			ctx.db.query("menuLocations").take(101),
		))
			await add("menuLocation", location._id, location as Row);
		for (const section of ["general", "reading"] as const) {
			const doc = await ctx.db
				.query("settings")
				.withIndex("by_section", (q) => q.eq("section", section))
				.unique();
			if (!doc) continue;
			const allowed =
				section === "general"
					? ["siteTitle", "tagline", "siteLogo", "logoUrl"]
					: ["homepageDisplays", "homepageId", "postsPageId", "postsPerPage"];
			const values = Object.fromEntries(
				Object.entries(doc.values).filter(([field]) => allowed.includes(field)),
			);
			const key = `presentation:${section}`;
			records.set(key, {
				key,
				kind: "presentation",
				sourceRevision: hash(values),
				data: { section, values: await transform(values, key) },
			});
		}
		const appearance = await readAppearance(ctx);
		records.set("presentation:appearance.template", {
			key: "presentation:appearance.template",
			kind: "presentation",
			sourceRevision: hash(appearance.values),
			data: {
				section: "appearance.template",
				values: await transform(
					appearance.values,
					"presentation:appearance.template",
				),
			},
		});
	}
	const routeRules = await bounded(ctx.db
		.query("membership_restriction_rules")
		.withIndex("by_resource", (q) => q.eq("resourceType", "route"))
		.take(args.selection.includeRoutePolicies ? 101 : 1));
  if (args.selection.includeRoutePolicies) {
    if (routeRules.length > 100) fail("PROMOTION_LIMIT", "Site access rules exceed the atomic promotion budget; no partial policy collection can be promoted.");
    for (const rule of routeRules) await add("restriction", rule._id, rule as Row);
  } else if (routeRules.length)
		fail(
			"ROUTE_POLICY_SELECTION_REQUIRED",
			"Include site access rules to review the source route policies and their membership plans with this promotion.",
		);
  let synced:ContentPromotionManifest["synced"];
  const containsSynced=(tree:unknown):boolean=>Array.isArray(tree)&&tree.some(node=>plain(node)&&(node.name==="core/synced"||containsSynced(node.children)));
  if([...canonicalDocuments.values()].some(containsSynced)){
    const budget=new RequestReadLedger();
    // Exporting an ordinary page referenced inside a reusable revision can add
    // another canonical root. Close over those roots in the same DB snapshot.
    for(;;){
      const count=canonicalDocuments.size;
      const closure=await captureSyncedPromotionClosure(ctx,[...canonicalDocuments].map(([key,blocks])=>({key,blocks})),reference=>resolveCanonicalReference(reference,"synced-closure"),budget);
      if(canonicalDocuments.size===count){const {documents:_documents,...sources}=closure;synced=sources;break;}
    }
  }

	const manifest: ContentPromotionManifest = {
		version: 1,
		source,
		target: args.target,
		selection: args.selection,
		records: [...records.values()],
    ...(synced?{synced}:{}),
		dependencies: [...dependencies.values()],
		issues,
	};
	if (issues.length)
		fail(
			"PROMOTION_EXPORT_UNSUPPORTED",
			issues
				.slice(0, 5)
				.map((issue) => `${issue.key}.${issue.path}: ${issue.message}`)
				.join("\n"),
		);
	return { manifest: validateManifest(manifest), downloadUrls: urls };
}
