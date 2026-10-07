import fs from "node:fs";
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { getFunctionName } from "convex/server";
const identity={title:"Cell study"};
mock.module("@/hooks/layout/useSiteIdentity",()=>({useSiteIdentity:()=>identity}));
mock.module("@/hooks/layout/useFooterConfig",()=>({useFooterConfig:()=>undefined}));
mock.module("@/hooks/layout/useMenuForLocation",()=>({useMenuForLocation:()=>undefined}));
mock.module("@/components/layout/SocialLinks",()=>({SocialLinks:()=>null}));
const convex=await import('convex/react');
mock.module('convex/react',()=>({...convex,useMutation:()=>async()=>{},useQuery:(ref,args)=>args==='skip'?undefined:getFunctionName(ref).endsWith('getSrcSet')?'':args.mediaId==='missing'?null:args.mediaId==='loading'?undefined:{url:'https://example.org/media.svg',altText:'Library alt',width:1200,height:600}}));
const router=await import('@tanstack/react-router');mock.module('@tanstack/react-router',()=>({...router,Link:({to,children})=>createElement('a',{href:to},children)}));
const {FOOTER_DEFAULTS}=await import('@/templates/sdk/chromeDefinitions');
const failures=[];let cases=0;const exports={};
function check(name,run){try{run();cases++;}catch(e){failures.push(`${name}: ${e.message}`);}}
for(const pack of ['core','journal','depot','aster-house']){
 const {default:Surface}=await import(`../../templates/packs/${pack}/surfaces/chrome.footer.tsx`);
 function render(cell,verify,columnAlignment){const c=structuredClone(FOOTER_DEFAULTS);c.rows=[{id:'row',background:'default',padding:'normal',container:'default',columns:[{id:'col',alignment:columnAlignment,cell}]}];const dom=new JSDOM(renderToStaticMarkup(createElement(Surface,{data:{variant:'full',siteIdentity:identity,footerConfig:c}})));try{verify(dom.window.document);}finally{dom.window.close();}}
 for(const showIcons of [true,false])check(`${pack}/icons/${showIcons}`,()=>render({type:'contact',heading:'Reach us',address:'123 Study St',phone:'+15555550101',email:'study@example.invalid',showIcons},d=>{const tel=d.querySelector('a[href="tel:+15555550101"]');assert(tel);assert.equal(!!tel.querySelector('svg'),showIcons);assert.equal(!!d.querySelector('a[href="mailto:study@example.invalid"] svg'),showIcons);assert.ok(d.body.textContent.includes('123 Study St'));}));
 for(const alignment of ['left','center','right'])check(`${pack}/align/${alignment}`,()=>render({type:'text',body:'Aligned content',alignment},d=>{const p=[...d.querySelectorAll('p')].find(p=>p.textContent==='Aligned content');assert(p.parentElement.classList.contains(`text-${alignment}`));assert(p.parentElement.classList.contains(alignment==='center'?'items-center':alignment==='right'?'items-end':'items-start'));}));
 check(`${pack}/cell-over-column`,()=>render({type:'text',body:'Aligned content',alignment:'right'},d=>{const p=[...d.querySelectorAll('p')].find(p=>p.textContent==='Aligned content');assert(p.parentElement.classList.contains('text-right'));},'center'));
 for(const mediaId of ['https://example.org/direct.svg','stored','missing','loading'])check(`${pack}/image/${mediaId}`,()=>render({type:'image',mediaId,alt:'Authored alt',href:'https://example.org/destination',width:1200},d=>{const link=d.querySelector('a[href="https://example.org/destination"]');assert(link);assert.equal(link.style.maxWidth,'100%');const img=link.querySelector('img');if(mediaId==='missing'||mediaId==='loading')assert.equal(img,null);else{assert(img);assert.equal(img.alt,'Authored alt');assert.ok(!img.getAttribute('src').includes('stored'));assert.equal(img.style.maxWidth||img.parentElement.style.maxWidth,'100%');}}));
 if(process.env.FOOTER_CELL_OUTPUT){
  const c=structuredClone(FOOTER_DEFAULTS);c.rows=[{id:'sample',background:'default',padding:'normal',container:'default',columns:['left','center','right'].map((alignment,index)=>({id:`text-${alignment}`,width:4,cell:{type:'text',heading:`${alignment} alignment`,body:'Authored content',alignment}}))},{id:'media',background:'muted',padding:'normal',container:'default',columns:[{id:'image',width:6,cell:{type:'image',mediaId:'http://127.0.0.1:4333/footer-image.svg',alt:'Responsive image study',width:1200,alignment:'right',href:'https://example.org/destination'}},{id:'contact',width:6,cell:{type:'contact',heading:'Visit the studio',address:'123 Study Street',phone:'+15555550101',email:'studio@example.invalid',showIcons:true,alignment:'center'}}]}];exports[pack]=renderToStaticMarkup(createElement(Surface,{data:{variant:'full',siteIdentity:identity,footerConfig:c}}));
 }

}
assert.equal(failures.length,0,failures.join('\n'));console.log(JSON.stringify({passed:true,cases}));

if(process.env.FOOTER_CELL_OUTPUT)fs.writeFileSync(process.env.FOOTER_CELL_OUTPUT,JSON.stringify(exports));
