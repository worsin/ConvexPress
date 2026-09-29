import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const dir=mkdtempSync(join(app,'.menu-semantics-test-'));
try {
 const router=join(dir,'router.tsx');
 writeFileSync(router,'import * as React from "react";export const Link=({to,children,activeProps,...props})=><a href={to} {...props}>{children}</a>;export const useRouterState=(options)=>options?.select?options.select({location:{pathname:"/"}}):({location:{pathname:"/"}});export const useNavigate=()=>()=>{};');
 const state=join(dir,'state.tsx'), inert=join(dir,'inert.tsx');
 writeFileSync(state,`import {HEADER_DEFAULTS} from '../src/templates/sdk/chromeDefinitions';export const useHeaderConfig=()=>HEADER_DEFAULTS;export const useStickyHeaderOffset=()=>null;export const useLayoutShell=()=>({toggleMobileNav(){},toggleSearch(){},closeSearch(){},searchOpen:false});export const useAuth=()=>({isLoaded:true,isSignedIn:false});export const useUser=()=>({user:null});export const useClerk=()=>({signOut(){}});export const useCart=()=>({enabled:false,cart:null});export const useSettings=()=>({plugins:{}});export const useSetting=()=>undefined;export const useDashboardPath=()=>({to:p=>'/dashboard'+p});export const useMenuForLocation=()=>globalThis.menuSemanticsFixture;`);
 writeFileSync(inert,'export default function Inert(){return null};export const Surface=Inert,HeaderActions=Inert,SocialLinks=Inert,ThemeToggle=Inert,UserMenu=Inert,WebsiteNotificationBell=Inert;');
 const entry=join(dir,'entry.tsx');
 writeFileSync(entry,`import * as React from 'react';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';import {JSDOM} from 'jsdom';
import {LayoutShellProvider,getBackgroundInertProps} from '../src/components/layout/LayoutShellProvider';import {useLayoutShell} from '../src/hooks/layout/useLayoutShell';
import {DesktopNav} from '../src/components/layout/DesktopNav';
import {NavDropdown} from '../src/components/layout/NavDropdown';
import {MobileNavItem} from '../src/components/layout/MobileNavItem';
import {MobileMenuItem} from '../src/components/menus/MobileMenuItem';
import {MenuItemList} from '../src/components/menus/MenuItemList';
import {DropdownMenu} from '../src/components/menus/DropdownMenu';
import {FooterNav} from '../src/components/layout/FooterNav';
import {SiteMenu} from '../src/components/menus/SiteMenu';
import {HEADER_DEFAULTS} from '../src/templates/sdk/chromeDefinitions';
import {DEFAULT_LAYOUT_CONFIG} from '../src/lib/layout/constants';
${['core','journal','depot','aster-house'].map((pack,i)=>`import Pack${i} from '../src/templates/packs/${pack}/surfaces/chrome.header';`).join('\n')}
${['core','journal','depot','aster-house'].map((pack,i)=>`import Mobile${i} from '../src/templates/packs/${pack}/surfaces/chrome.mobileNav';`).join('\n')}

const markup=node=>renderToStaticMarkup(<LayoutShellProvider>{node}</LayoutShellProvider>);
const item=(type,label,children=[])=>({id:label,type,label,url:type==='custom'?'https://example.org/notes':'#',depth:0,children});
const items=[item('heading','Field notes'),item('separator','Never a navigation label'),item('custom','Visit notes')];const menu={id:'menu',name:'Study',slug:'study',items};
let checks=0;
for(const [name,node] of [
 ['desktop',<DesktopNav menu={menu}/>],['submenu',<NavDropdown items={items} depth={0}/>],['menu-submenu',<DropdownMenu items={items} depth={0}/>],['list',<MenuItemList items={items}/>],
 ['mobile',<ul>{items.map(i=><MobileNavItem key={i.id} item={i} depth={0} onNavigate={()=>{}}/>)}</ul>],['mobile-menu',<ul>{items.map(i=><MobileMenuItem key={i.id} item={i} depth={0} onNavigate={()=>{}}/>)}</ul>]
]){const dom=new JSDOM(markup(node));const d=dom.window.document;
assert.equal(d.querySelectorAll('a').length,1,name+' must render only the actual link');assert.equal(d.querySelector('a').getAttribute('href'),'https://example.org/notes');assert(d.body.textContent.includes('Field notes'));assert(!d.body.textContent.includes('Never a navigation label'),name+' must suppress separator labels');assert.equal(d.querySelectorAll('hr,[role="separator"]').length,1,name+' divider');dom.window.close();checks++;}
globalThis.menuSemanticsFixture=menu;
for(const node of [<FooterNav/>,<SiteMenu location="header"/>,<SiteMenu location="footer"/>]){const dom=new JSDOM(markup(node));const d=dom.window.document;assert.equal(d.querySelectorAll('a').length,1);assert.equal(d.querySelectorAll('hr,[role="separator"]').length,1);assert(!d.body.textContent.includes('Never a navigation label'));dom.window.close();checks++;}
const headerConfig=structuredClone(HEADER_DEFAULTS);for(const key of ['search','cta','userMenu','darkModeToggle'])headerConfig[key].enabled=false;
for(const [index,Pack] of [Pack0,Pack1,Pack2,Pack3].entries()){const dom=new JSDOM(markup(<Pack data={{menu,siteIdentity:{title:'Menu study',showTitleWithLogo:true},headerConfig,layoutConfig:DEFAULT_LAYOUT_CONFIG}}/>));const nav=dom.window.document.querySelector('nav[aria-label="Primary navigation"]');assert(nav,'pack '+index+' has navigation');assert.equal(nav.querySelectorAll('a').length,1);assert(!nav.textContent.includes('Never a navigation label'));assert(nav.textContent.includes('Field notes'));assert.equal(nav.querySelectorAll('hr,[role="separator"]').length,1);dom.window.close();checks++;}
const group=item('heading','Explore',[item('custom','Child')]);const d=new JSDOM(markup(<DesktopNav menu={{...menu,items:[group]}}/>)).window.document;assert.equal(d.querySelectorAll('a').length,0);assert.equal(d.querySelector('button')?.textContent,'Explore');assert.equal(d.querySelector('button')?.getAttribute('aria-expanded'),'false');checks++;
for(const node of [<NavDropdown items={[group]} depth={0}/>,<DropdownMenu items={[group]} depth={0}/>]){const dom=new JSDOM(markup(node));assert.equal(dom.window.document.querySelector('button')?.getAttribute('aria-expanded'),'false');assert.equal(dom.window.document.querySelectorAll('a').length,0);dom.window.close();checks++;}
const sep=item('separator','Internal separator title',[item('custom','Below divider')]);
for(const node of [<DesktopNav menu={{...menu,items:[sep]}}/>,<NavDropdown items={[sep]} depth={0}/>,<DropdownMenu items={[sep]} depth={0}/>,<ul><MobileNavItem item={sep} depth={0} onNavigate={()=>{}}/></ul>,<ul><MobileMenuItem item={sep} depth={0} onNavigate={()=>{}}/></ul>]){
 const dom=new JSDOM(markup(node));assert.equal(dom.window.document.querySelector('a')?.textContent,'Below divider');assert(!dom.window.document.body.textContent.includes('Internal separator title'));assert.equal(dom.window.document.querySelectorAll('button').length,0);dom.window.close();checks++;
}
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.org',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,NodeFilter:dom.window.NodeFilter,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));const render=node=>root.render(<LayoutShellProvider>{node}</LayoutShellProvider>);
await React.act(async()=>render(<DesktopNav menu={{...menu,items:[group]}}/>));
const button=document.querySelector('button');button.focus();
for(const [key,expected] of [['Enter','true'],['Escape','false'],[' ','true'],[' ','false'],['ArrowDown','true']]){
 await React.act(async()=>button.dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));assert.equal(button.getAttribute('aria-expanded'),expected);assert.equal(document.activeElement,button);assert.equal(document.querySelectorAll('a').length,expected==='true'?1:0);checks++;
}
await React.act(async()=>button.click());assert.equal(button.getAttribute('aria-expanded'),'false');checks++;
const nested=item('heading','Explore',[item('heading','Collections',[item('custom','Seasons')])]);
await React.act(async()=>render(<DesktopNav menu={{...menu,items:[nested]}}/>));
await React.act(async()=>document.querySelector('button').click());
const inner=[...document.querySelectorAll('button')].find(n=>n.textContent==='Collections');await React.act(async()=>inner.click());
const leaf=document.querySelector('a');leaf.focus();await React.act(async()=>leaf.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
assert.equal(inner.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,inner);assert.equal(document.querySelector('button').getAttribute('aria-expanded'),'true');checks++;
await React.act(async()=>inner.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
assert.equal(document.querySelector('button').getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,document.querySelector('button'));checks++;
for(const [index,Mobile] of [Mobile0,Mobile1,Mobile2,Mobile3].entries()){
 await React.act(async()=>render(<Mobile data={{menu,siteIdentity:{title:'Menu study'},config:HEADER_DEFAULTS.mobileMenu,open:true,onClose:()=>{}}}/>));
 const nav=document.querySelector('nav[aria-label="Mobile navigation"]');assert(nav,'pack '+index+' mobile navigation');assert.equal(nav.querySelectorAll('a').length,1);assert(!nav.textContent.includes('Never a navigation label'));assert(nav.textContent.includes('Field notes'));assert.equal(nav.querySelectorAll('hr,[role="separator"]').length,1);checks++;
}
function MobileHarness({Mobile}){const shell=useLayoutShell();return <><main {...getBackgroundInertProps(shell.mobileNavOpen)}><button id="menu-opener" onClick={shell.toggleMobileNav}>Open study menu</button></main><Mobile data={{menu,siteIdentity:{title:'Menu study'},config:HEADER_DEFAULTS.mobileMenu,open:shell.mobileNavOpen,onClose:shell.closeMobileNav}}/></>;}
for(const Mobile of [Mobile0,Mobile1,Mobile2,Mobile3]){
 await React.act(async()=>render(<MobileHarness key={Mobile.name} Mobile={Mobile}/>));const opener=document.getElementById('menu-opener');opener.focus();await React.act(async()=>opener.click());
 const link=document.querySelector('nav[aria-label="Mobile navigation"] a');link.focus();await React.act(async()=>link.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(document.activeElement?.id,'menu-opener','mobile dismissal must restore its opener');checks++;
}
await React.act(async()=>root.unmount());dom.window.close();
console.log(checks+' menu semantics checks passed');`);
 const result=await Bun.build({entrypoints:[entry],target:'bun',outdir:dir,naming:'render.js',packages:'external',plugins:[{name:'routing-test-boundary',setup(build){build.onResolve({filter:/^@tanstack\/react-router$/},()=>({path:router}));build.onResolve({filter:/^@\//},args=>{
 const id=args.path.slice(2);
 if(['hooks/layout/useHeaderConfig','hooks/layout/useStickyHeaderOffset','lib/auth/clerk','hooks/useCart','contexts/SettingsContext','hooks/useDashboardConfig','hooks/layout/useMenuForLocation'].includes(id))return {path:state};
 if(['components/layout/HeaderActions','components/layout/SocialLinks','components/layout/ThemeToggle','components/layout/UserMenu','components/layout/WebsiteNotificationBell','templates/sdk/Surface','templates/packs/core/surfaces/chrome.cartDrawer','templates/packs/core/surfaces/chrome.searchOverlay'].includes(id))return {path:inert};
 return {path:Bun.resolveSync(resolve(app,'src',id),app)};
 });
 build.onResolve({filter:/^\.\/HeaderActions$/},()=>({path:inert}));
 build.onResolve({filter:/^\.\/SocialLinks$/},()=>({path:inert}));}}]});
 if(!result.success)throw Error(result.logs.join('\n'));
 const launch=join(dir,'launch.mjs');
 writeFileSync(launch,`import {JSDOM} from 'jsdom';const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://example.org',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,NodeFilter:dom.window.NodeFilter,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window)});try{await import('./render.js');}finally{dom.window.close();}`);
 const run=spawnSync(process.execPath,[launch],{encoding:'utf8'});process.stdout.write(run.stdout);process.stderr.write(run.stderr);if(run.status!==0)process.exitCode=1;
}finally{rmSync(dir,{recursive:true,force:true});}
