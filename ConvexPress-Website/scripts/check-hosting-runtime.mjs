#!/usr/bin/env node
/** Execute the exact bundled SSR Worker in workerd. Every outbound request is
 * handled by local fixtures; this gate cannot contact a configured site/provider. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler/package.json'))('miniflare');
const runtimeKeys = {
  convexUrl: 'CONVEXPRESS_CONVEX_URL', convexSiteUrl: 'CONVEXPRESS_CONVEX_SITE_URL',
  siteUrl: 'CONVEXPRESS_SITE_URL', adminAppUrl: 'CONVEXPRESS_ADMIN_APP_URL',
  instanceKey: 'CONVEXPRESS_INSTANCE_KEY', clerkPublishableKey: 'CONVEXPRESS_CLERK_PUBLISHABLE_KEY',
};
const configPath = process.argv[2];
const publicConfig = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : null;
const bindings = {};
const offlineDefaults = {convexUrl: 'https://offline-runtime.convex.cloud', siteUrl: 'https://offline-runtime.example.invalid', instanceKey: 'offline-runtime-instance'};
for (const [key, binding] of Object.entries(runtimeKeys)) {
  const value = publicConfig ? publicConfig[key] : (process.env[binding] ?? offlineDefaults[key]);
  if (typeof value === 'string' && value) bindings[binding] = value;
}
for (const required of ['CONVEXPRESS_CONVEX_URL', 'CONVEXPRESS_SITE_URL', 'CONVEXPRESS_INSTANCE_KEY'])
  assert.ok(bindings[required], `Missing public runtime configuration: ${required}`);
bindings.CONVEXPRESS_RELEASE_ID = 'offline-runtime-check';
bindings.CONVEXPRESS_ARTIFACT_HASH = 'a'.repeat(64);
const requests = [];
const appRequire = createRequire(path.join(root, 'apps/web/package.json'));
const {build} = await import(pathToFileURL(createRequire(appRequire.resolve('vite/package.json')).resolve('esbuild')));
const fixtureModule = await build({entryPoints: [path.join(root, 'scripts/public-runtime-fixture.ts')], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent'});
const {publicRuntimeFixture} = await import('data:text/javascript;base64,' + Buffer.from(fixtureModule.outputFiles[0].text).toString('base64'));
let canonicalFixture = null, currentPack = 'core', missingDocument = false, missingBody = false;
let menuMode = 'default', archiveMissing = false, productCommerceEnabled = false;
let recipesEnabled = false, recipeAvailable = false, brandAvailable = false;
const fixtures = {
  'routing/public:resolveRedirect': null,
  'settings/queries:getPublic': {siteTitle: 'Offline runtime fixture', timezone: 'America/Denver', plugins: {}},
  'auth/clerkPublic:getWebsiteAuthConfig': null,
  'membership/queries:checkAccess': {allowed: true, reason: 'plugin_disabled'},
  'pages/queries:getFrontPage': null,
  'posts/queries:listPublished': {posts: [], pagination: {page: 1, perPage: 6, total: 0, totalPages: 0}},
  'commerce/categories:getBySlug': {_id: 'runtime-shop-category', name: 'Runtime shop category', slug: 'runtime-shop', productCount: 987, totalProductCount: 987, children: []},
  'commerce/products:listPublished': {products: [], page: 1, totalPages: 0, total: 0},
};
const worker = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  scriptPath: path.join(root, 'apps/web/dist/hosting/worker.mjs'),
  compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], bindings,
  // Intercept all HTTP traffic, including unrecognized routes; never fall through.
  outboundService: async (request) => {
    let body = {};
    try { body = await request.json(); } catch {}
    const query = body.path ?? body.udfPath ?? body.functionName;
    requests.push(query ?? new URL(request.url).pathname);
    if (query === 'canonicalDocuments:getForRender') assert.equal(request.headers.get('authorization'), null, 'SSR body request must be anonymous');
    const args = Array.isArray(body.args) ? body.args[0] ?? {} : body.args ?? {};
    let value = fixtures[query] ?? null;
    if (query === 'taxonomyArchives:tag') {
      assert.equal(request.headers.get('authorization'),null,'Tag archive SSR must be anonymous');
      assert.equal(args.instanceKey,bindings.CONVEXPRESS_INSTANCE_KEY);
      value=archiveMissing?null:{scope:{websiteKey:'runtime',instanceKey:args.instanceKey},viewerSubject:null,slug:args.slug,
        tag:{id:'runtime-tag',name:'Runtime topic archive',slug:args.slug,description:'A public topic introduction'},
        items:[{id:args.cursor?'older':'newest',title:args.cursor?'Archive older story':'Archive newest story',href:args.cursor?'/blog/archive-older':'/blog/archive-newest',excerpt:'A public story excerpt',publishedAt:1788576155718,author:'Runtime writer',image:null}],
        cursor:args.cursor??null,nextCursor:args.cursor?null:JSON.stringify({version:1,binding:'a'.repeat(64),key:['topic',true,100,200,'relation']}),resetRequired:false};
    }
    if (query === 'categoryArchives:read' || query === 'categoryArchives:children') {
      assert.equal(request.headers.get('authorization'),null,'Category SSR is anonymous');
      assert.equal(args.instanceKey,bindings.CONVEXPRESS_INSTANCE_KEY);
      const common={scope:{websiteKey:'runtime',instanceKey:args.instanceKey},viewerSubject:null,slug:args.slug,cursor:args.cursor??null,nextCursor:args.cursor?null:JSON.stringify({version:1,kind:query,position:2}),resetRequired:false};
      value=archiveMissing?null:query==='categoryArchives:read'?{...common,
        category:{id:'runtime-category',name:'Runtime category archive',slug:args.slug,description:'Public category introduction'},ancestors:[{id:'parent',name:'Parent category',slug:'parent'}],
        items:[{id:args.cursor?'category-older':'category-newest',title:args.cursor?'Category older story':'Category newest story',href:'/blog/category-story',excerpt:'Public story',publishedAt:1788576155718,author:'Runtime writer',image:null}],
      }:{...common,items:[{id:args.cursor?'child-next':'child-first',name:args.cursor?'Child next':'Child first',slug:args.cursor?'child-next':'child-first'}]};
    }
    if (query === 'menus/queries:getMenuForLocation') {
      assert.equal(request.headers.get('authorization'), null, 'SSR navigation must use anonymous access policy');
      const location = args.locationSlug;
      value = {
        menu: {_id: `menu-${location}`, name: `Runtime ${location}`, slug: `runtime-${location}`},
        items: [{_id: `item-${location}`, menuId: `menu-${location}`, itemType: 'custom',
          label: `SSR navigation ${location}`, url: `/runtime-menu-${location}`, position: 0, depth: 0, children: []}],
      };
      if (menuMode === 'unassigned') value = null;
    }
    if (canonicalFixture) {
      if (query === 'settings/queries:getPublic') value = {siteTitle: 'Offline runtime fixture', timezone: 'America/Denver', plugins: {commerceEnabled: productCommerceEnabled, recipesEnabled}, templateConfig: {active: currentPack, settings: menuMode === 'mapped' ? {[currentPack]: {menuLayout: {primary: 'alternate-header'}}} : {}, overrides: {}, variants: {}}};
      if (query === 'pages/queries:getByPath' || query === 'pages/queries:getFrontPage') value = canonicalFixture.page.metadata;
      if (query === 'posts/queries:getPublished') value = canonicalFixture.post.metadata;
      if (query === 'canonicalDocuments:getForRender') value = (await publicRuntimeFixture(bindings.CONVEXPRESS_INSTANCE_KEY,currentPack,args.postId === 'runtime-post' ? 'post' : 'page',args.request ?? {})).ready;
      if (query === 'pages/queries:getBreadcrumbs' || query === 'pages/queries:getChildren') value = [];
    }
    if (query === 'commerce/brandCatalog:page') {
      assert.equal(request.headers.get('authorization'),null,'Brand SSR must use anonymous authority');
      value={brand:brandAvailable && productCommerceEnabled ? {id:'runtime-brand',name:'Runtime maker',slug:'runtime-maker',description:'Objects for everyday rituals',href:'/brands/runtime-maker',logo:null}:null,page:brandAvailable && productCommerceEnabled ? [{id:'runtime-brand-product',title:'Runtime maker notebook',href:'/products/runtime-notebook',excerpt:'Public product summary',createdAt:1,image:null,pricing:{price:{amount:2400,currencyCode:'USD'},salePrice:null,salePriceFrom:null,salePriceTo:null,pricedAt:Date.now()}}]:[],isDone:true,continueCursor:'',recheckAt:null};
    }
    const recipe = {_id:'runtime-recipe',slug:'runtime-recipe',title:'Runtime Sunday recipe',excerpt:'Public recipe excerpt',ingredients:['Runtime beans ingredient'],instructions:['Runtime simmer instruction'],categories:[]};
    if (query === 'recipes/queries:getBySlug') value = recipeAvailable ? recipe : null;
    if (query === 'recipes/queries:getCategoryBySlug') value = recipeAvailable ? {_id:'runtime-recipe-category',slug:'sunday',name:'Runtime recipe category'} : null;
    if (query === 'recipes/queries:listPublished') value = {recipes:recipeAvailable ? [recipe] : [],page:1,perPage:12,total:recipeAvailable ? 1 : 0,totalPages:recipeAvailable ? 1 : 0,category:null};
    if (missingDocument && ['pages/queries:getByPath', 'posts/queries:getPublished'].includes(query)) value = null;
    if (missingBody && query === 'canonicalDocuments:getForRender') value = null;
    return new Response(JSON.stringify({status: 'success', value, logLines: []}), {
      headers: {'content-type': 'application/json'},
    });
  },
}));
try {
  for (const [route, expected] of [
    ['/', 'No published posts yet'],
    ['/document-preview/', 'Open this saved preview from your authorized native editor.'],
  ]) {
    const response = await worker.dispatchFetch(new URL(route, bindings.CONVEXPRESS_SITE_URL), {redirect:"manual"});
    assert.equal(response.status, 200, `${route} must render successfully`);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/i);
    assert.equal(response.headers.get('x-convexpress-instance'), bindings.CONVEXPRESS_INSTANCE_KEY);
    assert.equal(response.headers.get('x-convexpress-release'), bindings.CONVEXPRESS_RELEASE_ID);
    assert.equal(response.headers.get('x-convexpress-artifact'), bindings.CONVEXPRESS_ARTIFACT_HASH);
    const html = await response.text();
    assert.ok(html.includes(expected), `${route} must render its actual component, not an error shell`);
    assert.ok(html.includes('</html>'), `${route} must finish rendering`);
    assert.ok(!html.includes('Cannot read properties of null'), 'React dispatcher must be shared');
    if (route.includes('document-preview')) {
      assert.ok(!html.includes('canonical-document-v1'), 'top-level preview must not contain draft data');
      assert.ok(html.includes('noindex, nofollow'));
    }
  }
  for (const packId of ['core', 'journal', 'depot', 'aster-house']) {
    currentPack = packId;
    canonicalFixture = {page: await publicRuntimeFixture(bindings.CONVEXPRESS_INSTANCE_KEY, packId), post: await publicRuntimeFixture(bindings.CONVEXPRESS_INSTANCE_KEY, packId, 'post')};
    for (const route of ['/', '/page/runtime-canonical/', '/blog/runtime-canonical/']) {
      const response = await worker.dispatchFetch(new URL(route, bindings.CONVEXPRESS_SITE_URL), {redirect:"manual"});
      const html = await response.text();
      assert.equal(response.status, 200, `${packId} ${route}`);
      assert.ok(html.includes('<strong>Rendered canonical public story</strong>'), `${packId} ${route} must preserve the marked canonical heading`);
      assert.ok(html.includes('src="/runtime-fixture.png"'), `${packId} ${route} must use the resolved authored media`);
      assert.ok(!html.includes('short display lease'), 'Private preview implementation text must not leak into public content');
      const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      const newsletterForms = markup.match(/<form\b[^>]*class="cp-library-newsletter"[^>]*>[\s\S]*?<\/form>/g) ?? [];
      assert.ok(html.includes('Preparing form…'), `${packId} ${route} has a hydration-safe embedded form`);
      assert.ok(html.includes('Your name'), `${packId} ${route} renders the selected form fields on the server`);
      assert.ok(/<fieldset disabled[^>]*aria-label="Let’s make something worthwhile\. preview"/u.test(html), 'SSR form fields remain read-only until their production host mounts');
      assert.equal(newsletterForms.length, 2, `${packId} ${route} renders both canonical signup blocks`);
      for (const form of newsletterForms) {
        assert.match(form, /<input\b[^>]*disabled/, `${packId} ${route} cannot send an email before hydration`);
        assert.match(form, /<button\b[^>]*disabled/, `${packId} ${route} cannot submit before hydration`);
        assert.ok(form.includes('Preparing signup…'), 'Public SSR explains its pending interaction state');
        assert.ok(!form.includes('not connected in this preview'), 'Published forms cannot inherit preview-only disconnection');
        assert.match(form, /type="email"/);
        assert.match(form, /type="submit"/);
      }
      assert.match(markup, /<a\b[^>]*href="\/runtime-menu-header"[^>]*>/, `${packId} ${route} must render header menu links before hydration`);
      assert.match(markup, /<footer\b[\s\S]*<a\b[^>]*href="\/runtime-menu-footer[^"]*"/, `${packId} ${route} must render footer menu links before hydration`);
      assert.ok(markup.includes('Runtime studio gathering'),`${packId} ${route} renders the plugin event from the canonical envelope before hydration`);
      assert.ok(markup.includes('href="/events/runtime-gathering"'));
      assert.ok(markup.includes('Runtime next gathering'));
      assert.ok(markup.includes('href="/events/runtime-next-gathering"'));
      assert.ok(markup.includes('Runtime calendar gathering'));
      assert.ok(markup.includes('href="/events/runtime-calendar-gathering"'));
      assert.ok(markup.includes('October 2026'));
      assert.ok(markup.includes('Calendar month navigation'));
      assert.ok(markup.includes('Runtime next studio'));
      assert.ok(markup.includes('Runtime workroom'));
      assert.ok(markup.includes('Newest runtime story'), `${packId} ${route} renders the first grid page in SSR`);
      const nextHref=markup.match(/<a\b[^>]*href="([^"]+)"[^>]*>Older stories/)[1].replaceAll('&amp;','&');
      assert.equal(new URL(nextHref,bindings.CONVEXPRESS_SITE_URL).pathname,route,'Pagination must preserve the actual homepage/page/post route');
      const nextResponse=await worker.dispatchFetch(new URL(nextHref,bindings.CONVEXPRESS_SITE_URL), {redirect:"manual"});
      assert.equal(nextResponse.status,200);
      const nextMarkup=(await nextResponse.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
      assert.ok(nextMarkup.includes('Older runtime story'),`${packId} ${route} passes the URL cursor into the anonymous SSR query`);
      assert.ok(!nextMarkup.includes('Newest runtime story'),'Requested pages cannot render the previous grid response');
      assert.ok(nextMarkup.includes('Back to newest'));
      if (packId === 'core') assert.match(markup, /<div\b[^>]*data-slot="mobile-nav"[^>]*inert=""/, 'Closed Core drawer must be inert in SSR markup');
    }
    const archiveResponse=await worker.dispatchFetch(new URL('/tag/runtime-topics/',bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});
    assert.equal(archiveResponse.status,200,`${packId} tag archive SSR`);
    const archiveMarkup=(await archiveResponse.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    assert.ok(archiveMarkup.includes('Runtime topic archive')&&archiveMarkup.includes('Archive newest story'),`${packId} tag data is present before hydration`);
    assert.ok(archiveMarkup.includes('Sep 4, 2026')||archiveMarkup.includes('September 4, 2026'),`${packId} archive respects the configured site timezone in SSR`);
    assert.ok(!archiveMarkup.includes('undefined posts')&&!archiveMarkup.includes('0 posts'),'Unknown archive totals must not be fabricated');
    assert.ok(!archiveMarkup.includes('href="/author/"'),'No fabricated author archive links');
    const archiveNext=archiveMarkup.match(/<a\b[^>]*href="([^"]+)"[^>]*>Older stories/)[1].replaceAll('&quot;','"').replaceAll('&amp;','&');
    assert.ok(archiveNext.includes('cursor='));
    const olderArchive=await worker.dispatchFetch(new URL(archiveNext,bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});
    assert.equal(olderArchive.status,200);
    const olderMarkup=(await olderArchive.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    assert.ok(olderMarkup.includes('Archive older story')&&!olderMarkup.includes('Archive newest story'));
    assert.ok(olderMarkup.includes('Back to newest'));
    archiveMissing=true;
    const deniedArchive=await worker.dispatchFetch(new URL('/tag/runtime-topics/',bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});
    assert.equal(deniedArchive.status,404,'Denied or missing tag must be a real404');
    assert.ok(!(await deniedArchive.text()).includes('A public topic introduction'));
    archiveMissing=false;
    const categoryResponse=await worker.dispatchFetch(new URL('/category/runtime-materials/',bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});
    assert.equal(categoryResponse.status,200,`${packId} category SSR`);
    const categoryMarkup=(await categoryResponse.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    for(const text of ['Runtime category archive','Parent category','Child first','Category newest story'])assert.ok(categoryMarkup.includes(text),`${packId} category SSR includes ${text}`);
    assert.ok(!categoryMarkup.includes('undefined posts')&&!categoryMarkup.includes('(undefined)'));
    const categoryNext=categoryMarkup.match(/<a\b[^>]*href="([^"]+)"[^>]*>Older stories/)[1].replaceAll('&quot;','"').replaceAll('&amp;','&');
    const categoryOlder=await worker.dispatchFetch(new URL(categoryNext,bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});
    assert.equal(categoryOlder.status,200);
    const categoryOlderMarkup=(await categoryOlder.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    assert.ok(categoryOlderMarkup.includes('Category older story')&&!categoryOlderMarkup.includes('Category newest story'));
    const childrenNext=categoryOlderMarkup.match(/<a\b[^>]*href="([^"]+)"[^>]*>More subcategories/)[1].replaceAll('&quot;','"').replaceAll('&amp;','&');
    const categoryChildren=await worker.dispatchFetch(new URL(childrenNext,bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});
    assert.equal(categoryChildren.status,200);
    const categoryChildrenMarkup=(await categoryChildren.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    assert.ok(categoryChildrenMarkup.includes('Category older story')&&categoryChildrenMarkup.includes('Child next')&&!categoryChildrenMarkup.includes('Child first'),'Child continuation preserves the post continuation');
    archiveMissing=true;
    const missingCategory=await worker.dispatchFetch(new URL('/category/runtime-materials/',bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});
    assert.equal(missingCategory.status,404);assert.ok(!(await missingCategory.text()).includes('Public category introduction'));
    archiveMissing=false;
    for (menuMode of ['mapped', 'unassigned']) {
      const response = await worker.dispatchFetch(new URL('/page/runtime-canonical/', bindings.CONVEXPRESS_SITE_URL));
      assert.equal(response.status, 200, `${packId} ${menuMode} menu must not break the page`);
      const markup = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      assert.ok(markup.includes('<strong>Rendered canonical public story</strong>'));
      if (menuMode === 'mapped') assert.match(markup, /<a\b[^>]*href="\/runtime-menu-alternate-header"/, `${packId} must respect saved menu location mapping on the server`);
      else assert.ok(!markup.includes('href="/runtime-menu-'), `${packId} unassigned menus must not retain the previous request's links`);
    }
    menuMode = 'default';
  }
  for (const mode of ['missing-document', 'revoked-canonical-body']) {
    missingDocument = mode === 'missing-document';
    missingBody = mode === 'revoked-canonical-body';
    for (const route of ['/page/runtime-canonical/', '/blog/runtime-canonical/']) {
      const response = await worker.dispatchFetch(new URL(route, bindings.CONVEXPRESS_SITE_URL), {redirect:"manual"});
      const html = await response.text();
      assert.equal(response.status, 404, `${mode} ${route} must return HTTP404, not a soft404`);
      assert.match(response.headers.get('content-type') ?? '', /^text\/html/i);
      assert.ok(html.includes('</html>'), 'Not-found page must finish rendering');
      assert.ok(!html.includes('Rendered canonical public story'), 'Missing/private/draft content must not expose its body');
      assert.ok(!html.includes('/runtime-fixture.png'), 'Not-found content must not expose its resolved media');
    }
  }
  missingDocument = false; missingBody = false;
  for (currentPack of ['core', 'journal', 'depot', 'aster-house']) {
    productCommerceEnabled = true;
    const response = await worker.dispatchFetch(new URL('/categories/runtime-shop/', bindings.CONVEXPRESS_SITE_URL), {redirect: 'manual'});
    assert.equal(response.status, 200, `${currentPack} shop category renders`);
    const markup = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--.*?-->/g, '');
    assert.ok(markup.includes('Runtime shop category'), 'Category heading must render');
    assert.ok(!markup.includes('987'), `${currentPack} cannot display cached catalog totals as visitor-visible counts`);
    assert.ok(markup.includes('0 products'), `${currentPack} shows the actual empty public catalog count`);
  }
  console.log('All four shop category packs: public result totals override stale cached category counts.');
  for (currentPack of ['core', 'journal', 'depot', 'aster-house']) {
    for (productCommerceEnabled of [true, false]) {
      const before = requests.filter(query => query === 'commerce/products:getBySlug').length;
      const response = await worker.dispatchFetch(new URL('/products/unavailable-product/', bindings.CONVEXPRESS_SITE_URL), {redirect: 'manual'});
      const html = await response.text();
      assert.equal(response.status, 404, `${currentPack} unavailable/disabled product must return HTTP404`);
      assert.ok(html.includes('</html>'), 'Product not-found response finishes rendering');
      const reads = requests.filter(query => query === 'commerce/products:getBySlug').length - before;
      assert.equal(reads, productCommerceEnabled ? 1 : 0, 'Disabled Commerce must not start a product read');
    }
  }
  for (currentPack of ['core','journal','depot','aster-house']) {
    recipesEnabled = true; recipeAvailable = true;
    for (const route of ['/recipes/','/recipes/runtime-recipe/','/recipes/category/sunday/']) {
      const response = await worker.dispatchFetch(new URL(route, bindings.CONVEXPRESS_SITE_URL), {redirect:'manual'});
      const html = await response.text();
      assert.equal(response.status,200,`${currentPack} ${route} public recipe renders`);
      assert.ok(html.includes('Runtime Sunday recipe'));
    }
    recipeAvailable = false;
    for (const route of ['/recipes/runtime-recipe/','/recipes/category/sunday/']) {
      const response = await worker.dispatchFetch(new URL(route, bindings.CONVEXPRESS_SITE_URL), {redirect:'manual'});
      const html = await response.text();
      assert.equal(response.status,404,`${currentPack} ${route} denied/missing recipe returns HTTP404`);
      assert.ok(!html.includes('Runtime Sunday recipe') && !html.includes('Runtime beans ingredient'));
    }
    recipesEnabled = false;
    const response = await worker.dispatchFetch(new URL('/recipes/',bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});
    assert.equal(response.status,404,`${currentPack} disabled recipe archive returns HTTP404`);
  }
  for (currentPack of ['core','journal','depot','aster-house']) {
    productCommerceEnabled=true;brandAvailable=true;
    const available=await worker.dispatchFetch(new URL('/brands/runtime-maker/',bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});
    const html=await available.text();assert.equal(available.status,200,`${currentPack} brand catalog renders`);assert.ok(html.includes('Runtime maker notebook'));assert.ok(html.includes('Objects for everyday rituals'));
    for(const mode of ['unavailable','disabled']) {
      brandAvailable=mode==='disabled';productCommerceEnabled=mode!=='disabled';
      const denied=await worker.dispatchFetch(new URL('/brands/runtime-maker/',bindings.CONVEXPRESS_SITE_URL),{redirect:'manual'});const body=await denied.text();assert.equal(denied.status,404,`${currentPack} ${mode} brand is HTTP404`);assert.ok(!body.includes('Runtime maker notebook'));assert.ok(!body.includes('Objects for everyday rituals'));
    }
  }
  console.log('All four brand catalog packs: public maker/products render; unavailable or disabled brand returns HTTP404 without metadata/body.');
  console.log('All four recipe packs: published index/detail/category render; denied/missing detail/category and disabled archive return HTTP404.');
  console.log('All four packs: unavailable product and disabled Commerce return HTTP404.');
  console.log('Missing/private/draft route metadata and revoked canonical bodies: page/blog HTTP404 with no body or media.');
  console.log('Canonical public SSR: all four packs × homepage/page/post; marked text and exact media preserved.');
  console.log(JSON.stringify({status: 'passed', engine: 'workerd', routes: ['/', '/document-preview/'],
    outboundNetwork: 'fully intercepted', queryFixtures: [...new Set(requests)]}));
} finally {
  await worker.dispose();
}

// Rolling publisher compatibility: existing deployments do not yet supply the
// optional release metadata. They must still render, without inventing a receipt.
const legacyBindings = {...bindings};
delete legacyBindings.CONVEXPRESS_RELEASE_ID;
delete legacyBindings.CONVEXPRESS_ARTIFACT_HASH;
const legacyWorker = new Miniflare(convertV4MiniflareOptions({
  modules: true, scriptPath: path.join(root, 'apps/web/dist/hosting/worker.mjs'),
  compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], bindings: legacyBindings,
  outboundService: async () => new Response(JSON.stringify({status: 'success', value: null, logLines: []}), {
    headers: {'content-type': 'application/json'},
  }),
}));
try {
  const response = await legacyWorker.dispatchFetch(new URL('/document-preview/', bindings.CONVEXPRESS_SITE_URL));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-convexpress-release'), null);
  assert.equal(response.headers.get('x-convexpress-artifact'), null);
  assert.ok((await response.text()).includes('Open this saved preview from your authorized native editor.'));
  console.log('Existing publisher bindings: rendered; no fabricated release receipt.');
} finally {
  await legacyWorker.dispose();
}
