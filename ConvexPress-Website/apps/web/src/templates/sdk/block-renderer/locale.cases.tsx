import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import block from "../../../../../../../blocks/core/language-switcher/render";
import {prepareBlocks} from "./model";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveCanonicalData} from "../block-data/portable/resolve";
import type {LocaleResult} from "../block-data/portable/localeContracts";
const policy={enabledPlugins:[],capabilities:["locale.routing"],disabledBlocks:[]};
const current={scope:{websiteKey:"languages",instanceKey:"test"},documentKey:"page",revision:"1",viewerKey:"visitor"};
const tree=[{id:"languages",name:"core/language-switcher",version:1,attrs:{}}];
const data:LocaleResult={enabled:true,currentLocale:"en",items:[{code:"en",label:"English",direction:"ltr",href:"/page/home",current:true,destination:"translation"},{code:"ar",label:"العربية",direction:"rtl",href:"/page/arabic",current:false,destination:"landing"}]};
async function install(result:LocaleResult){const parameters:Parameters<typeof resolveCanonicalData>=[tree,current.scope,policy,async()=>null];parameters[34]=async()=>result;const envelope=await resolveCanonicalData(...parameters),host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});return{host,render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{"core/language-switcher":block},policy,{media:{}},{grant,current:context}))};}
test("language links expose real destination semantics, native labels and current page",async()=>{const html=(await install(data)).render();expect(html).toContain('hrefLang="ar"');expect(html).toContain('lang="ar" dir="rtl"');expect(html).toContain('aria-current="page"');expect(html).toContain("Language home");expect(html).toContain('href="/page/arabic"');});
test("disabled and entirely inaccessible language sets render no misleading links",async()=>{expect((await install({enabled:false,currentLocale:null,items:[]})).render()).not.toContain("Choose a language");expect((await install({...data,items:[]})).render()).not.toContain("Choose a language");});
test("language source is required before reads and viewer changes invalidate its grant",async()=>{let read=false;await expect(resolveCanonicalData(tree,current.scope,policy,async()=>{read=true;return null;})).rejects.toThrow("language reader");expect(read).toBe(false);const {host,render}=await install(data);expect(()=>render({...current,viewerKey:"other"})).toThrow();host.invalidate();expect(()=>render()).toThrow();});
