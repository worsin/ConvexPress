import { expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
let density = 'comfortable';
const layout = () => ({gridDensity:density,shopLayout:'boutique',cartPanel:'drawer',productLayout:'classic',previewing:true});
const state = () => ({search:{},q:'',data:undefined,facetChips:[],commerceEnabled:true,currency:'USD',siteTitle:'Catalog',assistant:{},shell:null,hasFilters:false,update:()=>{},layout:layout()});
const router=await import('@tanstack/react-router');
mock.module('@tanstack/react-router',()=>({...router,Link:({children})=><a>{children}</a>,useSearch:()=>({}),useNavigate:()=>()=>{}}));
mock.module('./useShopCatalogData',()=>({useShopCatalogData:state}));
mock.module('@/hooks/useShopLayout',()=>({useShopLayout:layout}));
mock.module('@/hooks/useCommerceSessionToken',()=>({useCommerceSessionToken:()=>({})}));
mock.module('@/hooks/useAssistantConfig',()=>({useAssistantConfig:()=>({})}));
mock.module('@/contexts/SettingsContext',()=>({useSettings:()=>({plugins:{commerceEnabled:true}}),useSetting:()=>undefined}));
mock.module('./ShopShell',()=>({useShopShell:()=>null}));
const reactQuery=await import('@tanstack/react-query');
mock.module('@tanstack/react-query',()=>({...reactQuery,useQuery:()=>({data:undefined})}));
const convexQueryModule=await import('@convex-dev/react-query');
mock.module('@convex-dev/react-query',()=>({...convexQueryModule,convexQuery:()=>({})}));
const convex=await import('convex/react');
mock.module('convex/react',()=>({...convex,useQuery:()=>undefined}));
for (const pack of ['core','journal','depot','aster-house']) {
 const Catalog=(await import(`../../templates/packs/${pack}/surfaces/shop.catalog`)).default;
 test(`${pack} catalog density changes the actual result grid before data arrives`,()=>{
  const classes=[];
  for (const value of ['comfortable','dense']) {
   density=value;
   const dom=new JSDOM(renderToStaticMarkup(<Catalog variant={pack==='depot'?'marketplace':'boutique'} data={{}}/>));
   const grids=[...dom.window.document.querySelectorAll('div.grid')].filter(el=>el.children.length>=6);
   expect(grids).toHaveLength(1);
   classes.push(grids[0].className);
   dom.window.close();
  }
  expect(classes[1]).not.toBe(classes[0]);
 });
}
