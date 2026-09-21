import {socialFeedArgsSchema,socialFeedResultSchema} from "./socialFeedContracts";
import {leadMagnetArgsSchema,leadMagnetResultSchema} from "./leadMagnetContracts";
import {taggedMediaArgsSchema,taggedMediaResultSchema} from "./taggedMediaContracts";
import {searchArgsSchema,searchResultSchema} from "./searchContracts";
import { bundleOfferArgsSchema, bundleOfferResultSchema } from "./bundleOfferContracts";
import { productCompareArgsSchema, productCompareResultSchema } from "./productCompareContracts";
import { reviewsArgsSchema, reviewsResultSchema } from "./reviewsContracts";
import { productOptionsArgsSchema, productOptionsResultSchema } from "./productOptionsContracts";
import {rsvpArgsSchema,rsvpResultSchema} from "./rsvpContracts";
import {localeArgsSchema,localeResultSchema} from "./localeContracts";
import {archiveArgsSchema,archiveResultSchema} from "./archiveContracts";
import {relatedArgsSchema,relatedResultSchema} from "./relatedContracts";
import {knowledgeSearchArgsSchema,knowledgeSearchResultSchema} from "./knowledgeBaseContracts";
import {ticketCtaArgsSchema,ticketCtaResultSchema} from "./supportContracts";
import {curriculumArgsSchema,curriculumResultSchema} from "./curriculumContracts";
import {learnerProgressArgsSchema,learnerProgressResultSchema} from "./learnerProgressContracts";
import {instructorArgsSchema,instructorResultSchema} from "./instructorContracts";
import {certificateAvailabilityArgsSchema,certificateAvailabilitySchema} from "./certificateContracts";
import {courseGridArgsSchema,courseGridResultSchema} from "./courseContracts";
import {membershipPlansArgsSchema,membershipPlansResultSchema} from "./membershipPlanContracts";
import {membershipAccessArgsSchema,membershipAccessResultSchema} from "./membershipContracts";
import {brandArgsSchema,brandResultSchema} from "./brandContracts";
import {shippingPolicyArgsSchema,shippingPolicyResultSchema} from "./shippingPolicyContracts";
import {albumArgsSchema,albumResultSchema} from "./albumContracts";
import {recipeArgsSchema,recipeResultSchema} from "./recipeContracts";
import {productShowcaseArgsSchema,productShowcaseResultSchema} from "./productShowcaseContracts";
import { categoryTilesArgsSchema, categoryTilesResultSchema } from "./categoryTilesContracts";
import { productCollectionArgsSchema, productCollectionResultSchema } from "./productCollectionContracts";
import { featuredProductsArgsSchema, featuredProductsResultSchema } from "./productContracts";
import { pollArgsSchema, pollResultSchema } from "./pollDataContracts";
import { contactArgsSchema, contactResultSchema } from "./contactDataContracts";
import { formArgsSchema, formResultSchema } from "./formContracts";
import { tagCloudArgsSchema, tagCloudResultSchema } from "./tagCloudContracts";
import {calendarArgsSchema,calendarResultSchema} from "./calendarContracts";
import {nextEventArgsSchema,nextEventResultSchema,upcomingEventsArgsSchema,upcomingEventsResultSchema} from "./eventContracts";
import { postGridArgsSchema, postGridResultSchema, type BlockPageRequest } from "./postGridContracts";
import { z } from "zod";
import { latestPostsArgsSchema, latestPostsResultSchema } from "./postContracts";
import { navigationArgsSchemas, navigationResultSchemas } from "./navigationContracts";
import { safeLinkSchema } from "./generated/field-runtime.mjs";
export const DATA_LIMITS = Object.freeze({
	treeBytes: 512 * 1024,
	nodes: 80,
	depth: 8,
	uniqueCalls: 8,
	resultBytes: 60 * 1024,
	outputBytes: 512 * 1024,
});
export class CanonicalDataError extends Error {
	constructor(
		public code: string,
		public path: string,
		message: string,
	) {
		super(message);
		this.name = "CanonicalDataError";
	}
}
export const scopeSchema = z
	.object({
		websiteKey: z.string().min(1).max(128),
		instanceKey: z.string().min(1).max(128),
	})
	.strict();
export type DataScope = z.infer<typeof scopeSchema>;
export const pageArgsSchema = z
	.object({ page: z.string().min(1).max(256).optional() })
	.strict();
export type PageArgs = z.infer<typeof pageArgsSchema>;
export const pageResultSchema = z
	.object({
		page: z
			.object({
				id: z.string().min(1).max(256),
				title: z.string().max(512),
				href: safeLinkSchema(z, ["relative"]).max(2048),
				excerpt: z.string().max(8192).nullable(),
				image: z
					.object({
						src: safeLinkSchema(z, ["http", "https", "relative"]).max(4096),
						alt: z.string().max(1000),
					})
					.strict()
					.nullable(),
			})
			.strict()
			.nullable(),
	})
	.strict();
export type PageResult = z.infer<typeof pageResultSchema>;
export const resolverArgs = { "social.feed":socialFeedArgsSchema, "forms.leadMagnet":leadMagnetArgsSchema, "media.tagged":taggedMediaArgsSchema, "content.search":searchArgsSchema, "commerce.bundle": bundleOfferArgsSchema, "commerce.productCompare": productCompareArgsSchema, "commerce.reviews":reviewsArgsSchema, "commerce.productOptions":productOptionsArgsSchema, "events.event":rsvpArgsSchema, "site.locales": localeArgsSchema, "content.archive":archiveArgsSchema, "content.related":relatedArgsSchema, "gallery.album":albumArgsSchema, "support.search":knowledgeSearchArgsSchema, "support.form":ticketCtaArgsSchema, "lms.curriculum":curriculumArgsSchema, "lms.progress":learnerProgressArgsSchema, "lms.instructor":instructorArgsSchema, "certificates.verify":certificateAvailabilityArgsSchema, "lms.courses":courseGridArgsSchema, "membership.plans":membershipPlansArgsSchema, "membership.access":membershipAccessArgsSchema, "commerce.brands":brandArgsSchema, "commerce.shippingPolicy":shippingPolicyArgsSchema, "recipes.recipe":recipeArgsSchema, "commerce.productShowcase":productShowcaseArgsSchema, "commerce.categoryTiles": categoryTilesArgsSchema, "commerce.productCollection": productCollectionArgsSchema, "commerce.featuredProducts": featuredProductsArgsSchema, "forms.poll": pollArgsSchema, "forms.contact": contactArgsSchema, "forms.form": formArgsSchema, "content.tags": tagCloudArgsSchema, "events.list":calendarArgsSchema, "events.next":nextEventArgsSchema, "events.upcoming": upcomingEventsArgsSchema, "content.page": pageArgsSchema, "content.latestPosts": latestPostsArgsSchema, "content.posts": postGridArgsSchema, ...navigationArgsSchemas } as const;
export const resolverResults = { "social.feed":socialFeedResultSchema, "forms.leadMagnet":leadMagnetResultSchema, "media.tagged":taggedMediaResultSchema, "content.search":searchResultSchema, "commerce.bundle": bundleOfferResultSchema, "commerce.productCompare": productCompareResultSchema, "commerce.reviews":reviewsResultSchema, "commerce.productOptions":productOptionsResultSchema, "events.event":rsvpResultSchema, "site.locales": localeResultSchema, "content.archive":archiveResultSchema, "content.related":relatedResultSchema, "gallery.album":albumResultSchema, "support.search":knowledgeSearchResultSchema, "support.form":ticketCtaResultSchema, "lms.curriculum":curriculumResultSchema, "lms.progress":learnerProgressResultSchema, "lms.instructor":instructorResultSchema, "certificates.verify":certificateAvailabilitySchema, "lms.courses":courseGridResultSchema, "membership.plans":membershipPlansResultSchema, "membership.access":membershipAccessResultSchema, "commerce.brands":brandResultSchema, "commerce.shippingPolicy":shippingPolicyResultSchema, "recipes.recipe":recipeResultSchema, "commerce.productShowcase":productShowcaseResultSchema, "commerce.categoryTiles": categoryTilesResultSchema, "commerce.productCollection": productCollectionResultSchema, "commerce.featuredProducts": featuredProductsResultSchema, "forms.poll": pollResultSchema, "forms.contact": contactResultSchema, "forms.form": formResultSchema, "content.tags": tagCloudResultSchema, "events.list":calendarResultSchema, "events.next":nextEventResultSchema, "events.upcoming": upcomingEventsResultSchema, "content.page": pageResultSchema, "content.latestPosts": latestPostsResultSchema, "content.posts": postGridResultSchema, ...navigationResultSchemas } as const;
export type ResolverName = keyof typeof resolverArgs;
export type ResolverArgsByName = { [R in ResolverName]: z.infer<(typeof resolverArgs)[R]> };
export type ResolverResultByName = { [R in ResolverName]: z.infer<(typeof resolverResults)[R]> };
export type DataEntry = { [R in ResolverName]: {blockName:string;blockVersion:number;resolver:R;bindingKey:string;data:ResolverResultByName[R]} }[ResolverName];
export type ResolverJob = { [R in ResolverName]: {key:string;resolver:R;args:ResolverArgsByName[R]} }[ResolverName];
export interface ResolverPolicy {
	enabledPlugins: readonly string[];
	capabilities: readonly string[];
	disabledBlocks: readonly string[];
}
export type DataBinding = { [R in ResolverName]: {blockId:string;blockName:string;blockVersion:number;resolver:R;bindingKey:string;args:ResolverArgsByName[R]} }[ResolverName];
export interface CanonicalDataPlan { scope:DataScope; bindings:DataBinding[]; jobs:ResolverJob[]; request:BlockPageRequest; definitionsDigest?:string }
export interface DataEnvelope { contract:"canonical-data-v1"; scope:DataScope; dataByBlock:Record<string,DataEntry>; request?:BlockPageRequest; definitionsDigest?:string }
export function encodedBytes(value: unknown) {
	try {
		const json = JSON.stringify(value);
		if (json === undefined) throw Error();
		return new TextEncoder().encode(json).length;
	} catch {
		throw new CanonicalDataError(
			"INVALID_JSON",
			"tree",
			"Canonical data must be serializable JSON",
		);
	}
}
export function stableKey(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.keys(value)
			.sort()
			.map(
				(key) =>
					JSON.stringify(key) +
					":" +
					stableKey((value as Record<string, unknown>)[key]),
			)
			.join(",")}}`;
	return JSON.stringify(value);
}
