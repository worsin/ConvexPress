import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import {JSDOM} from "jsdom";
import {prepareBlocks} from "./model";
import {PrimitiveProvider} from "../primitives";
import split from "../../../../../../../blocks/core/hero-split/render";
import text from "../../../../../../../blocks/core/hero-text-only/render";
import mediaText from "../../../../../../../blocks/core/media-text/render";
import newsletter from "../../../../../../../blocks/core/newsletter-signup/render";
import tiles from "./category-tiles";
import showcase from "./product-showcase";
import journalSplit from "../../packs/journal/blocks/core/hero-split";
import depotSplit from "../../packs/depot/blocks/core/hero-split";
import journalMedia from "../../packs/journal/blocks/core/media-text";
import depotMedia from "../../packs/depot/blocks/core/media-text";
import journal from "../../packs/journal/parts/primitives";
import depot from "../../packs/depot/parts/primitives";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveProductsDemo} from "../../../../block-demo/products-adapter";
const policy={enabledPlugins:["commerce"],capabilities:["reference.targetResolution","form.submission","viewer.authorization"],disabledBlocks:[]};
const resources={media:{photo:{src:"/retained.jpg",alt:"Retained image",mimeType:"image/jpeg",width:800,height:600}}};
const registry:any={"core/hero-split":split,"core/hero-text-only":text,"core/media-text":mediaText,"core/newsletter-signup":newsletter,"commerce/category-tiles":tiles,"commerce/product-showcase":showcase};
function render(node:any,pack:string,renderer:any=registry[node.name],data?:any){
 const html=renderToStaticMarkup(<PrimitiveProvider packId={pack} registry={{journal,depot}}>{prepareBlocks([node],{[node.name]:renderer},policy,resources,data,pack)}</PrimitiveProvider>);
 return new JSDOM(html).window.document.body;
}
const original=(name:string,values:object,attrs:object={})=>({id:"original",name,version:2,attrs,treatment:{name:"original",values}});
test("original media ordering survives Hero and Media Text pack overrides; modern controls keep copy-first DOM",()=>{
 for(const pack of ["core","journal","depot","aster-house"]){
  for(const [name,axis,renderer] of [["core/hero-split","mediaSide",pack==="journal"?journalSplit:pack==="depot"?depotSplit:split],["core/media-text","mediaPosition",pack==="journal"?journalMedia:pack==="depot"?depotMedia:mediaText]] as const){
   for(const side of ["left","right"]){
    const attrs={body:"Saved body",mediaId:"photo",mediaAlt:"Saved alt",...(name==="core/hero-split"?{title:"Saved title",primaryCtaLabel:"Read",primaryCtaUrl:"/about"}:{heading:"Saved heading",ctaLabel:"Read",ctaUrl:"/about"})};
    const dom=render(original(name,{[axis]:side},attrs),pack,renderer),image=dom.querySelector("img")!,heading=dom.querySelector("h1,h2")!;
    expect(image.getAttribute("alt")).toBe("Saved alt");expect(dom.querySelector("a")?.getAttribute("href")).toBe("/about");expect(dom.textContent).toContain("Saved body");
    expect(Boolean(image.compareDocumentPosition(heading)&4)).toBe(side==="left");
    expect(dom.querySelector(".cp-split")?.getAttribute("data-reverse")).toBe("false");
   }
  }
  const originalAlt=render(original("core/hero-split",{mediaSide:"right"},{title:"Original image description",mediaId:"photo"}),pack,pack==="journal"?journalSplit:pack==="depot"?depotSplit:split);
  expect(originalAlt.querySelector("img")?.getAttribute("alt")).toBe("Original image description");
  for(const position of ["start","end"]){
   const dom=render(original("core/hero-split",{mediaSide:"left"},{title:"Modern edited",mediaId:"photo",mediaSide:position}),pack,pack==="journal"?journalSplit:pack==="depot"?depotSplit:split);
   expect(Boolean(dom.querySelector("h1")!.compareDocumentPosition(dom.querySelector("img")!)&4)).toBe(true);
   expect(dom.querySelector(".cp-split")?.getAttribute("data-reverse")).toBe(String(position==="start"));
  }
 }
});
test("original Hero alignment, media placeholder and newsletter preserve content and closed presentation",()=>{
 for(const pack of ["core","journal","depot","aster-house"]){
  for(const alignment of ["left","center"]){const dom=render(original("core/hero-text-only",{alignment},{title:"Saved title",primaryCtaLabel:"Read",primaryCtaUrl:"/about"}),pack);expect(dom.querySelector(".cp-original-text-hero")?.getAttribute("data-alignment")).toBe(alignment);expect(dom.querySelector("h1")?.textContent).toBe("Saved title");}
  const dom=render(original("core/media-text",{mediaPosition:"left"},{heading:"Copy retained"}),pack);expect(dom.querySelector('[aria-label="Media placeholder"]')).not.toBeNull();expect(dom.querySelector("h2")?.textContent).toBe("Copy retained");
  for(const variant of ["inline","large"]){const dom=render(original("core/newsletter-signup",{variant},{heading:"Keep in touch",submitLabel:"Join"}),pack);expect(dom.querySelector(".cp-library-signup")?.getAttribute("data-original-variant")).toBe(variant);expect(dom.textContent).toContain("Join");expect(dom.querySelector('input[type="email"]')).not.toBeNull();}
 }
 expect(()=>render(original("core/hero-split",{mediaSide:"invented"}),"core")).toThrow();
 expect(()=>render(original("core/hero-text-only",{alignment:"center"}),"unknown")).toThrow();
});
test("saved commerce columns survive data projection without replacing products or categories",async()=>{
 const current={scope:{websiteKey:"fixture",instanceKey:"fixture"},documentKey:"original",revision:"1",viewerKey:"reader"};
 for(const pack of ["core","journal","depot","aster-house"])for(const name of ["commerce/category-tiles","commerce/product-showcase"])for(const columns of [2,3,4]){
  const node=original(name,{columns});const envelope=await resolveProductsDemo([node],current.scope,policy);const host=createDemoContentPageHost();const grant=host.install({tree:[node],context:current,policy,envelope});
  const dom=render(node,pack,registry[name],{grant,current});
  expect(dom.querySelector(name==="commerce/category-tiles"?".cp-category-tiles":".cp-product-showcase")?.getAttribute(name==="commerce/category-tiles"?"data-original-columns":"data-columns")).toBe(String(columns));
  expect(dom.querySelectorAll("li").length).toBeGreaterThan(0);host.invalidate();
 }
});
