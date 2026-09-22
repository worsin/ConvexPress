import {
	mkdtempSync,
	symlinkSync,
	rmSync,
	readFileSync,
	readdirSync,
	existsSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const runtimeRoot = fileURLToPath(
	new URL("../../../../node_modules/", import.meta.url),
);
function resolveRuntime(name) {
	const file =
		name === "react"
			? "react/index.js"
			: name === "react-dom/server"
				? "react-dom/server.node.js"
				: name === "react-dom"
					? "react-dom/index.js"
					: name === "zod"
						? "zod/index.js"
						: `${name}.js`;
	return join(runtimeRoot, file);
}
const directory = mkdtempSync(join(tmpdir(), "cp-block-renderer-"));
try {
	symlinkSync(runtimeRoot, join(directory, "node_modules"), "dir");
	const repo = fileURLToPath(new URL("../../../../../../../", import.meta.url));
	const contracts = JSON.parse(
		readFileSync(join(repo, "blocks/.generated/catalog.json"), "utf8"),
	);
	const renderers = contracts.filter((spec) =>
		existsSync(join(repo, spec.source.replace(/block.json$/u, "render.tsx"))),
	);
	const packRoot = fileURLToPath(new URL("../../packs/", import.meta.url));
	const packs = readdirSync(packRoot)
		.filter((name) => existsSync(join(packRoot, name, "template.json")))
		.map((name) => ({
			id: JSON.parse(
				readFileSync(join(packRoot, name, "template.json"), "utf8"),
			).id,
			parts: join(packRoot, name, "parts/primitives.tsx"),
		}));
	const manifests = packs.map(pack => JSON.parse(readFileSync(join(packRoot, pack.id, "template.json"), "utf8")));
	const ownedModules = manifests.flatMap(manifest => Object.entries(manifest.blocks?.renderers ?? {}).map(([name, source]) => ({packId: manifest.id, name, file: join(packRoot, manifest.id, source)})));
	const packModules = packs.filter((pack) => existsSync(pack.parts));
	const entry = join(directory, "entry.tsx");
	const model = fileURLToPath(new URL("./model.tsx", import.meta.url));
	const cases = fileURLToPath(new URL("./model.cases.tsx", import.meta.url));
const source = [
`import ${JSON.stringify(fileURLToPath(new URL("./certificate-dom.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./promoted.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./composed.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./pack-registry.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./synced.cases.tsx", import.meta.url)))};`,
`import {syncedExample} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/synced-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./social-feed.cases.tsx", import.meta.url)))};`,
`import {resolveSocialFeedDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/social-feed-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./lead-magnet.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./search.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./ugc.cases.tsx", import.meta.url)))};`,
`import {resolveTaggedMediaDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/ugc-adapter.ts", import.meta.url)))};`,
`import {resolveSearchDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/search-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./product-compare.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./reviews.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./bundle.cases.tsx", import.meta.url)))};`,
`import {resolveLeadMagnetDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/lead-magnet-adapter.ts", import.meta.url)))};`,
`import {resolveBundleDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/bundle-adapter.ts", import.meta.url)))};`,
`import {resolveProductCompareDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/product-compare-adapter.ts", import.meta.url)))};`,
`import {resolveReviewsDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/reviews-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./knowledge-base.cases.tsx", import.meta.url)))};`,
`import {resolveKnowledgeBaseDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/knowledge-base-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./support.cases.tsx", import.meta.url)))};`,
`import {resolveSupportDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/support-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./curriculum.cases.tsx", import.meta.url)))};`,
`import {resolveCurriculumDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/curriculum-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./progress.cases.tsx", import.meta.url)))};`,
`import {resolveProgressDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/progress-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./instructor.cases.tsx", import.meta.url)))};`,
`import {resolveCertificateDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/certificate-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./courses.cases.tsx", import.meta.url)))};`,
`import {resolveInstructorDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/instructor-adapter.ts", import.meta.url)))};`,
`import {resolveCoursesDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/courses-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./membership-plans.cases.tsx", import.meta.url)))};`,
`import {resolveMembershipPlansDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/membership-plans-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./membership.cases.tsx", import.meta.url)))};`,
`import {resolveMembershipDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/membership-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./account-teaser.cases.tsx", import.meta.url)))};`,
`import {resolveBrandDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/brand-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./brand-list.cases.tsx", import.meta.url)))};`,
`import {resolveShippingPolicyDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/shipping-policy-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./shipping-policy.cases.tsx", import.meta.url)))};`,
`import {resolveRsvpDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/rsvp-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./rsvp-live.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./product-options.cases.tsx", import.meta.url)))};`,
`import {resolveLocaleDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/locale-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./locale.cases.tsx", import.meta.url)))};`,
`import {resolveArchiveDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/archive-adapter.ts", import.meta.url)))};`,
`import {resolveRelatedDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/related-adapter.ts", import.meta.url)))};`,
`import {resolveAlbumDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/album-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./album.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./related.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./archive.cases.tsx", import.meta.url)))};`,
`import {resolveRecipeDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/recipe-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./recipe.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./product-showcase.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./category-tiles.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./recently-viewed.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./product-hero.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./product-hero-dom.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./sale-countdown.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./sale-countdown-dom.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./cart-summary.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./assistant-handoff-dom.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./shopping-assistant.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./product-history-dom.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./product-collection-dom.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./product-collection.cases.tsx", import.meta.url)))};`,
`import {resolveProductsDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/products-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./poll-live.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./contact-live.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./contact-form.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./form-embed.cases.jsx", import.meta.url)))};`,
`import {resolveFormDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/form-adapter.ts", import.meta.url)))};`,
		`import ${JSON.stringify(cases)};`,
`import ${JSON.stringify(fileURLToPath(new URL("./events.cases.tsx", import.meta.url)))};`,
`import {resolveUpcomingEventsDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/events-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./post-grid.cases.tsx", import.meta.url)))};`,
`import {resolvePostGridDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/post-grid-adapter.ts", import.meta.url)))};`,
`import {resolveTagCloudDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/tag-cloud-adapter.ts", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./latest-posts.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./featured-products.cases.tsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./navigation.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./treatments.cases.jsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./content.cases.tsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./editorial.cases.tsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./media-details.cases.tsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./utilities.cases.tsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./contact-embeds.cases.tsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./download-library.cases.tsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./conversion.cases.tsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./newsletter-dom.cases.jsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./newsletter-handler.cases.jsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./contact-embeds-dom.cases.jsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./utilities-dom.cases.jsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./media-details-dom.cases.jsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./editorial-dom.cases.jsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./media.cases.tsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./media-dom.cases.jsx", import.meta.url)))};`,
`import ${JSON.stringify(fileURLToPath(new URL("./stage-media.cases.jsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./featured-page.cases.tsx", import.meta.url)))};`,
		`import ${JSON.stringify(fileURLToPath(new URL("./featured-page-dom.cases.jsx", import.meta.url)))};`,
		`import {createDemoContentPageHost} from ${JSON.stringify(fileURLToPath(new URL("../block-data/demo-channel.ts", import.meta.url)))};`,
		`import {resolvePollDemo} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/poll-adapter.ts", import.meta.url)))};`,
		`import {resolveCanonicalData} from ${JSON.stringify(fileURLToPath(new URL("../block-data/portable/resolve.ts", import.meta.url)))};`,
		`import {test,expect} from "bun:test";`,
		`import {PrimitiveProvider,createPackPartsRegistry} from ${JSON.stringify(fileURLToPath(new URL("../primitives/index.tsx", import.meta.url)))};`,
		...packModules.map(
			(pack, index) =>
				`import packParts${index} from ${JSON.stringify(pack.parts)};`,
		),
		`const packIds=${JSON.stringify(packs.map((pack) => pack.id))};`,
		`const packRegistry=createPackPartsRegistry({${packModules.map((pack, index) => `${JSON.stringify(pack.id)}:packParts${index}`).join(",")}});`,

		`import {renderToStaticMarkup} from "react-dom/server";`,
		`import {resolveNavigationDemo,navigationNames,navigationSpecimenTree} from ${JSON.stringify(fileURLToPath(new URL("../../../../block-demo/navigation-adapter.ts", import.meta.url)))};`,
		`import {prepareBlocks,discoverRenderers} from ${JSON.stringify(model)};`,
		...renderers.map(
			(spec, index) =>
				`import renderer${index} from ${JSON.stringify(join(repo, spec.source.replace(/block.json$/u, "render.tsx")))};`,
		),
		`const specs=${JSON.stringify(renderers)};`,
		`const library=discoverRenderers({${renderers.map((spec, index) => `${JSON.stringify("/" + spec.source.replace(/block.json$/u, "render.tsx"))}:renderer${index}`).join(",")}});`,
		`import {installPackRenderers} from ${JSON.stringify(fileURLToPath(new URL("./pack-registry.tsx", import.meta.url)))};`,
		...ownedModules.map((module, index) => `import ownedRenderer${index} from ${JSON.stringify(module.file)};`),
		`const manifests=${JSON.stringify(manifests)};`,
		`const registry=installPackRenderers(library,manifests,{${ownedModules.map((module,index)=>`${JSON.stringify(module.file)}:ownedRenderer${index}`).join(",")}});`,
		`test("every canonical example renders under every discovered pack without inheriting another pack",async()=>{ const observed=new Set();for(const packId of packIds) for(const spec of specs) for(const [index,attrs] of spec.examples.entries()) { const media={}; function collect(value){if(!value||typeof value!=="object")return;for(const [key,item] of Object.entries(value)){if((key==="mediaId"||key==="id")&&typeof item==="string"&&item)media[item]=item.startsWith("demo-video-")?{src:"/fixture.webm",alt:"Synthetic video",mimeType:"video/webm"}:item.startsWith("demo-audio-")?{src:"/fixture.wav",alt:"Synthetic silent audio",mimeType:"audio/wav"}:item.startsWith("demo-file-")?{src:"/fixture.txt",alt:"Synthetic download",mimeType:"text/plain",filename:"fixture.txt"}:{src:"/fixture.png",alt:"Fixture public media",mimeType:"image/png",width:1536,height:1024};else collect(item);}}collect(attrs);let tree=[{id:"specimen",name:spec.name,version:spec.version,attrs}];if(navigationNames.includes(spec.name))tree=navigationSpecimenTree(tree[0]);try{let demo; const policy={enabledPlugins:["events","forms","commerce","commerceReviews","commerceWishlists","commerceBundles","commerceDigital","gallery","recipes","membership","lms","tickets","knowledgeBase"],capabilities:["tree.children","reference.targetResolution","html.sanitize","embed.sandbox","map.approvedProvider","embed.approvedScript","form.submission","contact.submission","poll.submission","viewer.authorization","locale.routing","feed.approvedProvider"],disabledBlocks:[]}; if(spec.name==="core/social-feed"||spec.name==="core/lead-magnet"||spec.name==="core/ugc-grid"||spec.name==="core/search-results"||spec.name==="commerce/bundle-offer"||spec.name==="commerce/product-compare"||spec.name==="core/reviews"||spec.name==="core/event-rsvp"||spec.name==="core/language-switcher"||spec.name==="core/archive-list"||spec.name==="core/related-content"||spec.name==="support/kb-search"||spec.name==="support/ticket-cta"||spec.name==="lms/curriculum"||spec.name==="lms/progress"||spec.name==="lms/instructor"||spec.name==="certificates/verify"||spec.name==="lms/course-grid"||spec.name==="membership/plans"||spec.name==="membership/gated-teaser"||spec.name==="commerce/brand-list"||spec.name==="commerce/shipping-promise"||spec.name==="gallery/album"||spec.name==="gallery/recipe-card"||(spec.name==="commerce/variant-picker-teaser"||spec.name==="commerce/product-showcase"||spec.name==="commerce/product-hero"||spec.name==="core/featured-products"||spec.name==="blocks/product-collection"||spec.name==="commerce/sale-countdown"||spec.name==="commerce/recently-viewed"||spec.name==="commerce/category-tiles")||spec.name==="core/poll"||spec.name==="core/form"||spec.name==="core/contact-form"||spec.name==="events/upcoming"||spec.name==="events/next-event"||spec.name==="events/calendar"||spec.name==="core/post-grid"||spec.name==="core/tag-cloud"||spec.name==="core/featured-page"||navigationNames.includes(spec.name)){const current={scope:{websiteKey:"fixture",instanceKey:"fixture"},documentKey:"fixture",revision:"1",viewerKey:"fixture"};const envelope=spec.name==="core/social-feed"?await resolveSocialFeedDemo(tree,current.scope,policy):spec.name==="core/lead-magnet"?await resolveLeadMagnetDemo(tree,current.scope,policy):spec.name==="core/ugc-grid"?await resolveTaggedMediaDemo(tree,current.scope,policy):spec.name==="core/search-results"?await resolveSearchDemo(tree,current.scope,policy):spec.name==="commerce/bundle-offer"?await resolveBundleDemo(tree,current.scope,policy):spec.name==="commerce/product-compare"?await resolveProductCompareDemo(tree,current.scope,policy):spec.name==="core/event-rsvp"?await resolveRsvpDemo(tree,current.scope,policy):spec.name==="core/language-switcher"?await resolveLocaleDemo(tree,current.scope,policy):spec.name==="core/archive-list"?await resolveArchiveDemo(tree,current.scope,policy):spec.name==="core/reviews"?await resolveReviewsDemo(tree,current.scope,policy):spec.name==="core/related-content"?await resolveRelatedDemo(tree,current.scope,policy):spec.name==="support/kb-search"?await resolveKnowledgeBaseDemo(tree,current.scope,policy):spec.name==="support/ticket-cta"?await resolveSupportDemo(tree,current.scope,policy):spec.name==="lms/curriculum"?await resolveCurriculumDemo(tree,current.scope,policy):spec.name==="lms/progress"?await resolveProgressDemo(tree,current.scope,policy):spec.name==="lms/instructor"?await resolveInstructorDemo(tree,current.scope,policy):spec.name==="certificates/verify"?await resolveCertificateDemo(tree,current.scope,policy):spec.name==="lms/course-grid"?await resolveCoursesDemo(tree,current.scope,policy):spec.name==="membership/plans"?await resolveMembershipPlansDemo(tree,current.scope,policy):spec.name==="membership/gated-teaser"?await resolveMembershipDemo(tree,current.scope,policy):spec.name==="commerce/brand-list"?await resolveBrandDemo(tree,current.scope,policy):spec.name==="commerce/shipping-promise"?await resolveShippingPolicyDemo(tree,current.scope,policy):spec.name==="gallery/album"?await resolveAlbumDemo(tree,current.scope,policy):spec.name==="gallery/recipe-card"?await resolveRecipeDemo(tree,current.scope,policy):(spec.name==="commerce/variant-picker-teaser"||spec.name==="commerce/product-showcase"||spec.name==="commerce/product-hero"||spec.name==="core/featured-products"||spec.name==="blocks/product-collection"||spec.name==="commerce/sale-countdown"||spec.name==="commerce/recently-viewed"||spec.name==="commerce/category-tiles")?await resolveProductsDemo(tree,current.scope,policy):spec.name==="core/poll"?await resolvePollDemo(tree,current.scope,policy):(spec.name==="core/form"||spec.name==="core/contact-form")?await resolveFormDemo(tree,current.scope,policy):(spec.name==="events/upcoming"||spec.name==="events/next-event"||spec.name==="events/calendar")?await resolveUpcomingEventsDemo(tree,current.scope,policy):spec.name==="core/tag-cloud"?await resolveTagCloudDemo(tree,current.scope,policy):spec.name==="core/post-grid"?await resolvePostGridDemo(tree,current.scope,policy):navigationNames.includes(spec.name)?await resolveNavigationDemo(tree,current.scope,policy):await resolveCanonicalData(tree,current.scope,policy,async()=>({page:null}));demo={current,grant:createDemoContentPageHost().install({tree,policy,context:current,envelope})};}const html=renderToStaticMarkup(<PrimitiveProvider packId={packId} registry={packRegistry}>{prepareBlocks(tree,registry,{enabledPlugins:["events","forms","commerce","commerceReviews","commerceWishlists","commerceBundles","commerceDigital","gallery","recipes","membership","lms","tickets","knowledgeBase"],capabilities:["tree.children","reference.targetResolution","html.sanitize","embed.sandbox","map.approvedProvider","embed.approvedScript","form.submission","contact.submission","poll.submission","viewer.authorization","locale.routing","feed.approvedProvider"],disabledBlocks:[]},{media},demo,packId,spec.name==="core/synced"?{source:syncedExample(tree,{websiteKey:"fixture",instanceKey:"fixture"}).synced,scope:{websiteKey:"fixture",instanceKey:"fixture"}}:undefined)}</PrimitiveProvider>);expect(typeof html).toBe("string");const declared=manifests.find(pack=>pack.id===packId).blocks?.renderers??{};if(declared[spec.name])expect(html).toContain('data-pack-block="'+packId+':'+spec.name+'"');for(const match of html.matchAll(/data-pack-block="([^"]+)"/gu))expect(match[1].startsWith(packId+":" )).toBe(true);for(const match of html.matchAll(/data-pack-primitive="([^"]+)"/gu)){expect(match[1].startsWith(packId+":")).toBe(true);observed.add(match[1]);}}catch(error){throw new Error(packId+" "+spec.name+" example "+index+": "+error.message);}}for(const [packId,parts] of Object.entries(packRegistry))for(const primitive of Object.keys(parts))expect(observed.has(packId+":"+primitive)).toBe(true);});`,
	];
	source.push(`
import authoredPattern from ${JSON.stringify(join(repo, "block-kit/references/patterns/project-introduction.json"))};
test("the authored kit pattern preserves its content through every actual pack renderer", () => {
  const before = JSON.stringify(authoredPattern);
  for (const packId of packIds) {
    const html = renderToStaticMarkup(<PrimitiveProvider packId={packId} registry={packRegistry}>
      {prepareBlocks(authoredPattern.blocks, registry, {enabledPlugins:[], capabilities:["tree.children"], disabledBlocks:[]}, {media:{}}, undefined, packId)}
    </PrimitiveProvider>);
    expect(html).toContain("Good work starts with a conversation.");
    expect(html).toContain("Clarity from the first hello.");
    expect(html).toContain("A thoughtful first meeting");
    expect(html).toContain("A clear scope");
    expect(html).toContain("Room to collaborate");
    expect(html).toContain('href="/contact"');
    expect(html.match(/data-block-id=/g)).toHaveLength(5);
    const declared=manifests.find(pack=>pack.id===packId).blocks?.renderers??{};
    for(const name of ["core/section","core/feature-grid","core/cta-band"])
      if(declared[name]) expect(html).toContain('data-pack-block="'+packId+':'+name+'"');
    for(const match of html.matchAll(/data-pack-block="([^"]+)"/g)) expect(match[1].startsWith(packId+":")).toBe(true);
  }
  expect(JSON.stringify(authoredPattern)).toBe(before);
});
`);
	source.push(`
import {CompositionView} from ${JSON.stringify(join(repo,"ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/composition.tsx"))};
import {composedRenderFixture} from ${JSON.stringify(join(repo,"ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/composed.cases.tsx"))};
test("composed routing uses actual installed primitive packs", () => {
 const fixture=composedRenderFixture();
 for(const packId of packIds) {
  const html=renderToStaticMarkup(<PrimitiveProvider packId={packId} registry={packRegistry}>{prepareBlocks([fixture.node], {}, {enabledPlugins:[],capabilities:[],disabledBlocks:[]},{media:{}},undefined,packId,undefined,fixture.composed)}</PrimitiveProvider>);
  expect(html).toContain("Version 1");
  if(packRegistry[packId]?.Heading) expect(html).toContain('data-pack-primitive="'+packId+':Heading"');
 }
});
import {compositionExample,compositionFixture} from ${JSON.stringify(join(repo,"ConvexPress-Website/apps/web/block-demo/composition-study.tsx"))};
test("runtime composition renders through all installed primitive treatments and rejects invalid data before output", () => {
  for(const packId of packIds) {
    const scope=compositionFixture(packId);
    const html=renderToStaticMarkup(<PrimitiveProvider packId={packId} registry={packRegistry}><CompositionView composition={compositionExample} {...scope}/></PrimitiveProvider>);
    expect(html).toContain("A little room for the everyday.");
    expect(html.match(/<img/g)).toHaveLength(3);
    expect(html).toContain("$38.00");expect(html).toContain("$24.00");expect(html).toContain("$70.00");
    expect(html).toContain("pack="+packId);
    for(const name of ["Section","Heading","Card","Button"])
      if(packRegistry[packId]?.[name]) expect(html).toContain('data-pack-primitive="'+packId+':'+name+'"');
    const empty=renderToStaticMarkup(<CompositionView composition={compositionExample} {...compositionFixture(packId,"empty")}/>);
    expect(empty).toContain("Nothing in this collection yet");expect(empty).not.toContain("<img");
    expect(()=>renderToStaticMarkup(<CompositionView composition={compositionExample} {...compositionFixture(packId,"unsafe")}/>)).toThrow();
  }
});
`);
	writeFileSync(entry, source.join("\n"));
	const result = await Bun.build({
		entrypoints: [entry],
		target: "bun",
		outdir: directory,
		naming: { entry: "model.test.[ext]", asset: "[name]-[hash].[ext]" },
		external: ["bun:test"],
		plugins: [
			{
				name: "existing-workspace-runtime",
				setup(build) {
					build.onResolve({ filter: /^jsdom$/u }, () => ({
						path: join(runtimeRoot, "jsdom/lib/api.js"),
						external: true,
					}));
					build.onResolve(
						{ filter: /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|zod)$/u },
						(args) => ({ path: resolveRuntime(args.path) }),
					);
				},
			},
		],
	});
	if (!result.success) throw new Error(result.logs.join("\n"));
	const tests = spawnSync(
		process.execPath,
		["test", join(directory, "model.test.js")],
		{ encoding: "utf8" },
	);
	process.stdout.write(tests.stdout);
	process.stderr.write(tests.stderr);
	process.exitCode = tests.status ?? 1;
} finally {
	rmSync(directory, { recursive: true, force: true });
}
