import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { enabledPluginIds } from "../helpers/plugins";
import { readAppearance } from "../settings/appearanceMigration";
import { dependencyDescriptors } from "./foundation/generated/metadata";
import { validateCanonicalTree, assertPackTreatments } from "./foundation/generated/instances";
import { resolverArgs } from "./foundation/contracts";
import { planCanonicalData } from "./foundation/planner";
import { consumerIndexGeneration, consumerIndexReady } from "../syncedBlocks/consumerIndexState";
import { installation as syncedInstallation } from "../syncedBlocks/model";
import { canonicalJson, sha256Hex } from "./foundation/shared/fingerprints";
function refuse(code:string,message:string):never { throw new ConvexError({code,message}); }
/** Shared policy projection; deliberately excludes resolver execution and authoring writes. */
export async function installation(ctx: QueryCtx, budget: RequestReadLedger) {
	budget.beforeRead();
	const identity = budget.record(
		await ctx.db
			.query("convexpress_siteIdentity")
			.withIndex("by_identity_key", (q) => q.eq("identityKey", "site-identity"))
			.unique(),
	);
	if (!identity)
		refuse(
			"SITE_IDENTITY_REQUIRED",
			"Initialize this site before using the canonical editor.",
		);
	return { websiteKey: identity.websiteKey, instanceKey: identity.instanceKey };
}
export async function displayContext(ctx: QueryCtx, budget: RequestReadLedger) {
	const scope = await installation(ctx, budget);
	const appearance = await readAppearance(ctx, budget);
	const enabledPlugins = await enabledPluginIds(ctx, budget);
	budget.beforeRead();
	const setting = budget.record(
		await ctx.db
			.query("settings")
			.withIndex("by_section", (q) => q.eq("section", "blocks"))
			.unique(),
	);
	const raw = (setting?.values as { disabledBlockNames?: unknown } | undefined)
		?.disabledBlockNames;
	if (
		raw !== undefined &&
		(!Array.isArray(raw) || raw.some((value) => typeof value !== "string"))
	)
		refuse("INVALID_BLOCK_POLICY", "The block enablement policy is invalid.");
	// These are implemented sandbox/sanitizer host features, never user capabilities.
	// Only implemented closed data providers and supported submission policies are available.
	const capabilities = [
    "feed.approvedProvider",
		"html.sanitize",
    "locale.routing",
		"embed.sandbox",
		"reference.targetResolution",
		"tree.children",
		"map.approvedProvider",
		"embed.approvedScript",
		"form.submission",
    "contact.submission",
    "poll.submission",
    "viewer.authorization", // Private cart host resolves the current session before displaying amounts.
	];
	const disabledBlocks = new Set<string>((raw as string[] | undefined) ?? []);
  // Discovery plus per-placement Forms verification is required after setup,
  // restore or a reviewed implementation change. Explicit user disables remain.
  if (!consumerIndexGeneration() || !(await consumerIndexReady(ctx, await syncedInstallation(ctx, budget), budget))) disabledBlocks.add("core/synced");
	for (const [name, descriptor] of Object.entries(dependencyDescriptors)) {
    // This source reference expands before ordinary data planning. It is not
    // an ordinary data resolver and never receives a generic reference lookup.
    const structuralSynced = name === "core/synced" && descriptor.data?.resolver === "content.syncedBlock";
		if (
			!descriptor.libraryRenderer ||
      descriptor.requires.capabilities.some(capability => !capabilities.includes(capability)) ||
      descriptor.requires.plugins.some(plugin => !enabledPlugins.includes(plugin)) ||
			(descriptor.data && !structuralSynced && !Object.prototype.hasOwnProperty.call(resolverArgs, descriptor.data.resolver)) ||
			descriptor.fields.some(
				(field) =>
					field.type !== "media" &&
          !(structuralSynced && field.type === "reference" && "of" in field && field.of === "syncedBlock" && field.path.join(".") === "syncedBlock" && field.valuePath.length === 0) &&
          !(name === "core/lead-magnet" && descriptor.data?.resolver === "forms.leadMagnet" && field.type === "reference" && "of" in field && field.of === "mailingList" && "storage" in field && field.storage === "id" && field.path.join(".") === "list" && field.valuePath.length === 0) &&
          !(name === "support/kb-search" && descriptor.data?.resolver === "support.search" && field.type === "reference" && "of" in field && field.of === "kbCategory" && field.storage === "id" && field.path.join(".") === "category" && field.valuePath.length === 0) &&
          !(name === "lms/curriculum" && descriptor.data?.resolver === "lms.curriculum" && field.type === "reference" && "of" in field && field.of === "course" && field.storage === "id" && field.path.join(".") === "course" && field.valuePath.length === 0) &&
          !(name === "lms/progress" && descriptor.data?.resolver === "lms.progress" && field.type === "reference" && "of" in field && field.of === "course" && field.storage === "id" && field.path.join(".") === "course" && field.valuePath.length === 0) &&
          !(name === "lms/instructor" && descriptor.data?.resolver === "lms.instructor" && field.type === "reference" && "of" in field && field.of === "instructor" && field.storage === "id" && field.path.join(".") === "instructor" && field.valuePath.length === 0) &&
          !(name === "core/form" && descriptor.data?.resolver === "forms.form" && field.type === "form") &&
          !(field.type === "menu" && descriptor.data?.resolver === "site.menu") &&
          !((name === "events/next-event" && descriptor.data?.resolver === "events.next" || name === "events/calendar" && descriptor.data?.resolver === "events.list") && field.type === "reference" && "of" in field && field.of === "eventCategory") &&
          !(name === "core/post-grid" && descriptor.data?.resolver === "content.posts" && field.type === "reference" && "of" in field && ["category", "tag", "user"].includes(field.of)) &&
          !(name === "commerce/category-tiles" && descriptor.data?.resolver === "commerce.categoryTiles" && field.type === "reference" && "of" in field && field.of === "productCategory" && field.storage === "slug" && field.path.join(".") === "categorySlugs.*" && field.valuePath.length === 0) &&
          !(name === "commerce/product-showcase" && descriptor.data?.resolver === "commerce.productShowcase" && field.type === "reference" && "of" in field && "storage" in field && field.storage === "slug" && field.valuePath.length === 0 && ((field.of === "productCategory" && field.path.join(".") === "categorySlug") || (field.of === "product" && field.path.join(".") === "productSlugs.*"))) &&
          !(name === "membership/plans" && descriptor.data?.resolver === "membership.plans" && field.type === "reference" && "of" in field && field.of === "membershipPlan" && field.storage === "id" && field.path.join(".") === "plans.*" && field.valuePath.length === 0) &&
          !(name === "membership/gated-teaser" && descriptor.data?.resolver === "membership.access" && field.type === "reference" && "of" in field && field.of === "membershipPlan" && field.storage === "id" && field.path.join(".") === "requiredPlan" && field.valuePath.length === 0) &&
          !(name === "core/event-rsvp" && descriptor.data?.resolver === "events.event" && field.type === "reference" && "of" in field && field.of === "event" && field.storage === "id" && field.path.join(".") === "event" && field.valuePath.length === 0) &&
          !(name === "core/ugc-grid" && descriptor.data?.resolver === "media.tagged" && field.type === "reference" && "of" in field && field.of === "tag" && "storage" in field && field.storage === "id" && field.path.join(".") === "tag" && field.valuePath.length === 0) &&
          !(name === "gallery/album" && descriptor.data?.resolver === "gallery.album" && field.type === "reference" && "of" in field && field.of === "album" && field.storage === "id" && field.path.join(".") === "album" && field.valuePath.length === 0) &&
          !(name === "gallery/recipe-card" && descriptor.data?.resolver === "recipes.recipe" && field.type === "reference" && "of" in field && field.of === "recipe" && field.storage === "id" && field.path.join(".") === "recipe" && field.valuePath.length === 0) &&
          !(name === "commerce/variant-picker-teaser" && descriptor.data?.resolver === "commerce.productOptions" && field.type === "reference" && "of" in field && field.of === "product" && field.storage === "id" && field.path.join(".") === "product" && field.valuePath.length === 0) &&
          !(name === "core/reviews" && descriptor.data?.resolver === "commerce.reviews" && field.type === "reference" && "of" in field && field.of === "product" && field.storage === "id" && field.path.join(".") === "product" && field.valuePath.length === 0) &&
          !(name === "commerce/bundle-offer" && descriptor.data?.resolver === "commerce.bundle" && field.type === "reference" && "of" in field && field.of === "bundle" && field.storage === "id" && field.path.join(".") === "bundle" && field.valuePath.length === 0) &&
          !(name === "commerce/product-compare" && descriptor.data?.resolver === "commerce.productCompare" && field.type === "reference" && "of" in field && field.of === "product" && field.storage === "id" && field.path.join(".") === "products.*" && field.valuePath.length === 0) &&
          !(name === "commerce/product-hero" && descriptor.data?.resolver === "commerce.productCollection" && field.type === "reference" && "of" in field && field.of === "product" && field.storage === "id" && field.path.join(".") === "product" && field.valuePath.length === 0) &&
          !(name === "blocks/product-collection" && descriptor.data?.resolver === "commerce.productCollection" && field.type === "reference" && "of" in field && field.valuePath.length === 0 && (
            (field.of === "product" && field.storage === "id" && (field.path.join(".") === "productIds.*" || field.path.join(".") === "groups.*.productIds.*")) ||
            (field.of === "productCategory" && field.storage === "slug" && field.path.join(".") === "categorySlug") ||
            (field.of === "productTag" && field.storage === "slug" && field.path.join(".") === "tagSlug")
          )) &&
          !(name === "core/featured-products" && descriptor.data?.resolver === "commerce.featuredProducts" && field.type === "reference" && "of" in field && field.of === "product" && field.storage === "id") &&
          !(name === "core/latest-posts" && descriptor.data?.resolver === "content.latestPosts" && field.type === "reference" && "of" in field && (field.of === "category" || field.of === "tag")) &&
					!(
						field.type === "reference" &&
						"of" in field &&
						field.of === "page" &&
						descriptor.data?.resolver === "content.page"
					),
			)
		)
			disabledBlocks.add(name);
  }
	return {
		scope,
		presentation: {
			packId: appearance.values.active,
			revision: sha256Hex(canonicalJson(appearance.values)),
		},
		policy: {
			enabledPlugins,
			capabilities,
			disabledBlocks: [...disabledBlocks],
		},
	};
}
/** Review policy without resolving source placeholders as target database IDs. */
export async function reviewCanonicalPromotionPolicy(ctx: QueryCtx, tree: unknown, packId?: string): Promise<string> {
  const budget = new RequestReadLedger();
  const display = await displayContext(ctx, budget);
  const blocks = validateCanonicalTree(tree);
  try { assertPackTreatments(blocks, packId ?? display.presentation.packId); }
  catch { refuse("PACK_TREATMENT_UNAVAILABLE", "The destination template does not support a selected block treatment."); }
  planCanonicalData(blocks, display.scope, display.policy);
  return sha256Hex(canonicalJson({...display, effectivePack:packId ?? display.presentation.packId}));
}
