import {readSocialFeed} from "../socialFeeds/read";
import {readLeadMagnet} from "./leadMagnet";
import {readTaggedMedia} from "./taggedMedia";
import {readSearch} from "./search";
import {readBundleOffer} from "./bundleOffer";
import {readProductCompare} from "./productCompare";
import {readReviews} from "./reviews";
import {readProductOptions} from "./productOptions";
import {readEventRsvp} from "./eventRsvp";
import {readLocaleDestinations} from "../localization/model";
import {readDateArchiveGroups} from "./dateArchive";
import {readKnowledgeSearch} from "./knowledgeBase";
import {readTicketCta} from "./support";
import {readCurriculum} from "./curriculum";
import {readLearnerProgress} from "./learnerProgress";
import {readInstructor} from "./instructor";
import { isPluginEnabled } from "../helpers/plugins";
import {readCourses} from "./courses";
import {readMembershipPlans} from "./membershipPlans";
import {readMembershipAccess} from "./membership";
import {readBrands} from "./brands";
import {readShippingPolicy} from "./shippingPolicy";
import {readRelatedContent} from "./relatedContent";
import {readAlbum} from "./album";
import {readRecipe} from "./recipe";
import {readProductShowcase} from "./productShowcase";
import { readCategoryTiles } from "./categoryTiles";
import { readProductCollection } from "./productCollection";
import { readFeaturedProducts } from "./featuredProducts";
import { readPoll } from "./poll";
import { readContact } from "./contact";
import { readTagCloud } from "./tagCloud";
import { readForm } from "./form";
import {readCalendar} from "./calendar";
import {readNextEvent} from "./nextEvent";
import {readUpcomingEvents} from "./upcomingEvents";
import { createNavigationReader, type NavigationSource } from "./navigation";
import { readLatestPosts } from "./latestPosts";
import { readPostGrid } from "./postGrid";
import type { BlockPageRequest } from "./foundation/postGridContracts";
/** Canonical service-only resolver adapter. No arbitrary function names or request args. */
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { canDiscoverContent } from "../helpers/publicContent";
import { SourceByteLedger } from "./sourceBudget";
import { planCanonicalData, type ComposedDataContext } from "./foundation/planner";
import { resolveCanonicalDataWithDefinitions } from "./foundation/resolve";
import {
	CanonicalDataError,
	pageResultSchema,
	type DataScope,
	type PageArgs,
	type PageResult,
	type ResolverPolicy,
} from "./foundation/contracts";
async function contentPage(
	ctx: QueryCtx,
	args: PageArgs,
	sources: SourceByteLedger,
	mediaCache: Map<
		Id<"media">,
		{ doc: Doc<"media"> | null; src: string | null | undefined }
	>,
	budget?: RequestReadLedger,
): Promise<PageResult> {
	if (!args.page) return { page: null };
	const id = ctx.db.normalizeId("posts", args.page);
	if (!id) return { page: null };
	sources.beforeRead();
	budget?.beforeRead();
	const document = await ctx.db.get("posts", id);
	budget?.record(document);
	if (document) sources.record("post", document);
	if (
		!document ||
		document.type !== "page" ||
		!(await canDiscoverContent(ctx, document, budget))
	)
		return { page: null };
	// canDiscoverContent has already checked publish/public and the current
	// resource, route and homepage membership rules. A detail projection would
	// repeat those checks and materialize body-bearing output we never return.
	const summary = pageResultSchema.safeParse({
		page: {
			id: String(document._id),
			title: document.title,
			href: document.path ?? `/${document.slug}`,
			excerpt: document.excerpt ?? null,
			image: null,
		},
	});
	if (!summary.success || !summary.data.page)
		throw new CanonicalDataError(
			"INVALID_RESOLVER_RESULT",
			"summary",
			"Source summary exceeds the supported public DTO",
		);
	let resolved = document.featuredImageId
		? mediaCache.get(document.featuredImageId)
		: undefined;
	if (document.featuredImageId && !resolved) {
		sources.beforeRead();
		budget?.beforeRead();
		const media = await ctx.db.get("media", document.featuredImageId);
		budget?.record(media);
		if (media) sources.record("media", media);
		let src: string | null | undefined = null;
		if (media && media.status !== "trashed") {
			if (media.storageId) {
				budget?.beforeRead();
				src = await ctx.storage.getUrl(media.storageId);
			}
			src ??= media.url;
		}
		resolved = { doc: media, src };
		mediaCache.set(document.featuredImageId, resolved);
	}
	const media = resolved?.doc,
		src = resolved?.src;
	return {
		page: {
			...summary.data.page,
			image: src ? { src, alt: media?.altText ?? "" } : null,
		},
	};
}
const registry: Readonly<{ "content.page": typeof contentPage }> =
	Object.freeze<{ "content.page": typeof contentPage }>({
		"content.page": contentPage,
	});
export async function resolveCanonicalPageData(
	ctx: QueryCtx,
	tree: unknown,
	expectedScope: DataScope,
	policy: ResolverPolicy,
	budget?: RequestReadLedger,
 navigation?: NavigationSource,
 request: BlockPageRequest = {},
 sourcePassword?: string,
 recentlyViewedIds: readonly string[] = [],
 composed?: ComposedDataContext,
) {
	// Check the complete plan before even reading installation identity. The
	// document host supplies authorized current tree, policy and definitions.
	const plan = planCanonicalData(tree, expectedScope, policy, request, composed);
  if (!navigation && plan.jobs.some(job => job.resolver !== "content.page")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted current document is required before data reads");
	budget?.beforeRead();
	const identity = await ctx.db
		.query("convexpress_siteIdentity")
		.withIndex("by_identity_key", (q) => q.eq("identityKey", "site-identity"))
		.unique();
	budget?.record(identity);
	if (
		!identity ||
		identity.websiteKey !== expectedScope.websiteKey ||
		identity.instanceKey !== expectedScope.instanceKey ||
    (composed !== undefined && identity.deploymentOrigin !== composed.scope.deploymentOrigin)
	)
		throw new CanonicalDataError(
			"SCOPE_MISMATCH",
			"scope",
			"The expected environment is not this installation",
		);
	const sources = new SourceByteLedger();
	const mediaCache = new Map<
		Id<"media">,
		{ doc: Doc<"media"> | null; src: string | null | undefined }
	>();
	return await resolveCanonicalDataWithDefinitions(tree, expectedScope, policy, {
    readPage: (args) =>
		registry["content.page"](ctx, args, sources, mediaCache, budget),
    readNavigation: navigation ? createNavigationReader(ctx,navigation,budget,sources,composed) : undefined,
    readPosts: args => readLatestPosts(ctx,args,budget,sources),
    readPostGrid: navigation ? args => readPostGrid(ctx,args,expectedScope,String(navigation.document._id),budget,sources) : undefined,
    readUpcomingEvents: args => readUpcomingEvents(ctx,args,budget,sources),
    readNextEvent: args => readNextEvent(ctx,args,budget,sources),
    readCalendar: navigation ? args => readCalendar(ctx,args,expectedScope,String(navigation.document._id),budget,sources) : undefined,
    readTags: navigation ? args => readTagCloud(ctx,args,expectedScope,String(navigation.document._id),budget,sources) : undefined,
    readForm: navigation ? args => readForm(ctx,args,budget,sourcePassword) : undefined,
    readContact: navigation ? args => readContact(ctx,args,navigation,budget,sourcePassword,composed) : undefined,
    readPoll: navigation ? args => readPoll(ctx,args,navigation,budget,sourcePassword,composed) : undefined,
    readProducts: navigation ? args => readFeaturedProducts(ctx,args,budget,sources) : undefined,
    readCollection: navigation ? args => readProductCollection(ctx,args,budget,sources,{recentlyViewedIds}) : undefined,
    readCategories: navigation ? args => readCategoryTiles(ctx,args,budget,sources,Date.now(),{scope:expectedScope,documentId:String(navigation.document._id)}) : undefined,
    readShowcase: navigation ? args => readProductShowcase(ctx,args,budget,sources) : undefined,
    readRecipe: navigation ? args => readRecipe(ctx,args,budget,sources) : undefined,
    readShippingPolicy: navigation ? args => readShippingPolicy(ctx,args,budget) : undefined,
    readBrands: navigation ? args => readBrands(ctx,args,budget) : undefined,
    readMembershipAccess: navigation ? args => readMembershipAccess(ctx,args,budget) : undefined,
    readMembershipPlans: navigation ? args => readMembershipPlans(ctx,args,expectedScope,String(navigation.document._id),budget) : undefined,
    readCourses: navigation ? args => readCourses(ctx,args,expectedScope,String(navigation.document._id),budget) : undefined,
    readCertificateAvailability: navigation ? async () => ({available:await isPluginEnabled(ctx,"lms",budget)}) : undefined,
    readInstructor: navigation ? args=>readInstructor(ctx,args,expectedScope,String(navigation.document._id),budget) : undefined,
    readLearnerProgress: navigation ? args=>readLearnerProgress(ctx,args,expectedScope,String(navigation.document._id),budget) : undefined,
    readCurriculum: navigation ? args=>readCurriculum(ctx,args,expectedScope,String(navigation.document._id),budget) : undefined,
    readTicketCta: navigation ? ()=>readTicketCta(ctx,budget) : undefined,
    readKnowledgeSearch: navigation ? args=>readKnowledgeSearch(ctx,args,budget) : undefined,
    readAlbum: navigation ? args=>readAlbum(ctx,args,expectedScope,String(navigation.document._id),budget,sources) : undefined,
    readRelated: navigation ? args=>readRelatedContent(ctx,args,expectedScope,navigation.document,budget,sources) : undefined,
    readArchive: navigation ? args=>readDateArchiveGroups(ctx,args,expectedScope,String(navigation.document._id),budget,sources) : undefined,
    readLocales: navigation ? ()=>readLocaleDestinations(ctx,navigation.document,budget,sources) : undefined,
    readRsvp: navigation ? args=>readEventRsvp(ctx,args,expectedScope,navigation,budget,sourcePassword,composed) : undefined,
    readProductOptions: navigation ? args=>readProductOptions(ctx,args,budget,sources) : undefined,
    readReviews: navigation ? args=>readReviews(ctx,args,expectedScope,String(navigation.document._id),budget,sources) : undefined,
    readProductCompare: navigation ? args=>readProductCompare(ctx,args,budget,sources) : undefined,
    readBundleOffer: navigation ? args=>readBundleOffer(ctx,args,budget) : undefined,
    readSearch: navigation ? args=>readSearch(ctx,args,expectedScope,String(navigation.document._id),budget) : undefined,
    readTaggedMedia: navigation ? args=>readTaggedMedia(ctx,args,expectedScope,String(navigation.document._id),budget) : undefined,
    readLeadMagnet: navigation ? args=>readLeadMagnet(ctx,args,navigation,budget,sourcePassword,composed) : undefined,
    readSocialFeed: navigation ? args=>readSocialFeed(ctx,args,budget) : undefined,
  }, composed, request);
}
