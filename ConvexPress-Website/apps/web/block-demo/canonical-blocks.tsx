import {AuthorDemo} from "./author-preview";
import { CatalogBrowser } from "./catalog-browser";
import {SocialFeedDemo} from "./social-feed-preview";
import {SyncedDemo} from "./synced-preview";
import {LeadMagnetDemo} from "./lead-magnet-preview";
import {UgcDemo} from "./ugc-preview";
import {SearchDemo} from "./search-preview";
import { DownloadLibraryDemo } from "./download-library-demo";
import {BundleDemo} from "./bundle-preview";
import {ProductCompareDemo} from "./product-compare-preview";
import {ReviewsDemo} from "./reviews-preview";
import { WishlistDemo } from "./wishlist-demo";
import {RsvpDemo} from "./rsvp-preview";
import {LocaleDemo} from "./locale-preview";
import {KnowledgeBaseDemo} from "./knowledge-base-preview";
import {SupportDemo} from "./support-preview";
import {CurriculumDemo} from "./curriculum-preview";
import {ProgressDemo} from "./progress-preview";
import {InstructorDemo} from "./instructor-preview";
import {CertificateDemo} from "./certificate-preview";
import {CoursesDemo} from "./courses-preview";
import {MembershipPlansDemo} from "./membership-plans-preview";
import {MembershipDemo} from "./membership-preview";
import {BrandListDemo} from "./brand-preview";
import {ShippingPolicyDemo} from "./shipping-policy-preview";
import {ArchiveDemo} from "./archive-preview";
import {RelatedDemo} from "./related-preview";
import {AlbumDemo} from "./album-preview";
import {RecipeDemo} from "./recipe-preview";
import { CartSummaryDemo } from "./cart-summary-demo";
import {ShoppingAssistantDemo} from "./shopping-assistant-demo";
import { ProductsDemo } from "./products-preview";
import { TagCloudDemo } from "./tag-cloud-preview";
import { PollDemo } from "./poll-preview";
import { FormDemo } from "./form-preview";
import {UpcomingEventsDemo} from "./events-preview";
import { PostGridDemo } from "./post-grid-preview";
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { bindFixtureMedia } from "./fixture-media.mjs";
import { carouselSpecimenChildren } from "./utility-specimens";
import {NavigationDemo} from "./navigation-preview";
import {navigationNames} from "./navigation-adapter";
import { FeaturedPageDemo } from "./featured-page-preview";
import { NewsletterDemo } from "./newsletter-preview";
import catalog from "../../../../blocks/.generated/catalog.json";
import { dependencyDescriptors, stylesForBlock } from "../../../../blocks/.generated/metadata";
import { stagedRenderers } from "../src/templates/sdk/block-renderer/discovery";
import {
	prepareBlocks,
	BlockRenderError,
	type BlockInstance,
} from "../src/templates/sdk/block-renderer/model";
import {
	PrimitiveProvider,
	type PackPartsRegistry,
} from "../src/templates/sdk/primitives";
import workshop from "./assets/ceramic-workshop-editorial.png";
import workshopAfter from "./assets/ceramic-workshop-terracotta-after.png";
import campMug from "./assets/aster-house-camp-mug.png";
import studioPortrait from "./assets/fictional-studio-portrait.png";
import fieldNotebook from "./assets/aster-house-field-notebook.png";
import retreat from "./assets/aster-house-retreat.png";
import asterMark from "./assets/aster-objects-compact.png";

const AuthoringPreview = lazy(() =>
	import("./authoring-preview").then((module) => ({
		default: module.AuthoringPreview,
	})),
);

class SpecimenBoundary extends Component<
	{ children: ReactNode },
	{ error: string | null }
> {
	state: { error: string | null } = { error: null };
	static getDerivedStateFromError(error: unknown) {
		return {
			error: error instanceof Error ? error.message : "Specimen failed",
		};
	}
	render() {
		return this.state.error ? (
			<div className="block-not-ready" role="status">
				<strong>Explicitly unsupported</strong>
				<p>{this.state.error}</p>
			</div>
		) : (
			this.props.children
		);
	}
}
const descriptors: Record<
	string,
	{
		fields: readonly {
			type: string;
			path: readonly string[];
			valuePath: readonly string[];
		}[];
		supportsChildren: boolean;
	}
> = dependencyDescriptors;
function exampleFor(name: string, index: number): BlockInstance {
	const spec = catalog.find((item) => item.name === name)!;
	const attrs = structuredClone(spec.examples[index] ?? spec.examples[0]);
	for (const field of descriptors[name].fields)
		if (field.type === "media")
			bindFixtureMedia(attrs, [...field.path, ...field.valuePath]);
	const result: BlockInstance = {
		id: `demo-${name.replaceAll("/", "-")}`,
		name,
		version: spec.version,
		attrs,
	};
	if (name === "core/carousel") {
		result.children = carouselSpecimenChildren(result.id);
	} else if (descriptors[name].supportsChildren) {
		const child = catalog.find((item) => item.name === "core/heading")!;
		result.children = [0, 1].map((i) => ({
			id: `child-${i}`,
			name: child.name,
			version: child.version,
			attrs: {
				...child.examples.at(-1),
				anchor: `${result.id}-study-${i + 1}`,
				text: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: `Composition study ${i + 1}` }],
						},
					],
				},
			},
		}));
	}
	return result;
}
function RenderExample({ instance, packId }: { instance: BlockInstance; packId: string }) {
	const view = <StaticRenderExample instance={instance} packId={packId} />;
  if(instance.name === "commerce/download-library") return <DownloadLibraryDemo>{view}</DownloadLibraryDemo>;
  if(instance.name === "commerce/wishlist") return <WishlistDemo>{view}</WishlistDemo>;
  if(instance.name === "commerce/cart-cta") return <CartSummaryDemo>{view}</CartSummaryDemo>;
  if(instance.name === "commerce/assistant-band") return <ShoppingAssistantDemo>{view}</ShoppingAssistantDemo>;
	return ["core/newsletter-signup", "core/cta-with-form"].includes(
		instance.name,
	) ? (
		<NewsletterDemo>{view}</NewsletterDemo>
	) : (
		view
	);
}
function StaticRenderExample({ instance, packId }: { instance: BlockInstance; packId: string }) {
 if(instance.name === "core/author-bio") return <AuthorDemo instance={instance} registry={stagedRenderers} packId={packId} portrait={studioPortrait} resources={{media:{"demo-image-studio-portrait":{src:studioPortrait,alt:"Fictional author portrait",mimeType:"image/png"}}}}/>;
 if(instance.name === "core/synced") return <SyncedDemo registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/social-feed") return <SocialFeedDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/lead-magnet") return <LeadMagnetDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/ugc-grid") return <UgcDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/search-results") return <SearchDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "commerce/bundle-offer") return <BundleDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "commerce/product-compare") return <ProductCompareDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/reviews") return <ReviewsDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "support/kb-search") return <KnowledgeBaseDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "support/ticket-cta") return <SupportDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name==="certificates/verify")return <CertificateDemo instance={instance} registry={stagedRenderers}/>;
 if(instance.name === "commerce/brand-list") return <BrandListDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "commerce/shipping-promise") return <ShippingPolicyDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/event-rsvp") return <RsvpDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/language-switcher") return <LocaleDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/archive-list") return <ArchiveDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/related-content") return <RelatedDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "gallery/album") return <AlbumDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "gallery/recipe-card") return <RecipeDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "commerce/variant-picker-teaser" || instance.name === "commerce/product-showcase" || instance.name === "commerce/product-hero" || instance.name === "commerce/category-tiles" || instance.name === "core/featured-products" || instance.name === "blocks/product-collection" || instance.name === "commerce/sale-countdown" || instance.name === "commerce/recently-viewed") return <ProductsDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name === "core/poll")return <PollDemo instance={instance} registry={stagedRenderers}/>;
 if(instance.name === "core/form" || instance.name === "core/contact-form")return <FormDemo instance={instance} registry={stagedRenderers}/>;
 if(instance.name === "events/upcoming" || instance.name === "events/next-event" || instance.name === "events/calendar")return <UpcomingEventsDemo instance={instance} registry={stagedRenderers}/>;
 if(instance.name === "core/tag-cloud") return <TagCloudDemo instance={instance} registry={stagedRenderers}/>;
 if(instance.name === "core/post-grid") return <PostGridDemo instance={instance} registry={stagedRenderers}/>;
 if(instance.name==="lms/curriculum")return <CurriculumDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name==="lms/progress")return <ProgressDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name==="lms/instructor")return <InstructorDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name==="lms/course-grid")return <CoursesDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name==="membership/plans")return <MembershipPlansDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(instance.name==="membership/gated-teaser")return <MembershipDemo instance={instance} registry={stagedRenderers} packId={packId}/>;
 if(navigationNames.includes(instance.name))return <NavigationDemo instance={instance} registry={stagedRenderers}/>;
	if (instance.name === "core/featured-page")
		return (
			<FeaturedPageDemo
				instance={instance}
				registry={stagedRenderers}
				studioSrc={workshop}
			/>
		);
	try {
		return (
			<>
				{prepareBlocks(
					[instance],
					stagedRenderers,
					{
						enabledPlugins: instance.name === "commerce/download-library" ? ["commerce","commerceDigital"] : instance.name === "commerce/wishlist" ? ["commerce","commerceWishlists"] : instance.name === "core/contact-form" ? ["forms"] : ["commerce/assistant-band","commerce/cart-cta"].includes(instance.name) ? ["commerce"] : [],
						capabilities: [
							"tree.children",
							"reference.targetResolution",
							"html.sanitize",
							"embed.sandbox",
							"map.approvedProvider",
							"embed.approvedScript",
							"form.submission","contact.submission","viewer.authorization",
						],
						disabledBlocks: [],
					},
					{
						media: {
							"demo-image-after": {
								src: workshopAfter,
								alt: "AI-edited workshop with a terracotta pitcher in place of the blue pitcher",
								mimeType: "image/png",
								width: 1536,
								height: 1024,
							},
							"demo-image-aster-mark": {
								src: asterMark,
								alt: "Aster Objects",
								mimeType: "image/png",
							},
							"demo-video": {
								src: "/media/workshop-fixture.webm",
								alt: "Synthetic silent workshop video fixture",
								mimeType: "video/webm",
								captions: {
									src: "/media/workshop-fixture.vtt",
									language: "en",
									label: "English captions",
								},
							},
							"demo-audio": {
								src: "/media/silent-audio-fixture.wav",
								alt: "Synthetic one-second silent audio fixture",
								mimeType: "audio/wav",
							},
							"demo-file": {
								src: "/media/sample-notebook.txt",
								alt: "Synthetic notebook download fixture",
								mimeType: "text/plain",
								filename: "sample-notebook.txt",
							},
							"demo-image-camp-mug": {
								src: campMug,
								alt: "A dark green ceramic mug on a stone windowsill beside folded linen",
								mimeType: "image/png",
							},
							"demo-image-studio-portrait": {
								src: studioPortrait,
								alt: "AI-generated portrait of a fictional studio collaborator",
								mimeType: "image/png",
							},
							"demo-image-field-notebook": {
								src: fieldNotebook,
								alt: "A closed green field notebook and pencil on sunlit stone",
								mimeType: "image/png",
							},
							"demo-image-retreat": {
								src: retreat,
								alt: "A low wood and stone retreat beneath forested mountain cliffs",
								mimeType: "image/png",
							},
							"demo-workshop": {
								src: workshop,
								alt: "Ceramic workshop fixture",
								width: 1536,
								height: 1024,
							},
						},
					},
          undefined,
          packId,
				)}
			</>
		);
	} catch (error) {
		if (!(error instanceof BlockRenderError)) throw error;
		return (
			<div className="block-not-ready" role="status">
				<strong>{error.code}</strong>
				<p>{error.message}</p>
			</div>
		);
	}
}
function studyFromLocation() {
 const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
 const name = params.get("block");
 const spec = catalog.find(item => item.name === name) ?? catalog.find(item => item.name === "core/feature-grid")!;
 const raw = params.get("example");
 const index = raw !== null && /^\d+$/.test(raw) ? Number(raw) : 1;
 return {name:spec.name,example:Math.min(Math.max(0,index),spec.examples.length-1)};
}
export function CanonicalBlocks({
	packId,
	registry,
}: {
	packId: string;
	registry: PackPartsRegistry;
}) {
	const [name, setName] = useState(() => studyFromLocation().name);
	const spec = catalog.find((item) => item.name === name)!;
	const [example, setExample] = useState(() => studyFromLocation().example);
 const studyHeading = useRef<HTMLHeadingElement>(null);
 useEffect(() => {
  const restore = () => { const next=studyFromLocation();setName(next.name);setExample(next.example); };
  if(window.location.hash==="#block-study")requestAnimationFrame(()=>studyHeading.current?.scrollIntoView({block:"start",behavior:"instant"}));
  window.addEventListener("popstate",restore);
  return () => window.removeEventListener("popstate",restore);
 }, []);
 const selectStudy = (nextName: string, nextExample = 1, focus = false) => {
  const nextSpec=catalog.find(item=>item.name===nextName);if(!nextSpec)return;
  const index=Math.min(Math.max(0,nextExample),nextSpec.examples.length-1);
  setName(nextName);setExample(index);
  const url=new URL(window.location.href);url.searchParams.set("block",nextName);url.searchParams.set("example",String(index));
  if(focus)url.hash="block-study";
  window.history.pushState(window.history.state,"",url);
  if(focus)requestAnimationFrame(()=>{studyHeading.current?.focus({preventScroll:true});studyHeading.current?.scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});});
 };
	const [authoring, setAuthoring] = useState(false);
	const [styleChoice, setStyleChoice] = useState({ name: "", style: "default" });
	const selectedStyle = styleChoice.name === name ? styleChoice.style : "default";
	const styleOptions = stylesForBlock(packId, name);
	const instance = exampleFor(
		name,
		Math.min(example, spec.examples.length - 1),
	);
	if (selectedStyle !== "default") instance.style = selectedStyle;
	const implemented = Object.keys(stagedRenderers).length;
	return (
		<section className="canonical-gallery" id="canonical-blocks">
			<div className="chapter">
				<span>01 / The block library</span>
				<p>
					{implemented} Library renderers / {catalog.length} canonical specs ·
					visual matrix partial
				</p>
			</div>
			<CatalogBrowser entries={catalog} selected={name} packId={packId} onSelect={(nextName,focus)=>selectStudy(nextName,1,focus)}/>
			<div className="canonical-controls" id="block-study">
				<div>
					<p className="lab-kicker">From canonical discovery</p>
					<h2 ref={studyHeading} tabIndex={-1}>{spec.title}</h2><a className="back-to-library" href="#block-library">← Back to the library</a>
					<p>
						Real schema versions, normalized examples and opt-in pack
						primitives. Unsupported requirements stay visible.
					</p>
				</div>
				<div className="theme-selects">
					<label htmlFor="canonical-block">
						Block
						<select
							id="canonical-block"
							value={name}
							onChange={(event) => {
								selectStudy(event.target.value);
							}}
						>
							{catalog.map((item) => (
								<option key={item.name} value={item.name}>
									{Object.hasOwn(stagedRenderers, item.name) ? "●" : "○"}{" "}
									{item.title} ({item.name})
								</option>
							))}
						</select>
					</label>
					<label htmlFor="canonical-example">
						Example
						<select
							id="canonical-example"
							value={Math.min(example, spec.examples.length - 1)}
							onChange={(event) => selectStudy(name, Number(event.target.value))}
						>
							{spec.examples.map((_, index) => (
								<option key={index} value={index}>
									Example {index + 1}
								</option>
							))}
						</select>
					</label>
					{(styleOptions.length > 1 || selectedStyle !== "default") && <label htmlFor="canonical-style">
						Block style
						<select id="canonical-style" value={selectedStyle} onChange={event => setStyleChoice({ name, style: event.target.value })}>
							{!styleOptions.includes(selectedStyle) && <option value={selectedStyle}>{selectedStyle} (uses this template's default)</option>}
							{styleOptions.map(style => <option key={style} value={style}>{style}</option>)}
						</select>
					</label>}
				</div>
			</div>
			<div className="canonical-caption">
				<strong>
					{name} · v{spec.version}
				</strong>
				<span>
					{Object.hasOwn(stagedRenderers, name)
						? "Staged Library renderer"
						: "Renderer pending"}{" "}
					· {packId}
					{name === "core/before-after" &&
						" · AI-edited glaze comparison; fictional demonstration"}
				</span>
			</div>
			<div
				data-canonical-block={name}
				data-canonical-version={spec.version}
				data-renderer-count={implemented}
				className="canonical-canvas"
			>
				<SpecimenBoundary key={`${packId}:${name}:${example}`}>
					<PrimitiveProvider packId={packId} registry={registry}>
						<RenderExample instance={instance} packId={packId} />
					</PrimitiveProvider>
				</SpecimenBoundary>
			</div>
			<details
				className="canonical-authoring"
				onToggle={(event) => setAuthoring(event.currentTarget.open)}
			>
				<summary>Try local field edits</summary>
				{authoring && (
					<Suspense fallback={<p>Loading canonical field controls…</p>}>
						<AuthoringPreview
							instance={instance}
							renderPreview={(edited) => (
								<SpecimenBoundary key={`${packId}:${JSON.stringify(edited)}`}>
									<PrimitiveProvider packId={packId} registry={registry}>
										<RenderExample instance={edited} packId={packId} />
									</PrimitiveProvider>
								</SpecimenBoundary>
							)}
						/>
					</Suspense>
				)}
			</details>
			<details className="canonical-source">
				<summary>Inspect the validated specimen input</summary>
				<p>
					Canonical example; synthetic media IDs bind to local image, silent
					video/audio and text download fixtures. The comparison uses an AI-edited
					glaze variation of the sample photograph, not a real project result. Container
					children use a canonical heading example. This is not saved site
					content.
				</p>
				<pre>{JSON.stringify(instance, null, 2)}</pre>
			</details>
		</section>
	);
}
