import { expect, mock, test } from 'bun:test';
import { JSDOM } from 'jsdom';
const dom=new JSDOM('<div id="root"></div>',{url:'http://example.invalid/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','Element','Node','DocumentFragment','MutationObserver','getComputedStyle','navigator','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{value:typeof dom.window[key]==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?dom.window[key].bind(dom.window):dom.window[key],configurable:true,writable:true});
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let customer=null;
mock.module('@/lib/auth/clerk',()=>({useAuth:()=>({isLoaded:true,isSignedIn:!!customer}),useUser:()=>({user:customer}),useClerk:()=>({signOut(){}})}));
const settingsModule=await import('@/contexts/SettingsContext');
mock.module('@/contexts/SettingsContext',()=>({...settingsModule,useSettings:()=>({plugins:{commerceEnabled:true},dashboardConfig:{basePath:'/account'}})}));
const {act}=await import('react');const {createRoot}=await import('react-dom/client');
const {createMemoryHistory,createRootRoute,createRouter,RouterProvider}=await import('@tanstack/react-router');
const {LayoutShellProvider}=await import('./LayoutShellProvider');
const packs=['core','journal','depot','aster-house'];
for(const pack of packs){
 const Surface=(await import(`../../templates/packs/${pack}/surfaces/chrome.mobileNav`)).default;
 for(const [name,config,signedIn,wantLogin,wantRegister,wantDashboard] of [
  ['disabled guest',{enabled:false,guestDisplay:'login-register'},false,false,false,false],
  ['hidden guest',{enabled:true,guestDisplay:'hidden'},false,false,false,false],
  ['login only',{enabled:true,guestDisplay:'login-only'},false,true,false,false],
  ['login and registration',{enabled:true,guestDisplay:'login-register'},false,true,true,false],
  ['disabled customer',{enabled:false,guestDisplay:'login-register'},true,false,false,false],
  ['enabled customer',{enabled:true,guestDisplay:'hidden'},true,false,false,true],
 ])test(`${pack}: mobile account ${name}`,async()=>{
  customer=signedIn?{firstName:'Fixture',lastName:'Customer',imageUrl:null,primaryEmailAddress:{emailAddress:'fixture@example.invalid'}}:null;
  const route=createRootRoute({component:()=> <LayoutShellProvider><Surface data={{menu:{items:[]},siteIdentity:{title:'Fixture',tagline:''},config:{variant:'drawer',drawerSide:'left'},userMenu:config,open:true,onClose(){}}}/></LayoutShellProvider>});
  const router=createRouter({routeTree:route,history:createMemoryHistory({initialEntries:['/']})});const root=createRoot(document.getElementById('root'));
  try{await act(async()=>{await router.load();root.render(<RouterProvider router={router}/>);});
   const dialog=document.querySelector('[data-slot="mobile-nav"]');expect(dialog).not.toBeNull();
   expect(!!dialog.querySelector('a[href="/login"]')).toBe(wantLogin);
   expect(!!dialog.querySelector('a[href="/register"]')).toBe(wantRegister);
   expect(/Dashboard/.test(dialog.textContent)).toBe(wantDashboard);
   if(pack==='depot')expect(!!dialog.querySelector('a[href="/cart"]')).toBe(true);
  }finally{await act(async()=>root.unmount());}
 });
}
