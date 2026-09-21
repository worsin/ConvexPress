import { z } from "zod";

export const CONTENT_PROMOTION_VERSION = 1 as const;
export const MAX_PROMOTION_RECORDS = 100;
export const MAX_PROMOTION_BYTES = 500_000;
export const PROMOTION_REFERENCE_PREFIX = "@promotion:";
export const PROMOTION_URL_PREFIX = "@promotion-url:";
const text = z.string().max(100_000);
const short = z.string().max(500);
export const promotionIdentitySchema: z.ZodType<PromotionIdentity> = z
	.object({
		websiteKey: short.min(1),
		instanceKey: short.min(1),
		deploymentOrigin: z.string().url(),
		siteOrigin: z.string().url(),
		environmentKind: z.enum([
			"live",
			"staging",
			"beta",
			"preview",
			"development",
			"local",
			"custom",
		]),
		schemaVersion: short,
	})
	.strict();
const canonicalPromotionTransport: z.ZodType<PromotionCanonicalTree> = z.object({
 contract:z.literal("canonical-promotion-tree-v1"), blocks:z.array(z.unknown()).max(80),
 references:z.array(z.object({blockId:short.min(1),path:z.array(z.union([z.string().min(1).max(128),z.number().int().nonnegative()])).min(1).max(32),kind:short.min(1),storage:z.enum(["id","slug"]),key:short.min(1)}).strict()).max(2000),
}).strict();
const syncedPromotionSourcesSchema: z.ZodType<PromotionSyncedSources> = z.object({
 contract:z.literal("synced-promotion-closure-v1"),
 scope:z.object({websiteKey:z.string().min(1).max(128),instanceKey:z.string().min(1).max(128),deploymentOrigin:z.string().url().max(2048)}).strict(),
 sources:z.array(z.object({key:short.min(1),generation:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),publishedRevision:z.number().int().min(1).max(1_000_000),revisions:z.array(z.object({revision:z.number().int().min(1).max(1_000_000),title:z.string().min(1).max(512),tree:canonicalPromotionTransport}).strict()).min(1).max(100)}).strict()).min(1).max(100),
}).strict();
const authoredContent = {
 blocksVersion:z.union([z.literal(1),z.literal(2)]).optional(),
 canonical:canonicalPromotionTransport.optional(),
	title: short,
	slug: short.min(1),
	content: text.optional(),
	excerpt: z.string().max(1000).optional(),
	status: z.enum(["draft", "pending", "publish", "private"]),
	visibility: z.enum(["public", "private"]),
	contentMode: z.enum(["article", "blocks"]).optional(),
	blocks: z.array(z.unknown()).max(200).optional(),
	featuredImageId: short.optional(),
	commentStatus: z.enum(["open", "closed"]),
	isSticky: z.boolean().optional(),
	publishedAt: z.number().optional(),
	hideHeader: z.boolean().optional(),
	hideFooter: z.boolean().optional(),
	pageTemplate: short.optional(),
	parentId: short.optional(),
	menuOrder: z.number().optional(),
	path: short.optional(),
	depth: z.number().optional(),
	hero: z
		.object({
			title: short.optional(),
			subtitle: text.optional(),
			content: text.optional(),
			imageId: short.optional(),
			videoUrl: short.optional(),
			ctaText: short.optional(),
			ctaUrl: short.optional(),
		})
		.strict()
		.optional(),
	topics: z
		.array(
			z
				.object({
					title: short.optional(),
					subtitle: text.optional(),
					content: text.optional(),
					imageId: short.optional(),
					videoUrl: short.optional(),
				})
				.strict(),
		)
		.max(10)
		.optional(),
	summary: z
		.object({ title: short.optional(), content: text.optional() })
		.strict()
		.optional(),
	sources: text.optional(),
	tableOfContents: text.optional(),
};
const catalogMoney = z.object({ amount: z.number().int().nonnegative(), currencyCode: z.string().regex(/^[A-Z]{3}$/) }).strict();
const catalogOption = z.object({ name: short.min(1), values: z.array(short.min(1)).min(1).max(100) }).strict();
const variantOption = z.object({ name: short.min(1), value: short.min(1) }).strict();
export const promotionDataSchemas = {
  course: z.object({ title: short.min(1), slug: short.min(1), descriptionDoc: z.unknown().optional(), excerpt: text.optional(), status: z.enum(["draft","published","archived"]), featuredImageId: short.optional(), promoVideoUrl: short.optional(), categoryIds: z.array(short).max(20).optional(), tagIds: z.array(short).max(20).optional(), accessMode: z.enum(["open","free","members","closed"]), progressionMode: z.enum(["linear","free_form"]).optional(), pointsAwarded: z.number().int().nonnegative().optional(), pointsRequired: z.number().int().nonnegative().optional(), prereqMode: z.enum(["any","all"]).optional(), accessDurationDays: z.number().int().nonnegative().optional(), startDate: z.number().optional(), endDate: z.number().optional(), seatLimit: z.number().int().nonnegative().optional(), contentVisibility: z.enum(["always","enrollees_only"]).optional(), completionRedirectUrl: short.optional(), materialsDoc: z.unknown().optional() }).strict(),
  courseNode: z.object({ courseId: short, parentId: short.optional(), kind: z.enum(["topic","lesson","section_heading"]), title: short.min(1), position: z.number(), description: text.optional(), topicDripMode: z.enum(["immediately","enrollment_based","specific_date"]).optional(), topicDripOffsetDays: z.number().int().nonnegative().optional(), topicDripDate: z.number().optional(), bodyDoc: z.unknown().optional(), materialsDoc: z.unknown().optional(), videoUrl: short.optional(), videoProvider: short.optional(), videoMediaId: short.optional(), requireVideoWatch: z.boolean().optional(), autoComplete: z.boolean().optional(), completionDelaySec: z.number().nonnegative().optional(), minTimeSeconds: z.number().nonnegative().optional(), showMarkComplete: z.boolean().optional(), isPreview: z.boolean().optional(), lessonDripMode: z.enum(["immediately","enrollment_based","specific_date"]).optional(), lessonDripOffsetDays: z.number().int().nonnegative().optional(), lessonDripDate: z.number().optional(), audioMediaId: short.optional(), captionsMediaId: short.optional(), transcriptText: text.optional(), aiVideoMediaId: short.optional() }).strict(),
  coursePrerequisite: z.object({ courseId: short, prereqCourseId: short }).strict(),
  plan: z.object({ title: short.min(1), slug: short.min(1), description: text.optional(), status: z.enum(["draft","active","archived"]), grantMode: z.enum(["manual","subscription","purchase","hybrid"]), priority: z.number() }).strict(),
  planBenefit: z.object({ planId: short, code: short.min(1), label: short, description: text.optional(), displayAsFeature: z.boolean().optional() }).strict(),
  productBrand: z.object({ name: z.string().trim().min(1).max(160), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), description: z.string().max(3000), logoMediaId: short.optional(), status: z.enum(["draft", "publish", "archived"]), sortOrder: z.number().int().min(-100000).max(100000) }).strict(),
  productTag: z.object({ name: z.string().min(1).max(80), slug: z.string().min(1).max(160), isVisible: z.boolean() }).strict(),
  productCategory: z.object({ name: short.min(1), slug: short.min(1), description: text.optional(), parentId: short.optional(), thumbnailMediaId: short.optional(), icon: short.optional(), sortOrder: z.number().optional(), isVisible: z.boolean().optional(), isFeatured: z.boolean().optional(), showInNav: z.boolean().optional(), metaTitle: short.optional(), metaDescription: text.optional() }).strict(),
  product: z.object({ title: short.min(1), slug: short.min(1), description: text.optional(), excerpt: text.optional(), status: z.enum(["draft", "publish", "private"]), productType: z.enum(["simple", "variable"]), sku: short.min(1).optional(), featuredMediaId: short.optional(), galleryMediaIds: z.array(short).max(100), categoryIds: z.array(short).max(100), tagIds: z.array(short).max(32).optional(), brandId: short.nullable().optional(), isFeatured: z.boolean().optional(), basePrice: catalogMoney, salePrice: catalogMoney.optional(), salePriceFrom: z.number().optional(), salePriceTo: z.number().optional(), shippingWeightOz: z.number().nonnegative().optional(), shippingLengthIn: z.number().nonnegative().optional(), shippingWidthIn: z.number().nonnegative().optional(), shippingHeightIn: z.number().nonnegative().optional(), isTaxable: z.boolean().optional(), taxClass: short.optional(), isNonReturnable: z.boolean().optional(), options: z.array(catalogOption).max(20), upsellProductIds: z.array(short).max(100).optional(), crossSellProductIds: z.array(short).max(100).optional(), assistantSummary: short.optional() }).strict(),
  productVariant: z.object({ productId: short, title: short.min(1), sku: short.min(1).optional(), description: text.optional(), options: z.array(variantOption).max(20), price: catalogMoney, salePrice: catalogMoney.optional(), salePriceFrom: z.number().optional(), salePriceTo: z.number().optional(), featuredMediaId: short.optional(), galleryMediaIds: z.array(short).max(100).optional(), status: z.enum(["draft", "publish", "private"]), isDefault: z.boolean(), menuOrder: z.number().optional(), weight: short.optional(), shippingLengthIn: short.optional(), shippingWidthIn: short.optional(), shippingHeightIn: short.optional(), isTaxable: z.boolean().optional(), taxClass: short.optional() }).strict(),
	page: z.object(authoredContent).strict(),
	post: z.object(authoredContent).strict(),
	media: z
		.object({
			title: short,
			fileName: short,
			slug: short,
			mimeType: short,
			fileSize: z.number().int().min(0),
			mediaType: z.enum([
				"image",
				"video",
				"audio",
				"document",
				"archive",
				"other",
			]),
			sha256: short.min(1),
			description: text.optional(),
			caption: text.optional(),
			altText: short.optional(),
			width: z.number().optional(),
			height: z.number().optional(),
		})
		.strict(),
	menu: z
		.object({
			name: short,
			slug: short,
			description: text.optional(),
			autoAddPages: z.boolean().optional(),
		})
		.strict(),
	menuItem: z
		.object({
			menuId: short,
			itemType: z.enum([
				"custom",
				"post",
				"page",
				"category",
				"tag",
				"dashboard",
				"heading",
				"separator",
			]),
			objectId: short.optional(),
			label: short,
			title: short.optional(),
			description: text.optional(),
			url: short.optional(),
			parentItemId: short.optional(),
			position: z.number(),
			depth: z.number().optional(),
			target: z.enum(["_self", "_blank"]).optional(),
			cssClasses: short.optional(),
			linkRel: short.optional(),
			icon: short.optional(),
			badge: short.optional(),
			pathOverride: short.optional(),
			visibility: z.enum(["everyone", "signedIn", "signedOut"]).optional(),
			roles: z.array(short).optional(),
			membershipPlans: z.array(short).optional(),
			capability: short.optional(),
		})
		.strict(),
	menuLocation: z
		.object({
			slug: short,
			name: short,
			description: text.optional(),
			menuId: short.optional(),
		})
		.strict(),
	term: z
		.object({
			name: short,
			slug: short,
			taxonomy: z.enum(["category", "post_tag"]),
			description: text.optional(),
			parentId: short.optional(),
		})
		.strict(),
	termRelationship: z
		.object({ postId: short, termId: short, order: z.number().optional() })
		.strict(),
	restriction: z
		.object({
			resourceType: z.enum(["page", "post", "block", "product", "course", "route"]),
			resourceIdOrKey: short,
			policyGroup: short.optional(),
			ruleMode: z.enum(["allow_only", "deny_if_missing"]),
			planIds: z.array(short),
			requiredCapabilities: z.array(short).optional(),
			teaserMode: z.enum(["hide", "excerpt", "custom_message"]),
			customMessage: text.optional(),
			loginRequired: z.boolean(),
		})
		.strict(),
  kbCategory: z.object({
    name: z.string().trim().min(1).max(256), slug: z.string().min(1).max(200),
    description: text.optional(), icon: short.optional(), parentId: short.optional(),
    order: z.number(), isActive: z.boolean(), isPublished: z.boolean(),
  }).strict(),
	eventCategory: z.object({name:z.string().trim().min(1).max(120),slug:z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)}).strict(),
	event: z
		.object({
			title: short,
			slug: short,
			description: text,
			startsAt: z.number(),
			endsAt: z.number(),
			timeZone: short,
			venue: short,
			venueAddress: text,
			registrationUrl: short.optional(),
      rsvp: z.object({mode:z.enum(["closed","guests","signedIn"]),capacity:z.number().int().min(1).max(1_000_000).nullable(),closesAt:z.number().int().min(0).max(8_640_000_000_000_000).nullable()}).strict().optional(),
      categoryId: short.optional(),
			status: z.enum(["draft", "published", "cancelled", "archived"]),
		})
		.strict(),
	presentation: z
		.object({
			section: z.enum(["general", "reading", "appearance.template"]),
			values: z.record(z.string(), z.unknown()),
		})
		.strict(),
	postMeta: z
		.object({
			postId: short,
			key: z.enum([
				"_seo_title",
				"_seo_description",
				"_seo_noindex",
				"_seo_nofollow",
			]),
			value: text,
		})
		.strict(),
} as const;
export type PromotionKind =
  | "page" | "post" | "media" | "menu" | "menuItem" | "menuLocation"
  | "term" | "termRelationship" | "restriction" | "event" | "eventCategory" | "kbCategory" | "presentation" | "postMeta" | "product" | "productCategory" | "productTag" | "productBrand" | "productVariant" | "course" | "courseNode" | "coursePrerequisite" | "plan" | "planBenefit";
export const promotionPresentationSchemas = {
	general: z
		.object({
			siteTitle: z.string().min(1).max(200).optional(),
			tagline: z.string().max(500).optional(),
			siteLogo: short.optional(),
			logoUrl: short.optional(),
		})
		.strict(),
	reading: z
		.object({
			homepageDisplays: z
				.enum(["latest_posts", "static_page", "shop"])
				.optional(),
			homepageId: short.optional(),
			postsPageId: short.optional(),
			postsPerPage: z.number().int().min(1).max(100).optional(),
		})
		.strict(),
	"appearance.template": z
		.object({
			active: short.regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
			overrides: z.record(z.string(), z.string()),
			variants: z.record(z.string(), z.string()),
			settings: z.record(
				z.string(),
				z.record(z.string(), z.record(z.string(), z.unknown())),
			),
		})
		.strict(),
} as const;
export const promotionRecordSchema: z.ZodType<PromotionRecord> = z
	.object({
		key: short.min(1),
		kind: z.enum(
			Object.keys(promotionDataSchemas) as [PromotionKind, ...PromotionKind[]],
		),
		sourceRevision: short.min(1),
		data: z.record(z.string(), z.unknown()),
	})
	.strict()
	.superRefine((record, ctx) => {
		const result = promotionDataSchemas[record.kind].safeParse(record.data);
    if(record.kind === "page" || record.kind === "post") {
      const canonical=record.data.blocksVersion===2;
      if(canonical ? (!record.data.canonical || record.data.blocks!==undefined || record.data.contentMode!=="blocks" || Boolean(record.data.content) || !["draft","publish","private"].includes(String(record.data.status))) : record.data.canonical!==undefined)
        ctx.addIssue({code:"custom",path:["data","canonical"],message:"Canonical pages require an explicit v2 transport and no legacy body; legacy pages cannot include canonical transport."});
    }
		if (record.kind === "presentation" && result.success) {
			const section = record.data
				.section as keyof typeof promotionPresentationSchemas;
			const values = promotionPresentationSchemas[section].safeParse(
				record.data.values,
			);
			if (!values.success)
				for (const issue of values.error.issues)
					ctx.addIssue({
						code: "custom",
						path: ["data", "values", ...issue.path],
						message: issue.message,
					});
		}
		if (!result.success)
			for (const issue of result.error.issues)
				ctx.addIssue({
					code: "custom",
					path: ["data", ...issue.path],
					message: issue.message,
				});
	});
export const promotionChangeKindSchema = z.union([z.enum(Object.keys(promotionDataSchemas) as [PromotionKind, ...PromotionKind[]]), z.literal('syncedBlock')]);
export const promotionSyncedReviewDataSchema = z.object({
  title: z.string().min(1).max(512), publishedRevision: z.number().int().min(1).max(1_000_000),
  revisions: z.array(z.object({revision:z.number().int().min(1).max(1_000_000),title:z.string().min(1).max(512),tree:canonicalPromotionTransport}).strict()).min(1).max(100),
}).strict();
export const promotionReviewedRecordSchema = z.union([promotionRecordSchema, z.object({key:short.min(1),kind:z.literal('syncedBlock'),sourceRevision:short.min(1),data:promotionSyncedReviewDataSchema}).strict()]);
/** Review identities include reusable sources without making them ordinary
 * authored table records. Their revisions travel in the closed source graph. */
export function promotionReviewedRecords(manifest: ContentPromotionManifest) {
  return [...manifest.records, ...(manifest.synced?.sources ?? []).map(source => ({
    key: source.key.slice(PROMOTION_REFERENCE_PREFIX.length), kind: 'syncedBlock' as const, sourceRevision: String(source.generation),
    data: promotionSyncedReviewDataSchema.parse({ title: source.revisions.find(v=>v.revision===source.publishedRevision)?.title, publishedRevision: source.publishedRevision, revisions: source.revisions }),
  }))];
}
export const promotionIssueSchema: z.ZodType<PromotionIssue> = z
	.object({
		code: short,
		key: short,
		path: short,
		message: z.string().max(2000),
	})
	.strict();
export const promotionDependencySchema: z.ZodType<PromotionDependency> = z
	.object({
		key: short,
		kind: z.enum([
			"product",
			"course",
			"plan",
			"form",
			"role",
			"plugin",
			"catalog",
		]),
		sourceId: short.optional(),
		slug: short.optional(),
		requiredBy: z.array(short),
	})
	.strict();
export const contentPromotionManifestSchema: z.ZodType<ContentPromotionManifest> = z
	.object({
		version: z.literal(CONTENT_PROMOTION_VERSION),
		source: promotionIdentitySchema,
		target: promotionIdentitySchema,
		selection: z
			.object({
				pageIds: z.array(short).max(100),
				postIds: z.array(short).max(100),
				menuIds: z.array(short).max(100),
				mediaIds: z.array(short).max(100),
				eventIds: z.array(short).max(100),
        productIds: z.array(short).max(100).optional(),
        courseIds: z.array(short).max(100).optional(),
        planIds: z.array(short).max(100).optional(),
        productCategoryIds: z.array(short).max(100).optional(),
        productTagIds: z.array(short).max(100).optional(),
        productBrandIds: z.array(short).max(100).optional(),
				includePresentation: z.boolean(),
        includeRoutePolicies: z.boolean().optional(),
			})
			.strict(),
		records: z.array(promotionRecordSchema).max(MAX_PROMOTION_RECORDS),
		synced: syncedPromotionSourcesSchema.optional(),
		dependencies: z.array(promotionDependencySchema).max(200),
		issues: z.array(promotionIssueSchema).max(200),
	})
	.strict();
/** Finite wire DTOs keep registered API types independent of Zod's schema graph.
 * Schema assignments above still check their output against these exact shapes. */
export interface PromotionIdentity {
  websiteKey: string;
  instanceKey: string;
  deploymentOrigin: string;
  siteOrigin: string;
  environmentKind: "live" | "staging" | "beta" | "preview" | "development" | "local" | "custom";
  schemaVersion: string;
}
export interface PromotionRecord {
  key: string;
  kind: PromotionKind;
  sourceRevision: string;
  data: Record<string, unknown>;
}
export interface PromotionCanonicalTree {
 contract:"canonical-promotion-tree-v1";
 blocks:unknown[];
 references:Array<{blockId:string;path:Array<string|number>;kind:string;storage:"id"|"slug";key:string}>;
}
export interface PromotionSyncedSources {
 contract:"synced-promotion-closure-v1";
 scope:{websiteKey:string;instanceKey:string;deploymentOrigin:string};
 sources:Array<{key:string;generation:number;publishedRevision:number;revisions:Array<{revision:number;title:string;tree:PromotionCanonicalTree}>}>;
}
export interface PromotionIssue {
  code: string;
  key: string;
  path: string;
  message: string;
}
export interface PromotionDependency {
  key: string;
  kind: "product" | "course" | "plan" | "form" | "role" | "plugin" | "catalog";
  sourceId?: string;
  slug?: string;
  requiredBy: string[];
}
export interface ContentPromotionManifest {
  version: 1;
  source: PromotionIdentity;
  target: PromotionIdentity;
  selection: {
    pageIds: string[];
    postIds: string[];
    menuIds: string[];
    mediaIds: string[];
    eventIds: string[];
    productIds?: string[];
    courseIds?: string[];
    planIds?: string[];
    productCategoryIds?: string[];
    productTagIds?: string[];
    productBrandIds?: string[];
    includePresentation: boolean;
    includeRoutePolicies?: boolean;
  };
  records: PromotionRecord[];
  synced?: PromotionSyncedSources;
  dependencies: PromotionDependency[];
  issues: PromotionIssue[];
}
export const PRESERVED_PROMOTION_AREAS = [
	"identity and deployment origins",
	"authentication, users, roles and credentials",
	"customers, orders, payments and inventory",
	"memberships, enrollments, learning progress and submissions",
	"runtime queues, webhooks, integrations and service secrets",
] as const;
export const CONTENT_PROMOTION_ADAPTERS = {
	authoredContent: "write",
	menus: "write",
	media: "verified-target-upload",
	taxonomy: "write",
	events: "write",
	presentation: "allowlisted-fields",
	products: "authored-physical-catalog; target inventory and provider state preserved",
  productTags: "authored tags and product assignments; target identities remapped",
  productBrands: "authored brands, verified logo media and product assignments; target identities remapped",
	courses: "authored courses, curriculum nodes, prerequisites and gates; paid/certificate adapters required",
	plans: "authored plans and display benefits; target billing bindings retained; grants never copied",
	forms: "explicit-target-reference-only; submissions never copied",
} as const;

/** Target dry-run proof projected from the same verified storage plan bound to its durable receipt digest. */
export const promotionVerifiedMediaSchema = z.object({
 key: z.string().min(1).max(500),
 storageId: z.string().min(1).max(200),
 sha256: z.string().min(1).max(100),
 fileSize: z.number().int().min(0),
 resolution: z.enum(["binding", "existing-target"]),
 targetId: z.string().min(1).max(200).nullable(),
}).strict();
export type PromotionVerifiedMedia = z.infer<typeof promotionVerifiedMediaSchema>;
