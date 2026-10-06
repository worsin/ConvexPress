import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
mock.module('@/templates/sdk/Surface', () => ({ Surface: () => null }));
mock.module('@/templates/packs/core/surfaces/chrome.searchOverlay', () => ({ default: () => null }));
mock.module('@/templates/packs/core/surfaces/chrome.cartDrawer', () => ({ default: () => null }));
// Vite discovers packs through import.meta.glob; this SSR fixture imports each real header explicitly.
mock.module('@/templates/sdk/registry', () => ({ DEFAULT_TEMPLATE_CONFIG:{active:'core',overrides:{},variants:{},settings:{}},TEMPLATE_PACKS:new Map(),getTemplatePack:()=>undefined,listTemplatePacks:()=>[],resolveSurface:()=>({packId:'core',component:null}),resolveVariant:()=>undefined,prepareTemplateHydration:async()=>{} }));
const identity = { title:'Brand title fixture', tagline:'Brand tagline fixture', logoUrl:'https://example.org/logo.svg', logoAlt:'Brand logo fixture' };
const noop = () => {};
mock.module('@/hooks/layout/useLayoutShell', () => ({ useLayoutShell: () => ({ isScrolled:false,toggleMobileNav:noop,searchOpen:false,closeSearch:noop,toggleSearch:noop }) }));
mock.module('@/hooks/layout/useHeaderConfig', () => ({ useHeaderConfig: () => undefined }));
mock.module('@/hooks/useCart', () => ({ useCart: () => ({ enabled:false,cart:null }) }));
mock.module('@/hooks/useCommerceSessionToken', () => ({ useCommerceSessionToken: () => ({sessionToken:null,isReady:false}) }));
const auth = await import('@/lib/auth/clerk');
mock.module('@/lib/auth/clerk', () => ({ ...auth,useAuth: () => ({ isLoaded:true,isSignedIn:false }) }));
const settings = await import('@/contexts/SettingsContext');
mock.module('@/contexts/SettingsContext', () => ({ ...settings,useSettings: () => ({ plugins:{} }) }));
const convex = await import('convex/react');
mock.module('convex/react', () => ({ ...convex,useQuery: () => undefined }));
const router = await import('@tanstack/react-router');
mock.module('@tanstack/react-router', () => ({ ...router,Link: ({to,children,...props}) => createElement('a',{href:to,...props},children),useRouterState: ({select}) => select({location:{pathname:'/'}}),useNavigate: () => noop }));
const { HEADER_DEFAULTS } = await import('@/templates/sdk/chromeDefinitions');
export const renderedCases = [];
const failures = []; let cases = 0;
for (const pack of ['core','journal','depot','aster-house']) {
 const {default: Header} = await import(`../../templates/packs/${pack}/surfaces/chrome.header.tsx`);
 for (const layout of pack === 'core' ? ['standard','centered','split'] : ['standard']) {
  const render = (logo = {}, site = identity) => {
   const config = structuredClone(HEADER_DEFAULTS);
   Object.assign(config.logo,logo); config.layout.style = layout;
   config.search.enabled = false; config.userMenu.enabled = false; config.darkModeToggle.enabled = false;
   const markup = renderToStaticMarkup(createElement(Header,{data:{siteIdentity:site,headerConfig:config,layoutConfig:{stickyHeader:false},menu:undefined}}));
   renderedCases.push({pack,layout,logo,markup});
   return new JSDOM(markup);
  };
  const check = (name, fn) => { try {fn();cases++;} catch(e){failures.push(`${pack}/${layout}/${name}: ${e.message}`);} };
  check('size changes image dimensions', () => {
   const heights = ['small','medium','large'].map(size => { const dom=render({size}); const h=Number(dom.window.document.querySelector('[data-slot="site-brand"] img')?.getAttribute('height')); dom.window.close(); return h; });
   assert.ok(heights[0]>0 && heights[0]<heights[1] && heights[1]<heights[2],`Expected increasing dimensions, got ${heights}`);
  });
  for (const [name,logo,site,image,title,tagline] of [
   ['default',{},identity,true,true,false],
   ['disabled',{enabled:false,showTagline:true},identity,false,false,false],
   ['image off',{showImage:false},identity,false,true,false],
   ['title off',{showTitle:false},identity,true,false,false],
   ['title off without image',{showTitle:false},{...identity,logoUrl:undefined},false,false,false],
   ['tagline on',{showTagline:true},identity,true,true,true],
   ['all hidden',{showImage:false,showTitle:false},identity,false,false,false],
   ['tagline only',{showImage:false,showTitle:false,showTagline:true},identity,false,false,true],
   ['identity hides title',{}, {...identity,showTitleWithLogo:false},true,false,false],
   ['title with image disabled',{showImage:false},{...identity,showTitleWithLogo:false},false,true,false],
  ]) check(name,() => {
   const dom=render(logo,site); const d=dom.window.document;
   assert.equal(!!d.querySelector('[data-slot="site-brand"] img'),image,'image visibility');
   assert.equal(d.body.textContent.includes(identity.title),title,'title visibility');
   assert.equal(d.body.textContent.includes(identity.tagline),tagline,'tagline visibility');
   if(!image && !title && !tagline) assert.equal(d.querySelector('a[data-slot="site-brand"]'),null,'no empty homepage link');
   dom.window.close();
  });
 }
}
assert.equal(failures.length,0,failures.join('\n'));
console.log(JSON.stringify({passed:true,cases}));
