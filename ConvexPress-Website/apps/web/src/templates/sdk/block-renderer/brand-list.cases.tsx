import { expect,test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import brandBlock from "../../../../../../../blocks/commerce/brand-list/render";
import { prepareBlocks } from "./model";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { planCanonicalData } from "../block-data/portable/planner";
import { brandResultSchema } from "../block-data/portable/brandContracts";
import { resolveBrandDemo,demoBrands } from "../../../../block-demo/brand-adapter";
const tree=[{id:"brands",name:"commerce/brand-list",version:1,attrs:{limit:12}}];
const policy={enabledPlugins:["commerce"],capabilities:["viewer.authorization"],disabledBlocks:[]};
const current={scope:{websiteKey:"store",instanceKey:"staging"},documentKey:"makers",revision:"1",viewerKey:"public"};
async function installed(result=demoBrands){const envelope=await resolveBrandDemo(tree,current.scope,policy,result);const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});return {host,render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{"commerce/brand-list":brandBlock},policy,{media:{}},{grant,current:context}))};}
test("brand list renders trusted names and catalog links without inventing endorsements",async()=>{
 const {render}=await installed();const html=render();expect(html).toContain('aria-label="Shop by brand"');expect(html).toContain('href="/brands/aster-objects"');expect(html).toContain('aria-label="Shop Aster Objects"');expect(html).not.toContain("Trusted by");expect(html.indexOf("Aster Objects")).toBeLessThan(html.indexOf("Fieldwork"));
 const logo=await installed({items:[{...demoBrands.items[0]!,logo:{src:"https://images.example.invalid/mark.png",alt:"Private alt?"}}]});expect(logo.render()).toContain('alt=""');expect(logo.render()).toContain('decoding="async"');expect(logo.render()).toContain('loading="lazy"');
 const escaped=await installed({items:[{...demoBrands.items[0]!,name:"<script>bad</script>"}]});expect(escaped.render()).not.toContain("<script>");expect(escaped.render()).toContain("&lt;script&gt;");
});
test("empty, withdrawn and wrong-viewer brand data cannot render",async()=>{
 const empty=await installed({items:[]});expect(empty.render()).not.toContain('aria-label="Shop by brand"');
 const {host,render}=await installed();expect(()=>render({...current,viewerKey:"other"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
});
test("brand contracts reject unsafe links, mismatched slugs, duplicate identities and authored data injection",()=>{
 expect(planCanonicalData(tree,current.scope,policy).jobs[0]?.args).toEqual({limit:12});
 for(const change of [{href:"javascript:alert(1)"},{href:"/brands/other"},{logo:{src:"data:text/html,bad",alt:""}}])expect(()=>brandResultSchema.parse({items:[{...demoBrands.items[0],...change}]})).toThrow();
 expect(()=>brandResultSchema.parse({items:[demoBrands.items[0],demoBrands.items[0]]})).toThrow();
 expect(()=>planCanonicalData([{...tree[0],attrs:{limit:49}}],current.scope,policy)).toThrow();
 expect(()=>planCanonicalData([{...tree[0],attrs:{brands:demoBrands.items}}],current.scope,policy)).toThrow();
 expect(()=>planCanonicalData(tree,current.scope,{...policy,enabledPlugins:[]})).toThrow();expect(()=>planCanonicalData(tree,current.scope,{...policy,capabilities:[]})).toThrow();
});
