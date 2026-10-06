import {dependencyDescriptors} from "../block-data/portable/generated/metadata";
import {productHistoryDigest} from "../block-data/portable/productCollectionContracts";
import {resolveCanonicalData} from "../block-data/portable/resolve";
import {validateCanonicalTree} from "../block-data/portable/generated/instances";
import { expect, test, mock } from "bun:test";
import { act, StrictMode, useSyncExternalStore } from "react";
import { readInstalledPageData, pageDataSubscription } from "../block-data/installed-page-data";
import { JSDOM } from "jsdom";
import { canonicalContentDigest } from "../block-data/portable/documentContracts";
import {resolveSyncedOccurrencesSnapshot} from "../block-data/portable/syncedOccurrences";
import {createSyncedDisplay,resolveSyncedDisplay} from "../block-data/portable/syncedDisplay";
import {syncedContentDigest} from "../block-data/portable/syncedContent";
let auth = {
		isLoaded: true,
		isSignedIn: true,
		userId: "reader_a",
		sessionId: "session_a",
	},
	convexAuth = { isLoading: false, isAuthenticated: true };
let operator = {active:false};
mock.module("@/lib/auth/WebsiteOperatorContext", () => ({useWebsiteOperator:()=>operator}));
let templateSettings = { packId: "core", savedPackId: "core" };
let siteInstance = "stage", history = {ids:[],ready:true};
const watches = [];
let lastInstallation;
let transport = {
  url: "https://public-test.convex.cloud",
	watchQuery(_name, args) {
		const watch = {
			args,
			value: undefined,
			stopped: false,
			listener: () => {},
			localQueryResult() {
				if (this.value instanceof Error) throw this.value;
				return this.value;
			},
			onUpdate(listener) {
				this.listener = listener;
				return () => {
					this.stopped = true;
				};
			},
		};
		watches.push(watch);
		return watch;
	},
};
mock.module("@/lib/auth/clerk", () => ({ useAuth: () => auth }));
const actualRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router",()=>({...actualRouter,useLocation:({select})=>select({href:"/page/page"})}));
const actualConvexReact = await import("convex/react");
mock.module("convex/react", () => ({
  ...actualConvexReact,
	useConvex: () => transport,
	useConvexAuth: () => convexAuth,
  useQuery: () => { throw Error("Unexpected direct page query"); },
  useMutation: () => { throw Error("Unexpected page mutation hook"); },
  useAction: () => { throw Error("Unexpected page action hook"); },
}));
mock.module("@/lib/site-runtime", () => ({
	getSiteRuntime: () => ({ instanceKey: siteInstance }),
}));
mock.module("../useTemplateSettings", () => ({
	useTemplateSettings: () => templateSettings,
}));
// View paint alone is isolated. The exact parser, data installer and component
// lifecycle remain real; workerd separately renders all four actual packs.
mock.module("../block-preview/CanonicalDocumentView", () => ({
	CanonicalDocumentView: ({tree,policy,data,synced,scope,composed,packId}) => {
    const displayTree=synced?resolveSyncedDisplay(synced,validateCanonicalTree(tree),scope).resolverTree:tree;
    const subscription=pageDataSubscription(data.grant);
    useSyncExternalStore(subscription.subscribe,subscription.getSnapshot,subscription.getSnapshot);
    try { readInstalledPageData(data,displayTree,policy,composed);lastInstallation={data,tree:displayTree,policy,composed};return <article data-pack={packId}>Authorized body<details><summary>Course module</summary><p>Lesson outline</p></details><a href="?next=1">Continue outline</a></article>; }
    catch { return <p>Installed data unavailable</p>; }
  },
}));
// Submission adapters are covered by their own production-provider DOM suites.
// This lifecycle harness isolates paint while keeping authorization/install real.
mock.module("../block-renderer/form-embed-production", () => ({ ProductionFormEmbedProvider: ({children}) => children }));
mock.module("../block-renderer/lead-magnet-production", () => ({ ProductionLeadMagnetProvider: ({children}) => children }));
mock.module("../block-renderer/download-library-production", () => ({ ProductionDownloadLibraryProvider: ({children}) => children }));
mock.module("../block-renderer/bundle-production", () => ({ ProductionBundleProvider: ({children}) => children }));
mock.module("../block-renderer/wishlist-production", () => ({ ProductionWishlistProvider: ({children}) => children }));
mock.module("../block-renderer/certificate-production", () => ({ ProductionCertificateProvider: ({children}) => children }));
mock.module("../block-renderer/newsletter-production", () => ({ ProductionNewsletterProvider: ({children}) => children }));
mock.module("../block-renderer/cart-summary-production", () => ({ ProductionCartSummaryProvider: ({children}) => children }));
mock.module("../block-renderer/shopping-assistant-production", () => ({ ProductionShoppingAssistantProvider: ({children}) => children }));
mock.module("../block-renderer/collection-cart-production", () => ({ ProductionCollectionCartProvider: ({children}) => children }));
mock.module("../block-renderer/rsvp-production", () => ({ ProductionRsvpProvider: ({children}) => children, RsvpDraftScope: ({children}) => children }));
mock.module("../block-renderer/poll-production", () => ({ ProductionPollProvider: ({children}) => children, PollDraftScope: ({children}) => children }));
const actualHistory = await import("../../../hooks/useProductHistory");
const realUseProductHistory = actualHistory.useProductHistory;
let realHistory = false;
mock.module("../../../hooks/useProductHistory",()=>({useProductHistory:(enabled)=>realHistory ? realUseProductHistory(enabled) : history}));
const { PublicCanonicalBody, PublicCanonicalScope } = await import(
	"./PublicCanonicalBody"
);
const scope = { websiteKey: "site", instanceKey: "stage" };
const ready = (subject) => ({
	contract: "canonical-public-document-v1",
	state: "ready",
	viewerSubject: subject,
	accessLease: subject === null ? null : { evaluatedAt: Date.now(), expiresAt: Date.now() + 60000 },
	scope,
	document: {
		id: "page",
		type: "page",
		title: "Private body",
		path: "/page",
		blocksVersion: 2,
		revision: 1,
		digest: canonicalContentDigest("Private body", []),
		blocks: [],
	},
	presentation: { packId: "core", revision: "a".repeat(64) },
	policy: { enabledPlugins: [], capabilities: [], disabledBlocks: [] },
	data: { contract: "canonical-data-v1", scope, dataByBlock: {} },
	resources: { media: {} },
});
test("real public body clears on viewer/session/client change, refuses mismatched cached auth, late updates and errors", async () => {
	const dom = new JSDOM('<div id="app"></div>', {
			url: "https://site.example.invalid",
		}),
		previous = {};
	for (const name of [
		"window",
		"document",
		"navigator",
		"HTMLElement",
		"Event",
		"IS_REACT_ACT_ENVIRONMENT",
	]) {
		previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
		});
	}
	const { createRoot } = await import("react-dom/client"),
		root = createRoot(document.getElementById("app"));
	const render = () =>
		root.render(
			<StrictMode><PublicCanonicalScope documentId="page" initial={null}>
				<PublicCanonicalBody documentId="page" />
			</PublicCanonicalScope></StrictMode>,
		);
	const deliver = async (value) => {
		const w = watches.at(-1);
		w.value = value;
		await act(async () => w.listener());
	};
	try {
		await act(async () => render());
		const first = watches.at(-1);
		await deliver(ready("reader_a"));
		expect(document.body.textContent.includes("Authorized body")).toBe(true);
    // A temporary installed-pack preview uses the authorized saved presentation.
    // A real saved activation mismatch still hides the body until its DTO catches up.
    templateSettings = { packId: "journal", savedPackId: "core" };
    await act(async () => render());
    expect(document.querySelector("article")?.dataset.pack).toBe("journal");
    templateSettings = { packId: "journal", savedPackId: "depot" };
    await act(async () => render());
    expect(document.body.textContent.includes("Authorized body")).toBe(false);
    const activated = ready("reader_a");
    activated.presentation.packId = "depot";
    await deliver(activated);
    expect(document.querySelector("article")?.dataset.pack).toBe("journal");
    await deliver(ready("reader_b"));
    expect(document.body.textContent.includes("Authorized body")).toBe(false);
    templateSettings = { packId: "core", savedPackId: "core" };
    await act(async () => render());
    await deliver(ready("reader_a"));
    const firstInstallation=lastInstallation;
    const expiring = ready("reader_a");
    expiring.accessLease.expiresAt = expiring.accessLease.evaluatedAt + 200;
    await deliver(expiring);
    expect(document.body.textContent.includes("Authorized body")).toBe(true);
    const beforeExpiry = watches.at(-1), beforeExpiryCount = watches.length;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
    expect(document.body.textContent.includes("Authorized body")).toBe(false);
    expect(document.body.textContent.includes("Loading document")).toBe(true);
    expect(watches.length).toBe(beforeExpiryCount + 1);
    expect(beforeExpiry.stopped).toBe(true);
    expect(watches.at(-1).args.refreshKey).not.toBe(beforeExpiry.args.refreshKey);
    await act(async () => beforeExpiry.listener());
    expect(document.body.textContent.includes("Authorized body")).toBe(false);
    await deliver(ready("reader_a"));
    expect(document.body.textContent.includes("Authorized body")).toBe(true);
    // A data-only refresh must not cancel the authority timer and leave the
    // previous protected result mounted indefinitely while offline.
    const timedMember = ready("reader_a"), memberAsOf = Date.now();
    const memberEvent = {id:"event",title:"Starting shortly",href:"/events/shortly",description:null,startsAt:memberAsOf+50,endsAt:memberAsOf+100000,timeZone:"UTC",venue:""};
    timedMember.policy = {enabledPlugins:["events"],capabilities:["reference.targetResolution"],disabledBlocks:[]};
    timedMember.document.blocks = validateCanonicalTree([{id:"gatherings",name:"events/upcoming",version:1,attrs:{}}]);
    timedMember.document.digest = canonicalContentDigest(timedMember.document.title,timedMember.document.blocks);
    timedMember.data = await resolveCanonicalData(timedMember.document.blocks,scope,timedMember.policy,async()=>null,undefined,undefined,undefined,{},async()=>({asOf:memberAsOf,items:[memberEvent]}));
    await deliver(timedMember);
    expect(document.body.textContent.includes("Authorized body")).toBe(true);
    const beforeTimedRefresh = watches.at(-1);
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1100));});
    expect(beforeTimedRefresh.stopped).toBe(true);
    expect(document.body.textContent.includes("Authorized body")).toBe(false);
    await deliver(ready("reader_a"));
		auth = { ...auth, userId: "reader_b", sessionId: "session_b" };
		await act(async () => render());
    expect(()=>readInstalledPageData(firstInstallation.data,firstInstallation.tree,firstInstallation.policy)).toThrow("invalidated");
		expect(first.stopped).toBe(true);
		expect(document.body.textContent.includes("Authorized body")).toBe(false);
		expect(watches.at(-1).args.refreshKey === first.args.refreshKey).toBe(
			false,
		);
		await deliver(ready("reader_a"));
		expect(document.body.textContent.includes("Authorized body")).toBe(false);
		await deliver(ready("reader_b"));
		expect(document.body.textContent.includes("Authorized body")).toBe(true);
		const second = watches.at(-1);
		auth = { ...auth, isSignedIn: false, userId: null, sessionId: null };
		convexAuth = { isLoading: false, isAuthenticated: false };
		await act(async () => render());
		expect(document.body.textContent.includes("Authorized body")).toBe(false);
		await act(async () => second.listener());
		expect(document.body.textContent.includes("Authorized body")).toBe(false);
		await deliver(ready(null));
		expect(document.body.textContent.includes("Authorized body")).toBe(true);
    for(const name of ['events/upcoming','events/next-event']) {
      const timed=ready(null),asOf=Date.now(),event={id:'event',title:'Starting shortly',href:'/events/shortly',description:null,startsAt:asOf+50,endsAt:asOf+100000,timeZone:'UTC',venue:''};
      timed.policy={enabledPlugins:['events'],capabilities:['reference.targetResolution'],disabledBlocks:[]};
      timed.document.blocks=validateCanonicalTree([{id:'gatherings',name,version:1,attrs:{}}]);
      timed.document.digest=canonicalContentDigest(timed.document.title,timed.document.blocks);
      timed.data=await resolveCanonicalData(timed.document.blocks,scope,timed.policy,async()=>null,undefined,undefined,undefined,{},async()=>({asOf,items:[event]}),async()=>({asOf,categoryId:null,event}));
      await deliver(timed);
      const beforeRefresh=watches.at(-1),watchCount=watches.length;
      await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1100));});
      expect(watches.length).toBe(watchCount+1);expect(beforeRefresh.stopped).toBe(true);
      expect(watches.at(-1).args.refreshKey).not.toBe(beforeRefresh.args.refreshKey);
      expect(document.body.textContent.includes('Authorized body')).toBe(true);
      await deliver(ready(null));
    }

		await deliver(new Error("revoked"));
		expect(document.body.textContent.includes("Authorized body")).toBe(false);
		transport = { ...transport };
		await act(async () => render());
		expect(document.body.textContent.includes("Loading document")).toBe(true);
    await deliver(ready(null));const finalInstallation=lastInstallation;
    expect(document.body.textContent.includes("Authorized body")).toBe(true);
		await act(async () => root.unmount());
    expect(()=>readInstalledPageData(finalInstallation.data,finalInstallation.tree,finalInstallation.policy)).toThrow("invalidated");
		expect(watches.at(-1).stopped).toBe(true);
	} finally {
    templateSettings = { packId: "core", savedPackId: "core" };
		dom.window.close();
		for (const [name, value] of Object.entries(previous)) {
			if (value) Object.defineProperty(globalThis, name, value);
			else delete globalThis[name];
		}
	}
});


test("anonymous SSR handoff preserves the disclosure DOM and an in-flight pointer target until the live result arrives", async () => {
 const {renderToString}=await import('react-dom/server');
 auth={isLoaded:false,isSignedIn:undefined,userId:undefined,sessionId:undefined};convexAuth={isLoading:true,isAuthenticated:false};
 const initial={...ready(null),historyDigest:productHistoryDigest([])},view=()=> <StrictMode><PublicCanonicalScope documentId="page" initial={initial}><PublicCanonicalBody documentId="page"/></PublicCanonicalScope></StrictMode>;
 const html=renderToString(view()),dom=new JSDOM('<div id="app">'+html+'</div>',{url:'https://site.example.invalid'}),previous={};
 for(const name of ['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT']){previous[name]=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});}
 const original=document.querySelector('article'),disclosure=original.querySelector('details'),target=original.querySelector('a');disclosure.open=true;
 let clicks=0;target.addEventListener('click',e=>{e.preventDefault();clicks++;});
 target.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true}));
 const {hydrateRoot}=await import('react-dom/client');let root;
 try{
  await act(async()=>{root=hydrateRoot(document.getElementById('app'),view());});
  expect(document.querySelector('article') === original).toBe(true);expect(disclosure.open).toBe(true);
  auth={isLoaded:true,isSignedIn:false,userId:null,sessionId:null};convexAuth={isLoading:false,isAuthenticated:false};
  await act(async()=>root.render(view()));
  expect(document.querySelector('article') === original).toBe(true);expect(disclosure.open).toBe(true);
  const w=watches.at(-1);w.value={...ready(null),historyDigest:productHistoryDigest([])};await act(async()=>w.listener());
  expect(document.querySelector('article') === original).toBe(true);expect(disclosure.open).toBe(true);
  target.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));target.click();expect(clicks).toBe(1);
  w.value=new Error('revoked');await act(async()=>w.listener());expect(document.querySelector('article')).toBeNull();
  await act(async()=>root.render(view()));expect(document.querySelector('article')).toBeNull();
 }finally{if(root)await act(async()=>root.unmount());dom.window.close();for(const [name,value] of Object.entries(previous)){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}
});


async function withSeededBody(initial,check,bodyProps={},pageView){
 auth={isLoaded:true,isSignedIn:false,userId:null,sessionId:null};convexAuth={isLoading:false,isAuthenticated:false};siteInstance='stage';history={ids:[],ready:true};
 const dom=new JSDOM('<div id="app"></div>',{url:'https://site.example.invalid'}),previous={};
 for(const name of ['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT']){previous[name]=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('app'));
 const props={documentId:'page',initial};
 const render=()=>act(async()=>root.render(<PublicCanonicalScope {...props}>{pageView ? pageView() : <PublicCanonicalBody documentId={props.documentId} {...bodyProps}/>}</PublicCanonicalScope>));
 try{await render();await check({props,render});}finally{await act(async()=>root.unmount());dom.window.close();siteInstance='stage';history={ids:[],ready:true};for(const [name,value] of Object.entries(previous)){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}
}
test('public reusable source-only updates reach the display and revoke the previous installation without a page revision change',async()=>{
 const make=async revision=>{
  const value={...ready(null),historyDigest:productHistoryDigest([])};
  value.policy={enabledPlugins:[],capabilities:['tree.children','reference.targetResolution'],disabledBlocks:[]};
  value.document.blocks=validateCanonicalTree([{id:'shared',name:'core/synced',version:1,attrs:{syncedBlock:'source',revisionPolicy:'latest'}}]);
  value.document.digest=canonicalContentDigest(value.document.title,value.document.blocks);
  const installation={...scope,deploymentOrigin:'https://public-test.convex.cloud'},title='Shared copy';
  const blocks=[{id:'copy',name:'core/paragraph',version:2,attrs:{body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Revision '+revision}]}]}}}];
  const plan=resolveSyncedOccurrencesSnapshot(value.document.blocks,installation,()=>({id:'source',revision,title,blocks,digest:syncedContentDigest(title,blocks),scope:installation,published:true}));
  value.synced=createSyncedDisplay(plan);value.data=await resolveCanonicalData(plan.resolverTree,scope,value.policy,async()=>null);return value;
 };
 const before=await make(1),after=await make(2);
 expect(before.document).toEqual(after.document);
 await withSeededBody(before,async()=>{
  expect(document.querySelector('article')).not.toBeNull();
  const original=lastInstallation;expect(JSON.stringify(original.tree)).toContain('Revision 1');
  const w=watches.at(-1);w.value=after;await act(async()=>w.listener());
  expect(document.querySelector('article')).not.toBeNull();expect(JSON.stringify(lastInstallation.tree)).toContain('Revision 2');
  expect(lastInstallation.tree[0].id).toBe(original.tree[0].id);
  expect(()=>readInstalledPageData(original.data,original.tree,original.policy)).toThrow('invalidated');
 });
});
test('a nonempty SSR seed never reappears after password, pagination, history, installation or document changes',async()=>{
 await withSeededBody({...ready(null),historyDigest:productHistoryDigest([])},async({props,render})=>{
  expect(document.querySelector('article')!==null).toBe(true);
  for(const change of [()=>props.password='new-password',()=>props.request={grid:'next'},()=>history={ids:['product-one'],ready:true},()=>siteInstance='other',()=>props.documentId='other-page']){
   const old=watches.at(-1);change();await render();expect(document.querySelector('article')).toBeNull();expect(old.stopped).toBe(true);
   old.value={...ready(null),historyDigest:productHistoryDigest([])};await act(async()=>old.listener());expect(document.querySelector('article')).toBeNull();
  }
 });
});
test('leased SSR content is withheld after mount and a timed anonymous seed expires while its first live read is pending',async()=>{
 const leased=ready(null);leased.accessLease={evaluatedAt:Date.now(),expiresAt:Date.now()+60000};
 await withSeededBody(leased,async()=>{expect(document.querySelector('article')).toBeNull();expect(document.body.textContent).toContain('Loading document');});
 const timed=ready(null),asOf=Date.now(),event={id:'event',title:'Starting shortly',href:'/events/shortly',description:null,startsAt:asOf+50,endsAt:asOf+100000,timeZone:'UTC',venue:''};
 timed.policy={enabledPlugins:['events'],capabilities:['reference.targetResolution'],disabledBlocks:[]};
 timed.document.blocks=validateCanonicalTree([{id:'gatherings',name:'events/upcoming',version:1,attrs:{}}]);timed.document.digest=canonicalContentDigest(timed.document.title,timed.document.blocks);
 timed.data=await resolveCanonicalData(timed.document.blocks,scope,timed.policy,async()=>null,undefined,undefined,undefined,{},async()=>({asOf,items:[event]}));
 await withSeededBody(timed,async()=>{expect(document.querySelector('article')!==null).toBe(true);await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1100));});expect(document.querySelector('article')).toBeNull();});
});

test('the real public document lifecycle binds custom definitions and clears their grant on access loss',async()=>{
 const {encodeComposedDefinition}=await import('../block-data/portable/composedDefinitions');
 const {createComposedRegistry}=await import('../block-data/portable/composedRegistry');
 const {resolveCanonicalDataWithDefinitions}=await import('../block-data/portable/resolve');
 const installation={...scope,deploymentOrigin:'https://public-test.convex.cloud'};
 const definition=encodeComposedDefinition({spec:{name:'composed/public-note',title:'Public note',description:'Public lifecycle fixture',category:'text',role:'content',version:1,keywords:[],ai:{useFor:'Note',avoid:'Navigation'},fields:[{id:'title',type:'text',default:'Note'}],supports:{children:false,styles:false,layout:[],anchor:false,visibility:false},data:{resolver:'site.info',args:{}},preview:'{title}',examples:[{}]},composition:{version:1,root:{el:'Heading',bind:'data.name'}}});
 const definitions={scope:installation,definitions:[{name:definition.definition.spec.name,version:1,digest:definition.digest,definitionJson:definition.json}]},composed={scope:installation,definitions};
 const value={...ready(null),historyDigest:productHistoryDigest([])};
 value.document.blocks=createComposedRegistry(definitions,installation).validateTree([{id:'custom',name:'composed/public-note',version:1,attrs:{}}]);
 value.document.composedDefinitions=definitions;
 value.document.digest=canonicalContentDigest(value.document.title,value.document.blocks,composed);
 value.data=await resolveCanonicalDataWithDefinitions(value.document.blocks,scope,value.policy,{readPage:async()=>null,readNavigation:async()=>({name:'Current site',tagline:null,logo:null})},composed);
 await withSeededBody(value,async()=>{
  expect(document.querySelector('article')).not.toBeNull();
  const installed=lastInstallation;
  expect(installed.composed).toEqual(composed);
  expect(readInstalledPageData(installed.data,installed.tree,installed.policy,installed.composed).dataByBlock.custom.data.name).toBe('Current site');
  const watch=watches.at(-1);watch.value=new Error('access revoked');await act(async()=>watch.listener());
  expect(document.querySelector('article')).toBeNull();
  expect(()=>readInstalledPageData(installed.data,installed.tree,installed.policy,installed.composed)).toThrow('invalidated');
 });
});


test('template layout uses the current validated public opening role and restores the title on access loss', async()=>{
 const layout=(body,opensWithHero)=><>{!opensWithHero&&<h1>Page heading</h1>}<div data-slot="body-wrapper">{body}</div></>;
 await withSeededBody(ready(null),async()=>{
  expect(document.querySelector('h1')?.textContent).toBe('Page heading');
  const w=watches.at(-1), count=watches.length;
  const deliver=async value=>{w.value=value;await act(async()=>w.listener());};
  for(const name of ['core/hero-text-only','core/hero-video']){
   const value=ready(null);
   value.policy.capabilities=['reference.targetResolution'];
   value.document.blocks=validateCanonicalTree([{id:'opening',name,version:dependencyDescriptors[name].version,attrs:{title:'Hero heading'}}]);
   value.document.digest=canonicalContentDigest(value.document.title,value.document.blocks);
   value.data=await resolveCanonicalData(value.document.blocks,scope,value.policy,async()=>null);
   await deliver(value);
   expect(document.querySelector('h1')).toBeNull();
   expect(document.querySelector('[data-slot="body-wrapper"]')?.textContent).toContain('Authorized body');
  }
  await deliver(ready(null));
  expect(document.querySelector('h1')?.textContent).toBe('Page heading');
  await deliver(new Error('access revoked'));
  expect(document.querySelector('h1')?.textContent).toBe('Page heading');
  expect(document.body.textContent).not.toContain('Authorized body');
  expect(watches.length).toBe(count);
 },{renderLayout:layout});
});


test('all four actual page surfaces suppress their title only for the current canonical hero',async()=>{
 const {PageContent}=await import('../../../components/blog/PageContent');
 const {default:Journal}=await import('../../packs/journal/surfaces/page');
 const {default:Depot}=await import('../../packs/depot/surfaces/page');
 const {default:Aster}=await import('../../packs/aster-house/surfaces/page');
 const page={_id:'page',title:'Template page title',slug:'page',path:'/page',content:null,blocksVersion:2,contentMode:'blocks',children:[],breadcrumbs:[]};
 const views=[()=> <PageContent page={page}/>, ...[Journal,Depot,Aster].map(Surface=>()=> <Surface data={{page}} variant="no-sidebar"/>)];
 for(const view of views){
  await withSeededBody(ready(null),async()=>{
   expect(document.querySelector('h1')?.textContent).toBe(page.title);
   const value=ready(null), name='core/hero-video';
   value.policy.capabilities=['reference.targetResolution'];
   value.document.blocks=validateCanonicalTree([{id:'opening',name,version:dependencyDescriptors[name].version,attrs:{title:'Hero heading'}}]);
   value.document.digest=canonicalContentDigest(value.document.title,value.document.blocks);
   value.data=await resolveCanonicalData(value.document.blocks,scope,value.policy,async()=>null);
   const {renderToStaticMarkup}=await import('react-dom/server');
   const ssr=renderToStaticMarkup(<PublicCanonicalScope documentId="page" initial={value}>{view()}</PublicCanonicalScope>);
   expect(ssr).not.toContain('<h1');
   expect(ssr).toContain('Authorized body');
   const w=watches.at(-1);w.value=value;await act(async()=>w.listener());
   expect(document.querySelector('h1')).toBeNull();
   expect(document.body.textContent).toContain('Authorized body');
   w.value=ready(null);await act(async()=>w.listener());
   expect(document.querySelectorAll('h1')).toHaveLength(1);
  },{},view);
 }
});

mock.module('@/hooks/layout/useSiteIdentity',()=>({useSiteIdentity:()=>({title:'Aster fixture',tagline:'A considered stay'})}));
test('Aster home follows the authorized current hero and ignores archived route body/mode, including access loss',async()=>{
 const {default:AsterHome}=await import('../../packs/aster-house/surfaces/home');
 const frontPage={_id:'page',title:'Fallback cover title',slug:'home',path:'/',excerpt:'Cover description',children:[],contentMode:'article',blocks:[{name:'core/paragraph'}],blocksVersion:1};
 const view=()=> <AsterHome data={{frontPage,latestPosts:[]}}/>;
 const hero=ready(null),name='core/hero-video';
 hero.policy.capabilities=['reference.targetResolution'];
 hero.document.blocks=validateCanonicalTree([{id:'opening',name,version:dependencyDescriptors[name].version,attrs:{title:'Canonical hero heading'}}]);
 hero.document.digest=canonicalContentDigest(hero.document.title,hero.document.blocks);
 hero.data=await resolveCanonicalData(hero.document.blocks,scope,hero.policy,async()=>null);
 await withSeededBody(hero,async()=>{
  expect(document.querySelector('h1')).toBeNull();
  expect(document.querySelector('#aster-story article')).not.toBeNull();
  const {renderToStaticMarkup}=await import('react-dom/server');
  expect(renderToStaticMarkup(<PublicCanonicalScope documentId="page" initial={hero}>{view()}</PublicCanonicalScope>)).not.toContain('>Fallback cover title</h1>');
  const w=watches.at(-1);w.value=ready(null);await act(async()=>w.listener());
  expect(document.querySelectorAll('h1')).toHaveLength(1);
  expect(document.querySelector('h1').textContent).toBe(frontPage.title);
  frontPage.contentMode='blocks';frontPage.blocks=[{name:'core/hero'}];
  w.value=new Error('access revoked');await act(async()=>w.listener());
  expect(document.querySelector('h1').textContent).toBe(frontPage.title);
  expect(document.querySelector('#aster-story')?.textContent).not.toContain('Authorized body');
 },{},view);
});


test('operator canonical reads bind the backend subject independently of Clerk and clear on renewal identity changes or exit',async()=>{
 await withSeededBody({...ready(null),historyDigest:productHistoryDigest([])},async({render})=>{
  try {
   operator={active:true,userId:'operator_a',viewerSubject:'management_session_a',instanceKey:'stage',expiresAt:Date.now()+60000};
   convexAuth={isLoading:false,isAuthenticated:true};
   const before=watches.length;await render();
   expect(watches.length).toBeGreaterThan(before);
   expect(document.querySelector('article')).toBeNull();
   const deliver=async(value)=>{const w=watches.at(-1);w.value={...value,historyDigest:productHistoryDigest([])};await act(async()=>w.listener());};
   await deliver(ready('reader_a'));expect(document.querySelector('article')).toBeNull();
   await deliver(ready('management_session_a'));expect(document.body.textContent).toContain('Authorized body');
   const watch=watches.at(-1),article=document.querySelector('article');
   operator={...operator,expiresAt:Date.now()+120000};await render();
   expect(watches.at(-1)).toBe(watch);expect(document.querySelector('article')).toBe(article);
   auth={isLoaded:true,isSignedIn:true,userId:'reader_a',sessionId:'clerk_a'};await render();
   expect(watches.at(-1)).toBe(watch);expect(document.querySelector('article')).toBe(article);
   operator={...operator,viewerSubject:'management_session_b'};await render();
   expect(watch.stopped).toBe(true);expect(document.querySelector('article')).toBeNull();
   await act(async()=>watch.listener());expect(document.querySelector('article')).toBeNull();
   await deliver(ready('management_session_b'));expect(document.querySelector('article')).not.toBeNull();
   convexAuth={isLoading:false,isAuthenticated:false};await render();expect(document.querySelector('article')).toBeNull();
   operator={active:false};convexAuth={isLoading:false,isAuthenticated:true};await render();
   await deliver(ready('management_session_b'));expect(document.querySelector('article')).toBeNull();
   await deliver(ready('reader_a'));expect(document.querySelector('article')).not.toBeNull();
   for(const invalid of [{active:true,instanceKey:'stage'},{active:true,viewerSubject:'operator_a',instanceKey:'other'}]){
    const count=watches.length;operator=invalid;await render();
    expect(watches.length).toBe(count);expect(document.querySelector('article')).toBeNull();
    expect(document.body.textContent).toContain('This document is not currently available.');
   }
  } finally {operator={active:false};}
 });
});


test('operator canonical bodies settle with actual history storage without borrowing anonymous or customer visits',async()=>{
 realHistory=true;
 try {await withSeededBody({...ready(null),historyDigest:productHistoryDigest([])},async({render})=>{
  const {productHistoryKey,recordProductVisit}=await import('../../../lib/commerce/product-history');
  const key=viewerKey=>productHistoryKey({backendUrl:transport.url,instanceKey:'stage',viewerKey});
  recordProductVisit(window.localStorage,key('anonymous'),'anonymous-product');
  recordProductVisit(window.localStorage,key('user:reader_a'),'customer-product');
  recordProductVisit(window.localStorage,key('operator:operator_a'),'operator-product');
  operator={active:true,viewerSubject:'operator_a',instanceKey:'stage'};convexAuth={isLoading:false,isAuthenticated:true};
  await render();const w=watches.at(-1);
  expect(w.args.recentlyViewedIds).toEqual(['operator-product']);
  w.value={...ready('operator_a'),historyDigest:productHistoryDigest(['operator-product'])};await act(async()=>w.listener());
  expect(document.querySelector('article')).not.toBeNull();
  operator={active:false};auth={isLoaded:true,isSignedIn:true,userId:'reader_a',sessionId:'reader-session'};
  await render();expect(document.querySelector('article')).toBeNull();expect(w.stopped).toBe(true);
  expect(watches.at(-1).args.recentlyViewedIds).toEqual(['customer-product']);
 });}finally{realHistory=false;operator={active:false};}
});
