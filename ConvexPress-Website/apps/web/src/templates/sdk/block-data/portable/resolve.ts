import {socialFeedResultSchema,socialFeedMatchesArgs,type SocialFeedArgs} from "./socialFeedContracts";
import {leadMagnetResultSchema,leadMagnetMatchesArgs,type LeadMagnetArgs} from "./leadMagnetContracts";
import {taggedMediaResultSchema,taggedMediaMatchesArgs,type TaggedMediaArgs} from "./taggedMediaContracts";
import {searchResultSchema,searchMatchesArgs,type SearchArgs} from "./searchContracts";
import { bundleOfferResultSchema, bundleOfferMatchesArgs, type BundleOfferArgs } from "./bundleOfferContracts";
import {productCompareResultSchema,productCompareMatchArgs,type ProductCompareArgs} from "./productCompareContracts";
import {reviewsResultSchema,reviewsMatchArgs,type ReviewsArgs} from "./reviewsContracts";
import { productOptionsResultSchema, productOptionsMatchArgs, type ProductOptionsArgs } from "./productOptionsContracts";
import {rsvpResultSchema,rsvpMatchesArgs,type RsvpArgs} from "./rsvpContracts";
import {localeResultSchema} from "./localeContracts";
import {archiveResultSchema,archiveMatchesArgs,type ArchiveArgs} from "./archiveContracts";
import {relatedResultSchema,relatedMatchesArgs,type RelatedArgs} from "./relatedContracts";
import {knowledgeSearchResultSchema,knowledgeSearchMatchesArgs,type KnowledgeSearchArgs} from "./knowledgeBaseContracts";
import {ticketCtaResultSchema} from "./supportContracts";
import {curriculumResultSchema,curriculumMatchesArgs,type CurriculumArgs} from "./curriculumContracts";
import {learnerProgressResultSchema,learnerProgressMatchesArgs,type LearnerProgressArgs} from "./learnerProgressContracts";
import {instructorResultSchema,instructorMatchesArgs,type InstructorArgs} from "./instructorContracts";
import {certificateAvailabilitySchema} from "./certificateContracts";
import {courseGridResultSchema,coursesMatchArgs,type CourseGridArgs} from "./courseContracts";
import {membershipPlansResultSchema,membershipPlansMatchArgs,type MembershipPlansArgs} from "./membershipPlanContracts";
import {membershipAccessResultSchema,membershipAccessMatchesArgs,type MembershipAccessArgs} from "./membershipContracts";
import {brandResultSchema,brandsMatchArgs,type BrandArgs} from "./brandContracts";
import {shippingPolicyResultSchema,type ShippingPolicyArgs} from "./shippingPolicyContracts";
import {albumResultSchema,albumMatchesArgs,type AlbumArgs} from "./albumContracts";
import {recipeResultSchema,recipeMatchesArgs,type RecipeArgs} from "./recipeContracts";
import {productShowcaseResultSchema,productShowcaseMatchArgs,type ProductShowcaseArgs} from "./productShowcaseContracts";
import { categoryTilesResultSchema, categoryTilesMatchArgs, type CategoryTilesArgs } from "./categoryTilesContracts";
import { productCollectionMatchArgs, productCollectionResultSchema, type ProductCollectionArgs } from "./productCollectionContracts";
import { featuredProductsMatchArgs, featuredProductsResultSchema, type FeaturedProductsArgs } from "./productContracts";
import { pollMatchesArgs, pollResultSchema, type PollArgs } from "./pollDataContracts";
import { contactMatchesArgs, contactResultSchema, type ContactArgs } from "./contactDataContracts";
import { formMatchesArgs, formResultSchema, type FormArgs } from "./formContracts";
import { tagCloudMatchesArgs, tagCloudResultSchema, type TagCloudArgs } from "./tagCloudContracts";
import {calendarMatchesArgs,calendarResultSchema,type CalendarArgs} from "./calendarContracts";
import {nextEventMatchesArgs,nextEventResultSchema,type NextEventArgs} from "./eventContracts";
import {upcomingEventsMatchArgs,upcomingEventsResultSchema,type UpcomingEventsArgs} from "./eventContracts";
import { blockPageRequestSchema, postGridResultSchema, postGridMatchesArgs, type BlockPageRequest, type PostGridArgs } from "./postGridContracts";
import { z } from "zod";
import { latestPostsMatchArgs, latestPostsResultSchema, type LatestPostsArgs } from "./postContracts";
import {navigationResultSchemas, type NavigationResolver} from "./navigationContracts";
import { planCanonicalData, type ComposedDataContext } from "./planner";
import {
	CanonicalDataError,
	DATA_LIMITS,
	scopeSchema,
	pageResultSchema,
 resolverResults,
 type DataEntry,
	encodedBytes,
	stableKey,
	type DataEnvelope,
	type DataScope,
	type PageArgs,
	type ResolverPolicy,
} from "./contracts";
const entryBase = {blockName:z.string(),blockVersion:z.number().int(),bindingKey:z.string()};
const entrySchema = z.discriminatedUnion("resolver", [
 z.strictObject({...entryBase,resolver:z.literal("social.feed"),data:socialFeedResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("forms.leadMagnet"),data:leadMagnetResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("media.tagged"),data:taggedMediaResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.productOptions"),data:productOptionsResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("events.event"),data:rsvpResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("site.locales"),data:localeResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("content.archive"),data:archiveResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("content.related"),data:relatedResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("gallery.album"),data:albumResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("support.search"),data:knowledgeSearchResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("support.form"),data:ticketCtaResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("lms.curriculum"),data:curriculumResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("lms.progress"),data:learnerProgressResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("lms.instructor"),data:instructorResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("certificates.verify"),data:certificateAvailabilitySchema}),
 z.strictObject({...entryBase,resolver:z.literal("lms.courses"),data:courseGridResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("membership.plans"),data:membershipPlansResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("membership.access"),data:membershipAccessResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("site.viewer"),data:navigationResultSchemas["site.viewer"]}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.brands"),data:brandResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.shippingPolicy"),data:shippingPolicyResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("recipes.recipe"),data:recipeResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("content.search"),data:searchResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.bundle"),data:bundleOfferResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.productCompare"),data:productCompareResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.reviews"),data:reviewsResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.productShowcase"),data:productShowcaseResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.categoryTiles"),data:categoryTilesResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.productCollection"),data:productCollectionResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("commerce.featuredProducts"),data:featuredProductsResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("forms.poll"),data:pollResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("forms.contact"),data:contactResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("forms.form"),data:formResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("content.tags"),data:tagCloudResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("events.list"),data:calendarResultSchema}),
 z.strictObject({...entryBase,resolver:z.literal("events.next"),data:nextEventResultSchema}),
 z.object({...entryBase,resolver:z.literal("events.upcoming"),data:upcomingEventsResultSchema}).strict(),
 z.object({...entryBase,resolver:z.literal("content.posts"),data:postGridResultSchema}).strict(),
 z.object({...entryBase,resolver:z.literal("content.latestPosts"),data:latestPostsResultSchema}).strict(),
 z.object({...entryBase,resolver:z.literal("site.menu"),data:navigationResultSchemas["site.menu"]}).strict(),
 z.object({...entryBase,resolver:z.literal("content.childPages"),data:navigationResultSchemas["content.childPages"]}).strict(),
 z.object({...entryBase,resolver:z.literal("content.page"),data:pageResultSchema}).strict(),
 z.object({...entryBase,resolver:z.literal("content.breadcrumbs"),data:navigationResultSchemas["content.breadcrumbs"]}).strict(),
 z.object({...entryBase,resolver:z.literal("content.anchors"),data:navigationResultSchemas["content.anchors"]}).strict(),
 z.object({...entryBase,resolver:z.literal("content.headings"),data:navigationResultSchemas["content.headings"]}).strict(),
 z.object({...entryBase,resolver:z.literal("site.info"),data:navigationResultSchemas["site.info"]}).strict(),
]);
export const canonicalDataEnvelopeSchema = z
	.object({
		contract: z.literal("canonical-data-v1"),
		scope: scopeSchema,
    request: blockPageRequestSchema.optional(),
    definitionsDigest: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
		dataByBlock: z.record(z.string(), entrySchema),
	})
	.strict();
/** A reader is a server dependency, never request data or a function reference. */
export interface CanonicalDataReaders {
  readPage: (args: PageArgs) => Promise<unknown>;
  readNavigation?: (resolver: NavigationResolver, args: unknown) => Promise<unknown>;
  readPosts?: (args: LatestPostsArgs) => Promise<unknown>;
  readPostGrid?: (args: PostGridArgs) => Promise<unknown>;
  readUpcomingEvents?: (args: UpcomingEventsArgs) => Promise<unknown>;
  readNextEvent?: (args:NextEventArgs)=>Promise<unknown>;
  readCalendar?: (args:CalendarArgs)=>Promise<unknown>;
  readTags?: (args:TagCloudArgs)=>Promise<unknown>;
  readForm?: (args:FormArgs)=>Promise<unknown>;
  readContact?: (args:ContactArgs)=>Promise<unknown>;
  readPoll?: (args:PollArgs)=>Promise<unknown>;
  readProducts?: (args:FeaturedProductsArgs)=>Promise<unknown>;
  readCollection?: (args:ProductCollectionArgs)=>Promise<unknown>;
  readCategories?: (args:CategoryTilesArgs)=>Promise<unknown>;
  readShowcase?: (args:ProductShowcaseArgs)=>Promise<unknown>;
  readRecipe?: (args:RecipeArgs)=>Promise<unknown>;
  readShippingPolicy?: (args:ShippingPolicyArgs)=>Promise<unknown>;
  readBrands?: (args:BrandArgs)=>Promise<unknown>;
  readMembershipAccess?: (args:MembershipAccessArgs)=>Promise<unknown>;
  readMembershipPlans?: (args:MembershipPlansArgs)=>Promise<unknown>;
  readCourses?: (args:CourseGridArgs)=>Promise<unknown>;
  readCertificateAvailability?: ()=>Promise<unknown>;
  readInstructor?: (args:InstructorArgs)=>Promise<unknown>;
  readLearnerProgress?: (args:LearnerProgressArgs)=>Promise<unknown>;
  readCurriculum?: (args:CurriculumArgs)=>Promise<unknown>;
  readTicketCta?: ()=>Promise<unknown>;
  readKnowledgeSearch?: (args:KnowledgeSearchArgs)=>Promise<unknown>;
  readAlbum?: (args:AlbumArgs)=>Promise<unknown>;
  readRelated?: (args:RelatedArgs)=>Promise<unknown>;
  readArchive?: (args:ArchiveArgs)=>Promise<unknown>;
  readLocales?: ()=>Promise<unknown>;
  readRsvp?: (args:RsvpArgs)=>Promise<unknown>;
  readProductOptions?: (args:ProductOptionsArgs)=>Promise<unknown>;
  readReviews?: (args:ReviewsArgs)=>Promise<unknown>;
  readProductCompare?: (args:ProductCompareArgs)=>Promise<unknown>;
  readBundleOffer?: (args:BundleOfferArgs)=>Promise<unknown>;
  readSearch?: (args:SearchArgs)=>Promise<unknown>;
  readTaggedMedia?: (args:TaggedMediaArgs)=>Promise<unknown>;
  readLeadMagnet?: (args:LeadMagnetArgs)=>Promise<unknown>;
  readSocialFeed?: (args:SocialFeedArgs)=>Promise<unknown>;
}
export async function resolveCanonicalData(
	tree: unknown,
	scope: DataScope,
	policy: ResolverPolicy,
	readPage: (args: PageArgs) => Promise<unknown>,
 readNavigation?: (resolver: NavigationResolver, args: unknown) => Promise<unknown>,
 readPosts?: (args: LatestPostsArgs) => Promise<unknown>,
 readPostGrid?: (args: PostGridArgs) => Promise<unknown>,
 request: BlockPageRequest = {},
 readUpcomingEvents?: (args: UpcomingEventsArgs) => Promise<unknown>,
 readNextEvent?: (args:NextEventArgs)=>Promise<unknown>,
 readCalendar?: (args:CalendarArgs)=>Promise<unknown>,
 readTags?: (args:TagCloudArgs)=>Promise<unknown>,
 readForm?: (args:FormArgs)=>Promise<unknown>,
 readContact?: (args:ContactArgs)=>Promise<unknown>,
 readPoll?: (args:PollArgs)=>Promise<unknown>,
 readProducts?: (args:FeaturedProductsArgs)=>Promise<unknown>,
 readCollection?: (args:ProductCollectionArgs)=>Promise<unknown>,
 readCategories?: (args:CategoryTilesArgs)=>Promise<unknown>,
 readShowcase?: (args:ProductShowcaseArgs)=>Promise<unknown>,
 readRecipe?: (args:RecipeArgs)=>Promise<unknown>,
 readShippingPolicy?: (args:ShippingPolicyArgs)=>Promise<unknown>,
 readBrands?: (args:BrandArgs)=>Promise<unknown>,
 readMembershipAccess?: (args:MembershipAccessArgs)=>Promise<unknown>,
 readMembershipPlans?: (args:MembershipPlansArgs)=>Promise<unknown>,
 readCourses?: (args:CourseGridArgs)=>Promise<unknown>,
 readCertificateAvailability?: ()=>Promise<unknown>,
 readInstructor?: (args:InstructorArgs)=>Promise<unknown>,
 readLearnerProgress?: (args:LearnerProgressArgs)=>Promise<unknown>,
 readCurriculum?: (args:CurriculumArgs)=>Promise<unknown>,
 readTicketCta?: ()=>Promise<unknown>,
 readKnowledgeSearch?: (args:KnowledgeSearchArgs)=>Promise<unknown>,
 readAlbum?: (args:AlbumArgs)=>Promise<unknown>,
 readRelated?: (args:RelatedArgs)=>Promise<unknown>,
 readArchive?: (args:ArchiveArgs)=>Promise<unknown>,
 readLocales?: ()=>Promise<unknown>,
 readRsvp?: (args:RsvpArgs)=>Promise<unknown>,
 readProductOptions?: (args:ProductOptionsArgs)=>Promise<unknown>,
 readReviews?: (args:ReviewsArgs)=>Promise<unknown>,
 readProductCompare?: (args:ProductCompareArgs)=>Promise<unknown>,
 readBundleOffer?: (args:BundleOfferArgs)=>Promise<unknown>,
 readSearch?: (args:SearchArgs)=>Promise<unknown>,
 readTaggedMedia?: (args:TaggedMediaArgs)=>Promise<unknown>,
 readLeadMagnet?: (args:LeadMagnetArgs)=>Promise<unknown>,
 readSocialFeed?: (args:SocialFeedArgs)=>Promise<unknown>,
): Promise<DataEnvelope> {
  return resolveCanonicalDataWithDefinitions(tree, scope, policy, { readPage, readNavigation, readPosts, readPostGrid, readUpcomingEvents, readNextEvent, readCalendar, readTags, readForm, readContact, readPoll, readProducts, readCollection, readCategories, readShowcase, readRecipe, readShippingPolicy, readBrands, readMembershipAccess, readMembershipPlans, readCourses, readCertificateAvailability, readInstructor, readLearnerProgress, readCurriculum, readTicketCta, readKnowledgeSearch, readAlbum, readRelated, readArchive, readLocales, readRsvp, readProductOptions, readReviews, readProductCompare, readBundleOffer, readSearch, readTaggedMedia, readLeadMagnet, readSocialFeed }, undefined, request);
}

/** Shared evaluator for exact definition-bound data; readers remain host-owned. */
export async function resolveCanonicalDataWithDefinitions(
  tree: unknown, scope: DataScope, policy: ResolverPolicy, readers: CanonicalDataReaders,
  composed?: ComposedDataContext, request: BlockPageRequest = {},
): Promise<DataEnvelope> {
  const { readPage, readNavigation, readPosts, readPostGrid, readUpcomingEvents, readNextEvent, readCalendar, readTags, readForm, readContact, readPoll, readProducts, readCollection, readCategories, readShowcase, readRecipe, readShippingPolicy, readBrands, readMembershipAccess, readMembershipPlans, readCourses, readCertificateAvailability, readInstructor, readLearnerProgress, readCurriculum, readTicketCta, readKnowledgeSearch, readAlbum, readRelated, readArchive, readLocales, readRsvp, readProductOptions, readReviews, readProductCompare, readBundleOffer, readSearch, readTaggedMedia, readLeadMagnet, readSocialFeed } = readers;
	const plan = planCanonicalData(tree, scope, policy, request, composed);
  if (!readSocialFeed && plan.jobs.some(job=>job.resolver==="social.feed")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted social feed reader is required before data reads");
  if (!readLeadMagnet && plan.jobs.some(job=>job.resolver==="forms.leadMagnet")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted lead magnet reader is required before data reads");
  if (!readTaggedMedia && plan.jobs.some(job=>job.resolver==="media.tagged")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted community-image reader is required before data reads");
  if (!readSearch && plan.jobs.some(job=>job.resolver==="content.search")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted search reader is required before data reads");
  if (!readBundleOffer && plan.jobs.some(job=>job.resolver==="commerce.bundle")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted bundle reader is required before data reads");
  if (!readProductCompare && plan.jobs.some(job=>job.resolver==="commerce.productCompare")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted product comparison reader is required before data reads");
  if (!readReviews && plan.jobs.some(job=>job.resolver==="commerce.reviews")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted reviews reader is required before data reads");
  if (!readProductOptions && plan.jobs.some(job=>job.resolver==="commerce.productOptions")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted product options reader is required before data reads");
  if (!readRsvp && plan.jobs.some(job=>job.resolver==="events.event")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted RSVP reader is required before data reads");
  if (!readLocales && plan.jobs.some(job=>job.resolver==="site.locales")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted language reader is required before data reads");
  if (!readArchive && plan.jobs.some(job=>job.resolver==="content.archive")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted archive reader is required before data reads");
  if (!readRelated && plan.jobs.some(job=>job.resolver==="content.related")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted related content reader is required before data reads");
  if (!readAlbum && plan.jobs.some(job=>job.resolver==="gallery.album")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted album reader is required before data reads");
  if (!readKnowledgeSearch && plan.jobs.some(job=>job.resolver==="support.search")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted knowledge-base reader is required before data reads");
  if (!readTicketCta && plan.jobs.some(job=>job.resolver==="support.form")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted support reader is required before data reads");
  if (!readCurriculum && plan.jobs.some(job=>job.resolver==="lms.curriculum")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted curriculum reader is required before data reads");
  if (!readLearnerProgress && plan.jobs.some(job=>job.resolver==="lms.progress")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted learner progress reader is required before data reads");
  if (!readInstructor && plan.jobs.some(job=>job.resolver==="lms.instructor")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted instructor reader is required before data reads");
  if (!readCertificateAvailability && plan.jobs.some(job=>job.resolver==="certificates.verify")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted certificate reader is required before data reads");
  if (!readNavigation && plan.jobs.some(job => job.resolver !== "social.feed" && job.resolver !== "forms.leadMagnet" && job.resolver !== "media.tagged" && job.resolver !== "content.search" && job.resolver !== "commerce.bundle" && job.resolver !== "commerce.productCompare" && job.resolver !== "commerce.reviews" && job.resolver !== "commerce.productOptions" && job.resolver !== "events.event" && job.resolver !== "site.locales" && job.resolver !== "content.archive" && job.resolver !== "content.related" && job.resolver !== "gallery.album" && job.resolver !== "support.search" && job.resolver !== "support.form" && job.resolver !== "lms.curriculum" && job.resolver !== "lms.progress" && job.resolver !== "lms.instructor" && job.resolver !== "certificates.verify" && job.resolver !== "lms.courses" && job.resolver !== "membership.plans" && job.resolver !== "membership.access" && job.resolver !== "content.page" && job.resolver !== "content.latestPosts" && job.resolver !== "content.posts" && job.resolver !== "events.upcoming" && job.resolver !== "events.next" && job.resolver !== "events.list" && job.resolver !== "content.tags" && job.resolver !== "forms.form" && job.resolver !== "forms.contact" && job.resolver !== "forms.poll" && job.resolver !== "commerce.featuredProducts" && job.resolver !== "commerce.productCollection" && job.resolver !== "commerce.categoryTiles" && job.resolver !== "commerce.productShowcase" && job.resolver !== "recipes.recipe" && job.resolver !== "commerce.shippingPolicy" && job.resolver !== "commerce.brands")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted navigation reader is required before data reads");
  if (!readBrands && plan.jobs.some(job=>job.resolver === "commerce.brands")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted brand reader is required before data reads");
  if (!readShippingPolicy && plan.jobs.some(job=>job.resolver==="commerce.shippingPolicy")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted shipping policy reader is required before data reads");
  if (!readRecipe && plan.jobs.some(job=>job.resolver==="recipes.recipe")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted recipe reader is required before data reads");
  if (!readShowcase && plan.jobs.some(job=>job.resolver==="commerce.productShowcase")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted showcase reader is required before data reads");
  if (!readCategories && plan.jobs.some(job=>job.resolver === "commerce.categoryTiles")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted category reader is required before data reads");
  if (!readCollection && plan.jobs.some(job => job.resolver === "commerce.productCollection")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted product collection reader is required before data reads");
  if (!readProducts && plan.jobs.some(job => job.resolver === "commerce.featuredProducts")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted product reader is required before data reads");
  if (!readPosts && plan.jobs.some(job => job.resolver === "content.latestPosts")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted post reader is required before data reads");
	if (!readPostGrid && plan.jobs.some(job => job.resolver === "content.posts")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted Post Grid reader is required before data reads");
	if (!readUpcomingEvents && plan.jobs.some(job=>job.resolver === "events.upcoming")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted events reader is required before data reads");
  if (!readCalendar && plan.jobs.some(job=>job.resolver === "events.list")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted Calendar reader is required before data reads");
	if (!readNextEvent && plan.jobs.some(job=>job.resolver === "events.next")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted Next Event reader is required before data reads");
  if (!readTags && plan.jobs.some(job => job.resolver === "content.tags")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted topic reader is required before data reads");
	if (!readForm && plan.jobs.some(job => job.resolver === "forms.form")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted form reader is required before data reads");
  if (!readContact && plan.jobs.some(job => job.resolver === "forms.contact")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted contact reader is required before data reads");
  if (!readPoll && plan.jobs.some(job => job.resolver === "forms.poll")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER", "tree", "Trusted poll reader is required before data reads");
  if (!readMembershipAccess && plan.jobs.some(job=>job.resolver==="membership.access")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted membership reader is required before data reads");
	if (!readMembershipPlans && plan.jobs.some(job=>job.resolver==="membership.plans")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted membership plan reader is required before data reads");
	if (!readCourses && plan.jobs.some(job=>job.resolver==="lms.courses")) throw new CanonicalDataError("UNSUPPORTED_RESOLVER","tree","Trusted course reader is required before data reads");
	const results = new Map<string, DataEntry["data"]>();
	for (const job of plan.jobs) {
    const raw = job.resolver === "social.feed" ? await readSocialFeed!(job.args) : job.resolver === "forms.leadMagnet" ? await readLeadMagnet!(job.args) : job.resolver === "media.tagged" ? await readTaggedMedia!(job.args) : job.resolver === "content.search" ? await readSearch!(job.args) : job.resolver === "commerce.bundle" ? await readBundleOffer!(job.args) : job.resolver === "commerce.productCompare" ? await readProductCompare!(job.args) : job.resolver === "commerce.reviews" ? await readReviews!(job.args) : job.resolver === "commerce.productOptions" ? await readProductOptions!(job.args) : job.resolver === "events.event" ? await readRsvp!(job.args) : job.resolver === "site.locales" ? await readLocales!() : job.resolver === "content.archive" ? await readArchive!(job.args) : job.resolver === "content.related" ? await readRelated!(job.args) : job.resolver === "gallery.album" ? await readAlbum!(job.args) : job.resolver === "support.search" ? await readKnowledgeSearch!(job.args) : job.resolver === "support.form" ? await readTicketCta!() : job.resolver === "lms.curriculum" ? await readCurriculum!(job.args) : job.resolver === "lms.progress" ? await readLearnerProgress!(job.args) : job.resolver === "lms.instructor" ? await readInstructor!(job.args) : job.resolver === "certificates.verify" ? await readCertificateAvailability!() : job.resolver === "lms.courses" ? await readCourses!(job.args) : job.resolver === "membership.plans" ? await readMembershipPlans!(job.args) : job.resolver === "membership.access" ? await readMembershipAccess!(job.args) : job.resolver === "commerce.brands" ? await readBrands!(job.args) : job.resolver === "commerce.shippingPolicy" ? await readShippingPolicy!(job.args) : job.resolver === "recipes.recipe" ? await readRecipe!(job.args) : job.resolver === "commerce.productShowcase" ? await readShowcase!(job.args) : job.resolver === "commerce.categoryTiles" ? await readCategories!(job.args) : job.resolver === "commerce.productCollection" ? await readCollection!(job.args) : job.resolver === "commerce.featuredProducts" ? await readProducts!(job.args) : job.resolver === "forms.poll" ? await readPoll!(job.args) : job.resolver === "forms.contact" ? await readContact!(job.args) : job.resolver === "forms.form" ? await readForm!(job.args) : job.resolver === "content.tags" ? await readTags!(job.args) : job.resolver === "events.list" ? await readCalendar!(job.args) : job.resolver === "events.next" ? await readNextEvent!(job.args) : job.resolver === "events.upcoming" ? await readUpcomingEvents!(job.args) : job.resolver === "content.posts" ? await readPostGrid!(job.args) : job.resolver === "content.page" ? await readPage(job.args) : job.resolver === "content.latestPosts" ? await readPosts!(job.args) : await readNavigation!(job.resolver,job.args);
		if (encodedBytes(raw) > DATA_LIMITS.resultBytes)
			throw new CanonicalDataError(
				"RESULT_BUDGET",
				job.key,
				"Resolver result exceeds 60KiB",
			);
		const parsed = resolverResults[job.resolver].safeParse(raw);
		if (!parsed.success)
			throw new CanonicalDataError(
				"INVALID_RESOLVER_RESULT",
				job.key,
				"Resolver returned an unsupported public DTO",
			);
		if (job.resolver === "content.page" && "page" in parsed.data && parsed.data.page && parsed.data.page.id !== job.args.page)
			throw new CanonicalDataError(
				"RESULT_TARGET_MISMATCH",
				job.key,
				"Resolver returned a different resource",
			);
    if (job.resolver === "content.childPages" && "parentLabel" in parsed.data && parsed.data.items.some(item => item.depth > job.args.depth))
      throw new CanonicalDataError("RESULT_TARGET_MISMATCH", job.key, "Child-page result exceeds the selected depth");
    if (job.resolver === "site.menu" && "menu" in parsed.data && parsed.data.menu && job.args.source === "menu" && parsed.data.menu.id !== job.args.menu)
      throw new CanonicalDataError("RESULT_TARGET_MISMATCH", job.key, "Menu result does not match the selected menu");
    if(job.resolver === "events.list" && !calendarMatchesArgs(job.args,calendarResultSchema.parse(parsed.data)))throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Calendar does not match its selected window or filters");
    if(job.resolver === "events.next" && !nextEventMatchesArgs(job.args,nextEventResultSchema.parse(parsed.data)))throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Next Event does not match the selected category");
    if (job.resolver === "events.upcoming" && !upcomingEventsMatchArgs(job.args,upcomingEventsResultSchema.parse(parsed.data)))
      throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Events do not match the selected count or disclosure settings");
    if (job.resolver === "commerce.brands" && !brandsMatchArgs(job.args,brandResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Brand list exceeds its saved limit");
    if (job.resolver === "content.archive" && !archiveMatchesArgs(job.args,archiveResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Archive result must match grouping, limit and page");
    if (job.resolver === "content.related" && !relatedMatchesArgs(job.args,relatedResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Related content result must match type, limit and page");
    if (job.resolver === "gallery.album" && !albumMatchesArgs(job.args,albumResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Album result must match the saved album and page");
    if (job.resolver === "recipes.recipe" && !recipeMatchesArgs(job.args,recipeResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Recipe result must match the saved recipe");
    if (job.resolver === "social.feed" && !socialFeedMatchesArgs(job.args,socialFeedResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Social feed does not match its approved account request");
    if (job.resolver === "forms.leadMagnet" && !leadMagnetMatchesArgs(job.args,leadMagnetResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Lead magnet does not match its source block");
    if (job.resolver === "media.tagged" && !taggedMediaMatchesArgs(job.args,taggedMediaResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Community images do not match their current request");
    if (job.resolver === "content.search" && !searchMatchesArgs(job.args,searchResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Search does not match its current request");
    if (job.resolver === "commerce.bundle" && !bundleOfferMatchesArgs(job.args,bundleOfferResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Bundle does not match its saved selection");
    if (job.resolver === "commerce.productCompare" && !productCompareMatchArgs(job.args,productCompareResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Product comparison does not match its saved selection");
    if (job.resolver === "commerce.reviews" && !reviewsMatchArgs(job.args,reviewsResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Review result does not match saved selection or page");
    if (job.resolver === "commerce.productShowcase" && !productShowcaseMatchArgs(job.args,productShowcaseResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH",job.key,"Showcase result does not match saved selection or disclosures");
    if (job.resolver === "commerce.categoryTiles" && !categoryTilesMatchArgs(job.args, categoryTilesResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_BINDING_MISMATCH", job.key, "Category result does not match saved selection or disclosures");
    if (job.resolver === "commerce.productCollection" && !productCollectionMatchArgs(job.args, productCollectionResultSchema.parse(parsed.data)))
      throw new CanonicalDataError("INVALID_RESOLVER_RESULT", job.key, "Product collection does not match its saved selection");
    if (job.resolver === "commerce.featuredProducts" && !featuredProductsMatchArgs(job.args, featuredProductsResultSchema.parse(parsed.data)))
      throw new CanonicalDataError("RESULT_TARGET_MISMATCH", job.key, "Products do not match the saved selection");
    if (job.resolver === "content.posts" && !postGridMatchesArgs(job.args, postGridResultSchema.parse(parsed.data)))
      throw new CanonicalDataError("RESULT_TARGET_MISMATCH", job.key, "Post Grid results do not match the selected page or disclosure settings");
    if (job.resolver === "content.tags" && !tagCloudMatchesArgs(job.args,tagCloudResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Topics do not match the selected page or limit");
		if (job.resolver === "forms.form" && !formMatchesArgs(job.args, formResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH", job.key, "Form does not match the selected resource");
    if (job.resolver === "forms.contact" && !contactMatchesArgs(job.args, contactResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH", job.key, "Contact form does not match the source block");
    if (job.resolver === "commerce.productOptions" && !productOptionsMatchArgs(job.args,productOptionsResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Product options do not match saved selection");
    if (job.resolver === "events.event" && !rsvpMatchesArgs(job.args,rsvpResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"RSVP does not match the source block and event");
    if (job.resolver === "forms.poll" && !pollMatchesArgs(job.args, pollResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH", job.key, "Poll does not match the source block");
    if (job.resolver==="support.search" && !knowledgeSearchMatchesArgs(job.args,knowledgeSearchResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Knowledge-base category mismatch");
    if (job.resolver==="lms.curriculum" && !curriculumMatchesArgs(job.args,curriculumResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Curriculum target mismatch");
    if (job.resolver==="lms.progress" && !learnerProgressMatchesArgs(job.args,learnerProgressResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Learner progress target mismatch");
    if (job.resolver==="lms.instructor" && !instructorMatchesArgs(job.args,instructorResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Instructor target mismatch");
    if (job.resolver==="lms.courses" && !coursesMatchArgs(job.args,courseGridResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Courses do not match the cursor or page size");
    if (job.resolver==="membership.plans" && !membershipPlansMatchArgs(job.args,membershipPlansResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Membership plans do not match the selection or cursor");
    if (job.resolver==="membership.access" && !membershipAccessMatchesArgs(job.args,membershipAccessResultSchema.parse(parsed.data))) throw new CanonicalDataError("RESULT_TARGET_MISMATCH",job.key,"Membership result does not match the required plan");
		results.set(job.key, parsed.data);
    if (job.resolver === "content.latestPosts" && !latestPostsMatchArgs(job.args, latestPostsResultSchema.parse(parsed.data)))
      throw new CanonicalDataError("RESULT_TARGET_MISMATCH", job.key, "Post results do not match the selected count or disclosure settings");
	}
	const dataByBlock: DataEnvelope["dataByBlock"] = Object.create(null);
	for (const binding of plan.bindings)
		dataByBlock[binding.blockId] = {
			blockName: binding.blockName,
			blockVersion: binding.blockVersion,
			resolver: binding.resolver,
			bindingKey: binding.bindingKey,
			data: structuredClone(results.get(binding.bindingKey)!),
		} as DataEntry;
	const envelope: DataEnvelope = {
		contract: "canonical-data-v1",
		scope: plan.scope,
    ...(Object.keys(plan.request).length ? { request: plan.request } : {}),
    ...(plan.definitionsDigest ? { definitionsDigest: plan.definitionsDigest } : {}),
		dataByBlock,
	};
	if (encodedBytes(envelope) > DATA_LIMITS.outputBytes)
		throw new CanonicalDataError(
			"OUTPUT_BUDGET",
			"dataByBlock",
			"Page data exceeds 512KiB",
		);
	return envelope;
}
/** Consumer trust gate: recompute the exact authorized tree/definition binding. */
export function validateCanonicalData(
	tree: unknown,
	scope: DataScope,
	policy: ResolverPolicy,
	value: unknown,
 request: BlockPageRequest = {},
 composed?: ComposedDataContext,
): DataEnvelope {
	const plan = planCanonicalData(tree, scope, policy, request, composed);
	if (encodedBytes(value) > DATA_LIMITS.outputBytes)
		throw new CanonicalDataError(
			"OUTPUT_BUDGET",
			"dataByBlock",
			"Page data exceeds 512KiB",
		);
	const parsed = canonicalDataEnvelopeSchema.safeParse(value);
	if (!parsed.success)
		throw new CanonicalDataError(
			"INVALID_DATA_ENVELOPE",
			"dataByBlock",
			"Invalid canonical page data envelope",
		);
	if (parsed.data.definitionsDigest !== plan.definitionsDigest)
    throw new CanonicalDataError("DEFINITION_BINDING_MISMATCH", "definitions", "Data belongs to another exact definition snapshot");
	if (stableKey(parsed.data.request ?? {}) !== stableKey(plan.request))
    throw new CanonicalDataError("PAGE_REQUEST_MISMATCH", "request", "Data belongs to another pagination request");
	if (stableKey(parsed.data.scope) !== stableKey(plan.scope))
		throw new CanonicalDataError(
			"SCOPE_MISMATCH",
			"scope",
			"Data belongs to another environment",
		);
	if (Object.keys(parsed.data.dataByBlock).length !== plan.bindings.length)
		throw new CanonicalDataError(
			"BINDING_MISMATCH",
			"dataByBlock",
			"Unexpected or missing block data",
		);
	for (const binding of plan.bindings) {
		const entry = parsed.data.dataByBlock[binding.blockId];
		if (entry && encodedBytes(entry.data) > DATA_LIMITS.resultBytes)
			throw new CanonicalDataError(
				"RESULT_BUDGET",
				binding.blockId,
				"Resolver result exceeds 60KiB",
			);
		if (
			!entry ||
			entry.blockName !== binding.blockName ||
			entry.blockVersion !== binding.blockVersion ||
			entry.resolver !== binding.resolver ||
			entry.bindingKey !== binding.bindingKey ||
			(entry.resolver === "content.page" && binding.resolver === "content.page" && entry.data.page && entry.data.page.id !== binding.args.page)
      || (entry.resolver === "site.menu" && binding.resolver === "site.menu" && entry.data.menu && binding.args.source === "menu" && entry.data.menu.id !== binding.args.menu)
      || (entry.resolver === "commerce.productOptions" && binding.resolver === "commerce.productOptions" && !productOptionsMatchArgs(binding.args,entry.data))
      || (entry.resolver === "events.event" && binding.resolver === "events.event" && !rsvpMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "forms.poll" && binding.resolver === "forms.poll" && !pollMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "forms.contact" && binding.resolver === "forms.contact" && !contactMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "forms.form" && binding.resolver === "forms.form" && !formMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "content.tags" && binding.resolver === "content.tags" && !tagCloudMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "events.list" && binding.resolver === "events.list" && !calendarMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "events.next" && binding.resolver === "events.next" && !nextEventMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "events.upcoming" && binding.resolver === "events.upcoming" && !upcomingEventsMatchArgs(binding.args,entry.data))
      || (entry.resolver === "support.search" && binding.resolver === "support.search" && !knowledgeSearchMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "lms.curriculum" && binding.resolver === "lms.curriculum" && !curriculumMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "lms.progress" && binding.resolver === "lms.progress" && !learnerProgressMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "lms.instructor" && binding.resolver === "lms.instructor" && !instructorMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "lms.courses" && binding.resolver === "lms.courses" && !coursesMatchArgs(binding.args,entry.data))
      || (entry.resolver === "membership.plans" && binding.resolver === "membership.plans" && !membershipPlansMatchArgs(binding.args,entry.data))
      || (entry.resolver === "membership.access" && binding.resolver === "membership.access" && !membershipAccessMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "commerce.brands" && binding.resolver === "commerce.brands" && !brandsMatchArgs(binding.args,entry.data))
      || (entry.resolver === "content.archive" && binding.resolver === "content.archive" && !archiveMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "content.related" && binding.resolver === "content.related" && !relatedMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "gallery.album" && binding.resolver === "gallery.album" && !albumMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "recipes.recipe" && binding.resolver === "recipes.recipe" && !recipeMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "social.feed" && binding.resolver === "social.feed" && !socialFeedMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "forms.leadMagnet" && binding.resolver === "forms.leadMagnet" && !leadMagnetMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "media.tagged" && binding.resolver === "media.tagged" && !taggedMediaMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "content.search" && binding.resolver === "content.search" && !searchMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "commerce.bundle" && binding.resolver === "commerce.bundle" && !bundleOfferMatchesArgs(binding.args,entry.data))
      || (entry.resolver === "commerce.productCompare" && binding.resolver === "commerce.productCompare" && !productCompareMatchArgs(binding.args,entry.data))
      || (entry.resolver === "commerce.reviews" && binding.resolver === "commerce.reviews" && !reviewsMatchArgs(binding.args,entry.data))
      || (entry.resolver === "commerce.productShowcase" && binding.resolver === "commerce.productShowcase" && !productShowcaseMatchArgs(binding.args,entry.data))
      || (entry.resolver === "commerce.categoryTiles" && binding.resolver === "commerce.categoryTiles" && !categoryTilesMatchArgs(binding.args, entry.data))
      || (entry.resolver === "commerce.productCollection" && binding.resolver === "commerce.productCollection" && !productCollectionMatchArgs(binding.args, entry.data))
      || (entry.resolver === "commerce.featuredProducts" && binding.resolver === "commerce.featuredProducts" && !featuredProductsMatchArgs(binding.args, entry.data))
      || (entry.resolver === "content.posts" && binding.resolver === "content.posts" && !postGridMatchesArgs(binding.args, entry.data))
      || (entry.resolver === "content.latestPosts" && binding.resolver === "content.latestPosts" && !latestPostsMatchArgs(binding.args, entry.data))
			|| (entry?.resolver === "content.childPages" && binding.resolver === "content.childPages" && entry.data.items.some(item => item.depth > binding.args.depth))
		)
			throw new CanonicalDataError(
				"BINDING_MISMATCH",
				binding.blockId,
				"Data does not match current canonical attributes",
			);
	}
	return parsed.data;
}
