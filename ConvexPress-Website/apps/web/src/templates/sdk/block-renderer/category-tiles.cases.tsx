import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import tiles from "../../../../../../../blocks/commerce/category-tiles/render";
import {prepareBlocks} from "./model";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveCanonicalData} from "../block-data/portable/resolve";
import {planCanonicalData} from "../block-data/portable/planner";
const policy={enabledPlugins:["commerce"],capabilities:["viewer.authorization"],disabledBlocks:[]};
const current={scope:{websiteKey:"tiles",instanceKey:"test"},documentKey:"tiles",revision:"1",viewerKey:"reader"};
const treeFor=(attrs:Record<string,unknown>={})=>[{id:"tiles",name:"commerce/category-tiles",version:2,attrs}];
const category=(slug:string,count:number|null)=>({id:slug,slug,name:`${slug} & <script>`,href:`/categories/${slug}`,description:null,image:null,productCount:count});
async function install(items:unknown[],attrs:Record<string,unknown>={},progress:Record<string,unknown>={}){
 const tree=treeFor(attrs);
 const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async()=>({items,...progress}));
 const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {host,render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{"commerce/category-tiles":tiles},policy,{media:{}},{grant,current:context}))};
}
test("category binding preserves v2 fields and refuses fractional counts or authored authority",()=>{
 expect(planCanonicalData(treeFor({limit:24,categorySlugs:["home"]}),current.scope,policy).jobs[0]?.args).toEqual({cursor:null,categorySlugs:["home"],count:24,showCounts:true,showDescriptions:false});
 for(const attrs of [{limit:1.5},{viewerKey:"other"},{productCount:99}])expect(()=>planCanonicalData(treeFor(attrs),current.scope,policy)).toThrow();
 expect(()=>planCanonicalData(treeFor(),current.scope,{...policy,enabledPlugins:[]})).toThrow();
});
test("category tiles preserve selected order, accurate zero/singular labels and current visitor authority",async()=>{
 const {render,host}=await install([category("field",0),category("home",1)],{categorySlugs:["field","home"]});const html=render();
 expect(html.indexOf('/categories/field')).toBeLessThan(html.indexOf('/categories/home'));expect(html).toContain('0 products');expect(html).toContain('1 product');expect(html).not.toContain('<script>');
 expect(()=>render({...current,viewerKey:"other"})).toThrow();host.invalidate();expect(()=>render()).toThrow();
});
test("empty category lists and disabled count disclosures produce honest navigation",async()=>{
 const empty=await install([]);expect(empty.render()).toContain('Explore the shop');expect(empty.render()).not.toContain('cp-category-tile"');
 const hidden=await install([category("home",null)],{showCounts:false});expect(hidden.render()).not.toContain('cp-category-count');
 await expect(install([category("home",5)],{showCounts:false})).rejects.toThrow();
 await expect(install([{...category("home",1),href:'/categories/other'}])).rejects.toThrow();
});

test("pending category discovery and counting cannot masquerade as empty or completed totals",async()=>{
 const counting=await install([category("home",null)],{}, {state:"counting",cursor:null,nextCursor:"continue"});
 expect(counting.render()).toContain('Updating product counts');expect(counting.render()).toContain('aria-busy="true"');expect(counting.render()).not.toContain('0 products');
 const discovery=await install([],{}, {state:"discovering",cursor:null,nextCursor:"continue"});expect(discovery.render()).toContain('Finding your collections');expect(discovery.render()).not.toContain('A collection in the making');
 await expect(install([category("home",99)],{}, {state:"counting",cursor:null,nextCursor:"continue"})).rejects.toThrow();
});
