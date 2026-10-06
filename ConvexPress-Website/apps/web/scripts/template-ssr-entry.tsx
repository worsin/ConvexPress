import { createElement, Suspense } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import type { SurfaceComponent } from "../src/templates/sdk/types";

const homes = import.meta.glob("../src/templates/packs/*/surfaces/home.tsx", { eager: true, import: "default" }) as Record<string, SurfaceComponent<any>>;
/** Loading-state SSR catches import-time browser globals and broken pack component contracts. */
for (const [path, Home] of Object.entries(homes)) {
  const packId = path.split("/packs/")[1].split("/")[0];
  const html = renderToStaticMarkup(createElement(Home, { data: { frontPage: undefined, latestPosts: undefined }, packId }));
  if (!html || /undefined|\[object Object\]/.test(html)) throw new Error(`${packId}: invalid loading-state SSR output`);
  console.log(`SSR loading fixture passed: ${packId} (${html.length} bytes)`);
}

// The real canonical body requires the same provider boundary as the app.
// SSR runs no subscriptions/effects; this offline client never contacts a site.
const offlineClient = new ConvexReactClient("https://template-ssr.invalid", { skipConvexDeploymentUrlCheck: true });
const anonymousAuth = () => ({isLoading:false,isAuthenticated:false,fetchAccessToken:async()=>null});
// Authored cover exercises escaping and media projection without a network request.
const AsterHome = homes["../src/templates/packs/aster-house/surfaces/home.tsx"];
const cover = renderToStaticMarkup(createElement(ConvexProviderWithAuth, {client:offlineClient,useAuth:anonymousAuth}, createElement(AsterHome, {
  packId: "aster-house",
  data: { frontPage: { _id: "fixture-page", title: "A place <outside>", excerpt: "An authored introduction.", slug:"fixture-page", path:"/", featuredImageUrl: "https://example.invalid/fixture-cover.jpg", featuredImageAlt: "Authored mountain photograph" }, latestPosts: [] },
})));
for (const expected of ["A place &lt;outside&gt;", "An authored introduction.", "https://example.invalid/fixture-cover.jpg", "Authored mountain photograph"]) {
  if (!cover.includes(expected)) throw new Error(`Aster authored cover omitted or failed to escape: ${expected}`);
}
console.log(`SSR authored cover passed: aster-house (${cover.length} bytes)`);


// Exercise the production lazy registry, not just direct surface imports.
const {resolveSurface}=await import('../src/templates/sdk/registry');
for(const packId of ['core','journal','depot','aster-house']){
 const selected=resolveSurface('home',{active:packId,overrides:{},variants:{},settings:{}});
 if(selected.packId!==packId||!selected.component)throw Error('Incorrect surface resolution: '+packId);
 const stream=await renderToReadableStream(createElement(Suspense,{fallback:null},createElement(selected.component,{packId,data:{frontPage:undefined,latestPosts:undefined}})));
 await stream.allReady;const html=await new Response(stream).text();
 if(!html||!html.includes('<!--$-->')||html.includes('Switched to client rendering'))throw Error('Lazy surface did not finish server rendering: '+packId);
 console.log('Lazy registry SSR passed: '+packId+' ('+html.length+' bytes)');
}
const overridden=resolveSurface('home',{active:'depot',overrides:{home:'journal'},variants:{},settings:{}});
if(overridden.packId!=='journal')throw Error('Per-surface override lost precedence');
const missing=resolveSurface('uninstalled-surface',{active:'depot',overrides:{},variants:{},settings:{}});
if(missing.component!==null)throw Error('Missing surface invented a component');

// The hydration preparation must load exactly the server-rendered surfaces,
// including overrides, and leave all unrelated packs/routes deferred.
const { prepareTemplateHydration, TEMPLATE_PACKS } = await import('../src/templates/sdk/registry');
const before = new Map([...TEMPLATE_PACKS].flatMap(([id, pack]) =>
  Object.entries(pack.surfaces).map(([name, component]) => [`${id}/${name}`, component] as const)));
const markers = [
  ['core', 'home'], ['journal', 'home'], ['journal', 'home'],
  ['missing-pack', 'home'], ['depot', 'missing-surface'], ['../../external', 'home'],
];
await prepareTemplateHydration({
  querySelectorAll: () => markers.map(([pack, surface]) => ({
    getAttribute: (name: string) => name === 'data-template' ? pack : surface,
  })),
} as unknown as ParentNode);
for (const [id, pack] of TEMPLATE_PACKS) {
  for (const [name, component] of Object.entries(pack.surfaces)) {
    const selected = name === 'home' && (id === 'core' || id === 'journal');
    if (selected) {
      if (component !== homes[`../src/templates/packs/${id}/surfaces/home.tsx`]) throw Error('Hydrating surface still lazy: ' + id);
    } else if (component !== before.get(`${id}/${name}`)) throw Error('Unselected surface changed: ' + id + '/' + name);
  }
}
console.log('Selective hydration preparation passed: two selected surfaces; duplicate/unknown markers ignored; unrelated surfaces unchanged');

// Legacy content must still stream real, escaped markup through its deferred
// facade. Disabling insertion of a block must not erase existing authored text.
const { BlockListRenderer } = await import('../src/components/blocks/BlockListRenderer');
const legacyStream = await renderToReadableStream(createElement(BlockListRenderer, {
  disabledBlockNames: ['core/paragraph'],
  blocks: [
    { id: 'heading', name: 'core/heading', version: 1, attrs: { text: 'Legacy compatibility', level: 2 } },
    { id: 'paragraph', name: 'core/paragraph', version: 1, attrs: { body: 'Literal <script> content stays text.' } },
    { id: 'accordion', name: 'core/accordion', version: 1, attrs: { items: [{ title: 'Compatibility details', body: 'An existing disclosure.' }], defaultOpen: 0 } },
  ],
}));
await legacyStream.allReady;
const legacyHtml = await new Response(legacyStream).text();
for (const expected of ['data-slot="block-list-renderer"', 'Legacy compatibility', 'Literal &lt;script&gt; content stays text.', 'data-block-disabled="true"', '<details open=""', 'Compatibility details']) {
  if (!legacyHtml.includes(expected)) throw Error('Deferred legacy SSR lost content: ' + expected);
}
if (legacyHtml.includes('Switched to client rendering')) throw Error('Deferred legacy SSR fell back to client rendering');
console.log('Deferred legacy SSR passed: escaped text, disabled existing content and native disclosure preserved');

// Real lazy canonical discovery must stream complete nested, reusable and custom
// trees. These are explicit offline fixtures, never public-data fallbacks.
const { CanonicalDocumentView } = await import('../src/templates/sdk/block-preview/CanonicalDocumentView');
const { sharedPlacements, syncedExample } = await import('../block-demo/synced-adapter');
const { encodeComposedDefinition } = await import('../src/templates/sdk/block-data/portable/composedDefinitions');
const blockScope = {websiteKey:'ssr-fixture',instanceKey:'ssr-fixture'};
const blockPolicy = {enabledPlugins:[],capabilities:['tree.children','reference.targetResolution'],disabledBlocks:[]};
const rich = (text: string) => ({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
const nestedTree = [{id:'parent',name:'core/section',version:1,attrs:{},children:[{id:'title',name:'core/heading',version:2,attrs:{level:2,text:rich('Lazy nested heading')}},{id:'copy',name:'core/paragraph',version:2,attrs:{body:rich('Lazy nested paragraph')}}]}];
const shared = syncedExample(sharedPlacements,blockScope);
const customScope={...blockScope,deploymentOrigin:'https://ssr-fixture.invalid'};
const customSpec={name:'composed/lazy-introduction',title:'Lazy introduction',description:'SSR fixture',category:'text',role:'content',version:1,keywords:[],ai:{useFor:'SSR fixture',avoid:'Production content'},fields:[{id:'title',type:'text',default:'Lazy custom introduction',max:80}],supports:{children:true,styles:false,layout:['tone'],anchor:true,visibility:false},data:null,preview:'{title}',examples:[{}]};
const encoded=encodeComposedDefinition({spec:customSpec,composition:{version:1,root:{el:'Stack',children:[{el:'Heading',bind:'attrs.title'},{el:'Slot',props:{name:'children'}}]}}});
const custom={scope:customScope,definitions:{scope:customScope,definitions:[{name:customSpec.name,version:1,digest:encoded.digest,definitionJson:encoded.json}]}};
for(const packId of ['core','journal','depot','aster-house']){
 for(const scenario of [
  {name:'nested',tree:nestedTree,expected:['Lazy nested heading','Lazy nested paragraph']},
  {name:'reusable',tree:shared.blocks,synced:shared.synced,scope:blockScope,expected:['One idea. Everywhere.','A small studio with a shared point of view.']},
  {name:'custom',tree:[{id:'custom',name:customSpec.name,version:1,attrs:{},children:[nestedTree[0]]}],composed:custom,expected:['Lazy custom introduction','Lazy nested heading']},
 ]){
  const stream=await renderToReadableStream(createElement(Suspense,{fallback:createElement('p',null,'Waiting for blocks')},createElement(CanonicalDocumentView,{...scenario,packId,policy:blockPolicy,resources:{media:{}}})));
  await stream.allReady;const html=await new Response(stream).text();
  for(const expected of scenario.expected)if(!html.includes(expected))throw Error(`${packId}/${scenario.name}: omitted ${expected}`);
  if(html.includes('Waiting for blocks')||html.includes('Switched to client rendering'))throw Error(`${packId}/${scenario.name}: incomplete canonical SSR`);
  if(!html.includes('data-canonical-pack="'+packId+'"'))throw Error('Missing canonical hydration marker');
  console.log('Lazy canonical SSR passed: '+packId+'/'+scenario.name);
 }
}

await offlineClient.close();
