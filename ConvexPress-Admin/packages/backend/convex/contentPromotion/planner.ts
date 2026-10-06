import type { RuntimeCanonicalTree } from "../canonicalDocuments/foundation/composedRegistry";
import {readLocaleGroup,reviewLocalization} from "./localization";
import { reviewCanonicalPromotionPolicy } from "../canonicalDocuments/displayContext";
import { syncedClosureFromManifest } from './syncedClosure';
import { planSyncedTargets, previewSyncedTargetDocuments, type SyncedTargetPlan } from './syncedTarget';
import {ConvexError} from "convex/values";
import {validatePromotedEvent} from "./eventRsvp";
import { contactWriteRequirement } from "../canonicalDocuments/contactWriteRequirement";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { currentUserCan } from "../helpers/permissions";
import type { CanonicalTree } from "../canonicalDocuments/foundation/generated/types";
import { parseCanonicalPromotionTree } from "../canonicalDocuments/foundation/promotionTree";
import { recordRevision } from "./shared";
import { assertLegacyAuthoring } from "../helpers/authoringVersionFence";
import { isLearningKind, lookupLearningTarget, reviewLearningRecord, reviewLearningCollections } from "./learning";
import { isCatalogKind, lookupCatalogTarget, reviewCatalogRecord, reviewCatalogCollections } from "./commerce";
import {
	PLUGIN_DEFAULTS,
	PLUGIN_PARENT,
	PLUGIN_SETTINGS_KEY,
} from "../plugins/registry";
import { promotionAuthorization } from "./authorization";
import type {
	ContentPromotionManifest,
	PromotionIssue,
	PromotionRecord,
	PromotionKind,
} from "@convexpress/site-contract/content-promotion";
import { promotionDataSchemas, PROMOTION_URL_PREFIX } from "@convexpress/site-contract/content-promotion";
import type { QueryCtx } from "../_generated/server";
import {
	assertTarget,
	fail,
	hash,
	read,
	referencedKey,
	walk,
	walkPortable,
	type Row,
} from "./shared";
import { pageRouteWarning } from "../helpers/pageRoutePolicy";
import { countBlockNames } from "../blocks/helpers";
import type { StoredBlock } from "../blocks/helpers";

export type Bindings = {
	mediaBindings: Array<{ key: string; storageId: string }>;
	dependencyBindings: Array<{ key: string; targetId: string }>;
};
export type Plan = {
  synced?: SyncedTargetPlan;
	changes: Array<{
		key: string;
		kind: PromotionKind | 'syncedBlock';
		targetId: string | null;
		beforeRevision: string;
		fields: string[];
	}>;
	dependencies: Array<{
		key: string;
		table: string;
		targetId: string;
		revision: string;
	}>;
	media: Array<{
		key: string;
		storageId: string;
		sha256: string;
		size: number;
	}>;
};
export async function lookupTarget(
	ctx: QueryCtx,
	manifest: ContentPromotionManifest,
	record: PromotionRecord,
	known: Map<string, string>,
): Promise<Row | null> {
	const mapping = await ctx.db
		.query("contentPromotion_mappings")
		.withIndex("by_source_key", (q) =>
			q
				.eq("sourceInstanceKey", manifest.source.instanceKey)
				.eq("sourceKey", record.key),
		)
		.unique();
	if (mapping) {
		if (mapping.kind !== record.kind)
			fail(
				"PROMOTION_MAPPING_CONFLICT",
				`Source mapping kind changed: ${record.key}`,
			);
		const found = await read(ctx, record.kind, mapping.targetId);
		if (found) return found;
	}
	const d = record.data;
	const mapped = (value: unknown) =>
		typeof value === "string"
			? known.get(referencedKey(value) ?? "")
			: undefined;
	switch (record.kind) {
    case 'localeRouting': return await ctx.db.query('locale_routing').withIndex('by_key',q=>q.eq('key','site')).unique();
    case 'localeGroup': {const row=await ctx.db.query('locale_translation_groups').withIndex('by_key',q=>q.eq('key',String(d.key))).unique();return row?readLocaleGroup(ctx,row):null;}
    case "course": case "courseNode": case "coursePrerequisite": case "plan": case "planBenefit": return lookupLearningTarget(ctx, record, known);
    case "product":
    case "productCategory":
    case "productTag":
    case "productBrand":
    case "productVariant":
      return lookupCatalogTarget(ctx, record, known);
		case "page":
		case "post":
			return (await ctx.db
				.query("posts")
				.withIndex("by_type_slug", (q) =>
					q
						.eq("type", record.kind as "page" | "post")
						.eq("slug", String(d.slug)),
				)
				.unique()) as Row | null;
		case "media":
			return (await ctx.db
				.query("media")
				.withIndex("by_slug", (q) => q.eq("slug", String(d.slug)))
				.unique()) as Row | null;
		case "menu":
			return (await ctx.db
				.query("menus")
				.withIndex("by_slug", (q) => q.eq("slug", String(d.slug)))
				.unique()) as Row | null;
		case "menuLocation":
			return (await ctx.db
				.query("menuLocations")
				.withIndex("by_slug", (q) => q.eq("slug", String(d.slug)))
				.unique()) as Row | null;
		case "term":
			return (await ctx.db
				.query("terms")
				.withIndex("by_slug_taxonomy", (q) =>
					q
						.eq("slug", String(d.slug))
						.eq("taxonomy", d.taxonomy as "category" | "post_tag"),
				)
				.unique()) as Row | null;
		case "kbCategory":
      return (await ctx.db.query("kb_categories").withIndex("by_slug", q => q.eq("slug", String(d.slug))).unique()) as Row | null;
		case "eventCategory":
      return (await ctx.db.query("extension_event_categories").withIndex("by_slug",q=>q.eq("slug",String(d.slug))).unique()) as Row|null;
		case "event":
			return (await ctx.db
				.query("extension_events")
				.withIndex("by_slug", (q) => q.eq("slug", String(d.slug)))
				.unique()) as Row | null;
		case "presentation":
			return (await ctx.db
				.query("settings")
				.withIndex("by_section", (q) =>
					q.eq(
						"section",
						d.section as "general" | "reading" | "appearance.template",
					),
				)
				.unique()) as Row | null;
		case "termRelationship": {
			const post = mapped(d.postId),
				term = mapped(d.termId);
			return post && term
				? ((await ctx.db
						.query("termRelationships")
						.withIndex("by_post_term", (q) =>
							q.eq("postId", post as never).eq("termId", term as never),
						)
						.unique()) as Row | null)
				: null;
		}
		case "postMeta": {
			const post = mapped(d.postId);
			return post
				? ((await ctx.db
						.query("postMeta")
						.withIndex("by_post_key", (q) =>
							q.eq("postId", post as never).eq("key", String(d.key)),
						)
						.unique()) as Row | null)
				: null;
		}
		case "restriction": {
      // Route rules are a collection, not a unique row per path. Only the
      // source mapping above can identify a previously promoted rule.
      if (d.resourceType === "route") return null;
			const resource = mapped(d.resourceIdOrKey) ?? String(d.resourceIdOrKey);
			if (referencedKey(resource)) return null;
			return (await ctx.db
				.query("membership_restriction_rules")
				.withIndex("by_resource", (q) =>
					q
						.eq(
							"resourceType",
							d.resourceType as "page" | "post" | "block" | "route",
						)
						.eq("resourceIdOrKey", resource),
				)
				.unique()) as Row | null;
		}
		// An unrelated target menu row is never guessed from its position or label.
		case "menuItem":
			return null;
	}
}
export function orderedRecords(manifest: ContentPromotionManifest) {
	const pending = new Map(manifest.records.map((r) => [r.key, r]));
 const appearance = manifest.records.find(record=>record.kind === "presentation" && record.data.section === "appearance.template");
	const resolved = new Set(manifest.dependencies.map((d) => d.key));
  if (manifest.synced) {
    for (const source of manifest.synced.sources) resolved.add(referencedKey(source.key)!);
  }
	const ordered: PromotionRecord[] = [];
	while (pending.size) {
		let progress = false;
		for (const [key, record] of pending) {
			const refs: string[] = [];
      if (record.data.blocksVersion === 2 && appearance) refs.push(appearance.key);
			// Body references can use identities reserved by apply. Structural
      // parent/menu edges must still be ordered and reject cycles.
      const { canonical, ...other } = record.data;
      walkPortable(manifest.synced && record.data.blocksVersion === 2 ? other : record.data, (value) => {
				const reference = referencedKey(value);
				if (reference) refs.push(reference);
				return value;
			});
			if (refs.every((reference) => resolved.has(reference))) {
				ordered.push(record);
				resolved.add(key);
				pending.delete(key);
				progress = true;
			}
		}
		if (!progress)
			fail(
				"PROMOTION_REFERENCE_CYCLE",
				"The selection has a cyclic or unsupported dependency. Resolve parent/menu/media dependencies before promotion.",
			);
	}
	return ordered;
}
export async function planPromotion(
	ctx: QueryCtx,
	manifest: ContentPromotionManifest,
	bindings: Bindings,
): Promise<{ plan: Plan; issues: PromotionIssue[] }> {
	await assertTarget(ctx, manifest);
	const authorization = await promotionAuthorization(ctx);
	const issues = [...manifest.issues];

	const plan: Plan = { changes: [], dependencies: [], media: [] };
  const closure = syncedClosureFromManifest(manifest);
  const appearance = manifest.records.find(row => row.kind === 'presentation' && row.data.section === 'appearance.template');
  if (closure) plan.synced = await planSyncedTargets(ctx, closure, (appearance?.data.values as {active?:string}|undefined)?.active);
  const syncedDocuments = closure && plan.synced ? await previewSyncedTargetDocuments(closure, plan.synced) : null;
  const contactBudget = new RequestReadLedger();
  const contactPermissions = new Map<"form.create" | "form.update", boolean>();
	const known = new Map<string, string>();
	const issue = (code: string, key: string, message: string) =>
		issues.push({ code, key, path: "", message });
	const pluginRows = await ctx.db
		.query("settings")
		.withIndex("by_section", (q) => q.eq("section", "plugins"))
		.unique();
	const pluginValues = pluginRows?.values ?? {};
	const enabled = (pluginId: string, seen = new Set<string>()): boolean => {
		if (seen.has(pluginId) || !PLUGIN_SETTINGS_KEY[pluginId]) return false;
		seen.add(pluginId);
		const stored = pluginValues[PLUGIN_SETTINGS_KEY[pluginId]];
		const active =
			typeof stored === "boolean" ? stored : PLUGIN_DEFAULTS[pluginId];
		return (
			active === true &&
			(!PLUGIN_PARENT[pluginId] || enabled(PLUGIN_PARENT[pluginId]!, seen))
		);
	};
	const enabledKey = (key: string) => {
		const entry = Object.entries(PLUGIN_SETTINGS_KEY).find(
			([, value]) => value === key,
		);
		return !!entry && enabled(entry[0]);
	};

	for (const dep of manifest.dependencies) {
		if (dep.kind === "catalog") {
			issue(
				"CATALOG_ADAPTER_REQUIRED",
				dep.key,
				`This selection uses the ${dep.sourceId} catalog. Promote that catalog with an explicit authored-structure adapter; operational/customer records are never copied.`,
			);
			continue;
		}
		if (dep.kind === "plugin") {
			if (!enabledKey(dep.sourceId ?? ""))
				issue(
					"TARGET_PLUGIN_DISABLED",
					dep.key,
					`Enable ${dep.sourceId} on the target explicitly before reviewing this selection.`,
				);
			else
				plan.dependencies.push({
					key: dep.key,
					table: "settings",
					targetId: pluginRows
						? String(pluginRows._id)
						: "default-plugin-settings",
					revision: hash(pluginRows ?? null),
				});
			continue;
		}
		const table = {
			product: "commerce_products",
			course: "lms_courses",
			plan: "membership_plans",
			form: "forms",
			role: "roles",
		}[dep.kind];
		const binding = bindings.dependencyBindings.find(
			(item) => item.key === dep.key,
		);
		if (!binding) {
			issue(
				"TARGET_DEPENDENCY_REQUIRED",
				dep.key,
				`Map ${dep.kind} ${dep.slug ?? dep.sourceId ?? dep.key} to an explicitly reviewed existing target record. Its catalog/learning structure is not copied by this adapter.`,
			);
			continue;
		}
		const normalized = ctx.db.normalizeId(table as never, binding.targetId);
		const row = normalized
			? ((await ctx.db.get(normalized)) as Row | null)
			: null;
		if (!row || (dep.slug && row.slug !== dep.slug)) {
			issue(
				"TARGET_DEPENDENCY_MISMATCH",
				dep.key,
				"The selected target record is missing or does not match the required stable slug.",
			);
			continue;
		}
		known.set(dep.key, row._id);
		plan.dependencies.push({
			key: dep.key,
			table,
			targetId: row._id,
			revision: table === "terms" ? recordRevision("term", row) : hash(row),
		});
	}
	const allBindingKeys = [
		...bindings.mediaBindings.map((b) => b.key),
		...bindings.dependencyBindings.map((b) => b.key),
	];
	if (new Set(allBindingKeys).size !== allBindingKeys.length)
		fail(
			"DUPLICATE_PROMOTION_BINDING",
			"Each dependency must have exactly one target binding.",
		);
	for (const binding of bindings.dependencyBindings)
		if (
			!manifest.dependencies.some(
				(dep) =>
					dep.key === binding.key && !["plugin", "catalog"].includes(dep.kind),
			)
		)
			fail(
				"UNEXPECTED_PROMOTION_BINDING",
				"A target dependency binding is outside this selection.",
			);
	const validKeys = new Set(
		manifest.records.filter((r) => r.kind === "media").map((r) => r.key),
	);
	for (const binding of bindings.mediaBindings)
		if (!validKeys.has(binding.key))
			issue(
				"UNEXPECTED_MEDIA_BINDING",
				binding.key,
				"This media binding is outside the reviewed selection.",
			);
	for (const record of orderedRecords(manifest)) {
		const current = await lookupTarget(ctx, manifest, record, known);
		await authorization.write(record, current);
    if(record.kind==="event"){
      try{
        const fields=await validatePromotedEvent(ctx,current?._id??null,record.data);
        if(fields.rsvp&&fields.rsvp.mode!=="closed"&&!enabled("forms"))issue("TARGET_PLUGIN_DISABLED",record.key,"Enable Forms on the target before promoting website RSVP settings.");
      }catch(error){
        if(error instanceof ConvexError&&error.data&&typeof error.data==="object"&&"code" in error.data&&"message" in error.data&&typeof error.data.code==="string"&&typeof error.data.message==="string")issue(error.data.code,record.key,error.data.message);
        else throw error;
      }
    }
    if (current && (record.kind === "post" || record.kind === "page")) {
      if(record.data.blocksVersion===2){if(current.blocksVersion!==2)issue("CANONICAL_TARGET_MIGRATION_REQUIRED",record.key,"Migrate the existing target document before canonical promotion.");}
      else assertLegacyAuthoring(current);
    }
    if (isCatalogKind(record.kind) && !enabled("commerce")) issue("TARGET_PLUGIN_DISABLED", record.key, "Enable Commerce on the target before reviewing catalog records.");
    await reviewCatalogRecord(ctx, manifest, record, current, known, issue);
    if (isLearningKind(record.kind) && !enabled(record.kind.startsWith("course") ? "lms" : "membership")) issue("TARGET_PLUGIN_DISABLED", record.key, "Enable the required LMS/Membership plugin before reviewing learning records.");
    await reviewLearningRecord(ctx, manifest, record, current, known, issue);
    if (record.kind === "kbCategory" && current?.deletionJobId) issue("CATEGORY_DELETING", record.key, "Finish category deletion before promoting a replacement.");
    if (record.kind === "kbCategory" && !enabled("knowledgeBase"))
      issue("TARGET_PLUGIN_DISABLED", record.key, "Enable Knowledge Base on the target before promoting help categories.");
		if ((record.kind === "event" || record.kind === "eventCategory") && !enabled("events"))
			issue(
				"TARGET_PLUGIN_DISABLED",
				record.key,
				"Enable Events on the target before promoting event records.",
			);
		if (record.kind === "restriction" && !enabled("membership"))
			issue(
				"TARGET_PLUGIN_DISABLED",
				record.key,
				"Enable Membership on the target before promoting access policies.",
			);
		if (current) {
			if ([...known.values()].includes(current._id))
				issue(
					"DUPLICATE_TARGET_MAPPING",
					record.key,
					"Two source records resolve to the same target. Resolve that ambiguity before applying.",
				);
			known.set(record.key, current._id);
			if (JSON.stringify(current).length > 100_000)
				issue(
					"TARGET_BACKUP_LIMIT",
					record.key,
					"This target record exceeds the bounded pre-change backup size. Use a larger-record adapter.",
				);
			if (
				(record.kind === "page" || record.kind === "post") &&
				(current.status === "future" ||
					current.visibility === "password" ||
					current.scheduledAt)
			)
				issue(
					"TARGET_CONTENT_STATE_CONFLICT",
					record.key,
					"The target has protected or scheduled content. Resolve its target schedule/visibility explicitly before promotion.",
				);
		}
		if (record.kind === "media") {
			const storageId =
				bindings.mediaBindings.find((item) => item.key === record.key)
					?.storageId ??
				(typeof current?.storageId === "string"
					? current.storageId
					: undefined);
			const normalized = storageId
				? ctx.db.system.normalizeId("_storage", storageId)
				: null;
			const storage = normalized ? await ctx.db.system.get(normalized) : null;
			if (
				!storage ||
				storage.sha256 !== record.data.sha256 ||
				storage.size !== record.data.fileSize
			) {
				issue(
					"TARGET_MEDIA_UPLOAD_REQUIRED",
					record.key,
					"Upload the source bytes into target storage and supply their target storage ID. SHA-256 and size must match this manifest.",
				);
			} else {
				if (current?.storageId && current.storageId !== normalized)
					issue(
						"TARGET_MEDIA_REPLACEMENT_REQUIRED",
						record.key,
						"The target already owns a different original file. Use a distinct media slug or an explicit replacement adapter with variant invalidation.",
					);
				plan.media.push({
					key: record.key,
					storageId: normalized!,
					sha256: storage.sha256,
					size: storage.size,
				});
			}
		}
		if (record.kind === "page") {
			if (current && current.path !== record.data.path) {
				const child = await ctx.db
					.query("posts")
					.withIndex("by_type_parent", (q) =>
						q.eq("type", "page").eq("parentId", current._id as never),
					)
					.first();
				if (child)
					issue(
						"TARGET_PAGE_SUBTREE_CONFLICT",
						record.key,
						"Moving this target parent needs an explicit descendant-path migration.",
					);
			}

			const dashboard = await ctx.db
				.query("settings")
				.withIndex("by_section", (q) => q.eq("section", "dashboard"))
				.unique();
			const warning = pageRouteWarning(
				String(record.data.path ?? `/${record.data.slug}`),
				dashboard?.values?.basePath,
			);
			if (warning) issue("TARGET_ROUTE_COLLISION", record.key, warning);
		}
		if ((record.kind === "page" || record.kind === "post") && record.data.blocksVersion === 2) {
      const appearance = manifest.records.find(row=>row.kind === "presentation" && row.data.section === "appearance.template");
      const values = appearance?.data.values as {active?:string} | undefined;
      try {
        const expanded = syncedDocuments?.get(record.key);
        const blocks = expanded?.resolverTree ?? parseCanonicalPromotionTree(record.data.canonical).blocks;
        const revision = plan.synced?.policyDigest ?? await reviewCanonicalPromotionPolicy(ctx, blocks, values?.active);
        plan.dependencies.push({key:`canonical-policy:${record.key}`,table:"settings",targetId:"canonical-policy",revision});
        const targetPostId = current ? ctx.db.normalizeId("posts", String(current._id)) : null;
        if (current && !targetPostId) fail("INVALID_PROMOTION_TARGET", "The contact form source is not a valid document.");
        const reviewContacts = async (nodes: RuntimeCanonicalTree): Promise<void> => {
          for (const node of nodes) {
            if (node.name === "core/contact-form") {
              const newSource = expanded?.byId.get(node.id)?.sourceChain.some(source => source.id.startsWith('new:'));
              const {existing, capability} = await contactWriteRequirement(ctx, newSource ? null : targetPostId, node.id, contactBudget);
              if (!contactPermissions.has(capability)) contactPermissions.set(capability, await currentUserCan(ctx, capability, contactBudget));
              if (!contactPermissions.get(capability)) issue("TARGET_CONTACT_PERMISSION", record.key, `The contact block ${node.id} requires ${capability} on the destination.`);
              plan.dependencies.push({key:`canonical-contact:${record.key}:${node.id}`,table:"forms",targetId:existing ? String(existing._id) : `new:${node.id}`,revision:hash(existing)});
            }
            if (node.children) await reviewContacts(node.children);
          }
        };
        await reviewContacts(blocks);
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") throw error;
        issue("TARGET_CANONICAL_POLICY", record.key, `Canonical block policy rejected this document (${error.code}).`);
      }
    }
    if ((record.kind === "page" || record.kind === "post") && record.data.blocksVersion !== 2) {
			const blockSettings = await ctx.db
				.query("settings")
				.withIndex("by_section", (q) => q.eq("section", "blocks"))
				.unique();
			const disabled = blockSettings?.values?.disabledBlockNames;
			const before = countBlockNames((current?.blocks ?? []) as StoredBlock[]),
				after = countBlockNames((record.data.blocks ?? []) as StoredBlock[]);
			if (
				Array.isArray(disabled) &&
				disabled.some(
					(name: unknown) =>
						typeof name === "string" &&
						(after.get(name) ?? 0) > (before.get(name) ?? 0),
				)
			)
				issue(
					"TARGET_BLOCK_DISABLED",
					record.key,
					"The selection adds a block disabled on the target.",
				);
		}
		plan.changes.push({
			key: record.key,
			kind: record.kind,
			targetId: current?._id ?? null,
			beforeRevision: recordRevision(record.kind, current),
			fields: [...new Set([...Object.keys(record.data), ...((isCatalogKind(record.kind) || isLearningKind(record.kind)) && current ? Object.keys(promotionDataSchemas[record.kind].shape).filter(key=>current[key] !== undefined && record.data[key] === undefined && !(record.kind === "product" && (key === "tagIds" || key === "isFeatured" || key === "brandId"))) : [])])].sort(),
		});
	}
	await reviewCatalogCollections(ctx, plan.changes, issue);
  await reviewLearningCollections(ctx, plan.changes, issue);
  try {await reviewLocalization(ctx,manifest,plan,known);} catch(error) {
    if(error instanceof ConvexError&&error.data&&typeof error.data==='object'&&'code' in error.data&&'message' in error.data)issue(String(error.data.code),'localization',String(error.data.message));else throw error;
  }
  // Replacing an adopted menu's collection must be explicitly modelled, never append
	// source items beside unrelated live navigation or silently delete target records.
	for (const change of plan.changes.filter(
		(item) => item.kind === "menu" && item.targetId,
	)) {
		const rows = await ctx.db
			.query("menuItems")
			.withIndex("by_menu", (q) => q.eq("menuId", change.targetId as never))
			.take(101);
		const retained = new Set(
			plan.changes
				.filter((item) => item.kind === "menuItem" && item.targetId)
				.map((item) => item.targetId),
		);
		if (rows.some((row) => !retained.has(row._id)))
			issue(
				"MENU_COLLECTION_CONFLICT",
				change.key,
				"Target menu contains items outside the source mapping. Review an explicit menu replacement/removal adapter instead of dropping or duplicating them.",
			);
	}
	for (const change of plan.changes.filter(
		(item) => (item.kind === "page" || item.kind === "post") && item.targetId,
	)) {
		const relations = await ctx.db
			.query("termRelationships")
			.withIndex("by_post", (q) => q.eq("postId", change.targetId as never))
			.take(101);
		const retained = new Set(
			plan.changes
				.filter((item) => item.kind === "termRelationship" && item.targetId)
				.map((item) => item.targetId),
		);
		if (relations.some((row) => !retained.has(row._id)))
			issue(
				"TARGET_TAXONOMY_COLLECTION_CONFLICT",
				change.key,
				"Target taxonomy assignments outside this manifest require an explicit removal review.",
			);
		const rules = await ctx.db
			.query("membership_restriction_rules")
			.withIndex("by_resource", (q) =>
				q
					.eq("resourceType", change.kind as "page" | "post")
					.eq("resourceIdOrKey", change.targetId!),
			)
			.take(101);
		const rulesRetained = new Set(
			plan.changes
				.filter((item) => item.kind === "restriction" && item.targetId)
				.map((item) => item.targetId),
		);
		if (rules.some((row) => !rulesRetained.has(row._id)))
			issue(
				"TARGET_RESTRICTION_CONFLICT",
				change.key,
				"Target access rules outside this manifest need explicit review; promotion does not discard them.",
			);
	}
  if (manifest.selection.includeRoutePolicies) {
    const rules = await ctx.db.query("membership_restriction_rules")
      .withIndex("by_resource", q => q.eq("resourceType", "route")).take(101);
    if (rules.length > 100) fail("PROMOTION_LIMIT", "Destination route policies exceed the atomic review budget.");
    const retained = new Set(plan.changes.filter(change => change.kind === "restriction" &&
      manifest.records.some(record => record.key === change.key && record.data.resourceType === "route"))
      .map(change => change.targetId));
    for (const rule of rules) if (!retained.has(rule._id))
      issue("TARGET_ROUTE_POLICY_CONFLICT", "route-policies", `Destination access rule ${rule.resourceIdOrKey} is outside this source mapping. Review its retention or removal before applying site-wide policies.`);
    plan.dependencies.push({key:"route-policy-collection",table:"membership_restriction_rules",targetId:"route-policies",revision:hash(rules)});
  }
	if (manifest.selection.includePresentation) {
		const locations = await ctx.db.query("menuLocations").take(101);
		const selected = new Set(
			manifest.records
				.filter((row) => row.kind === "menuLocation")
				.map((row) => String(row.data.slug)),
		);
		if (
			locations.some(
				(location) => location.menuId && !selected.has(location.slug),
			)
		)
			issue(
				"TARGET_MENU_LOCATION_CONFLICT",
				"presentation",
				"Target navigation locations outside the source selection need explicit review before replacing the presentation.",
			);
	}
  for (const source of plan.synced?.sources ?? []) plan.changes.push({ key: referencedKey(source.key)!, kind: 'syncedBlock', targetId: source.targetId, beforeRevision: source.beforeRevision, fields: ['title', 'publishedRevision', 'revisions'] });
	return { plan, issues };
}
