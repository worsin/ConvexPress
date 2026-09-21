import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import renderer from "../../../../../../../blocks/commerce/variant-picker-teaser/render";
import {prepareBlocks} from "./model";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveCanonicalData} from "../block-data/portable/resolve";
import {productOptionsResultSchema,productOptionHref} from "../block-data/portable/productOptionsContracts";
import {getLinkedSelectedOptions,getNextSelectedOptions} from "../../../routes/_marketing/products/-variantSelection";
const policy={enabledPlugins:["commerce"],capabilities:["reference.targetResolution"],disabledBlocks:[]};
const current={scope:{websiteKey:"options",instanceKey:"site-a"},documentKey:"options-page",revision:"1",viewerKey:"public"};
const product={id:"shirt",title:"Studio <script>shirt</script>",href:"/products/studio-shirt",excerpt:null,createdAt:1,image:null,pricing:null};
const group={id:"color",name:"Color",values:[{id:"ink & blue",label:"Ink & blue"},{id:"chalk",label:"Chalk"}]};
async function install(data:unknown={product,groups:[group]},attribute=""){
 const tree=[{id:"options",name:"commerce/variant-picker-teaser",version:1,attrs:{product:"shirt",attribute}}];
 const parameters:Parameters<typeof resolveCanonicalData>=[tree,current.scope,policy,async()=>null];parameters[36]=async()=>data;
 const envelope=await resolveCanonicalData(...parameters),host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 return {host,render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{"commerce/variant-picker-teaser":renderer},policy,{media:{}},{grant,current:context}))};
}
test("variant teaser renders real choices with escaped labels and encoded destination hints",async()=>{
 const {render,host}=await install();const html=render();expect(html).toContain('data-options-state="ready"');expect(html).toContain("Ink &amp; blue");expect(html).toContain("optionType=color&amp;optionValue=ink+%26+blue");expect(html).not.toContain("<script>");expect(html).not.toContain("Add to cart");
 expect(()=>render({...current,viewerKey:"different"})).toThrow();expect(()=>render({...current,scope:{...current.scope,instanceKey:"site-b"}})).toThrow();host.invalidate();expect(()=>render()).toThrow();
});
test("variant teaser has unavailable and no-options states without inventing choices",async()=>{
 expect((await install({product:null,groups:[]})).render()).toContain('data-options-state="empty"');
 expect((await install({product,groups:[]})).render()).toContain('data-options-state="no-options"');
 await expect(install({product:{...product,id:"other"},groups:[group]})).rejects.toThrow();
 await expect(install({product,groups:[group]},"Size")).rejects.toThrow();
 await expect(install({product:{...product,href:"javascript:alert(1)"},groups:[group]})).rejects.toThrow();
});
test("public options contract refuses orphaned, duplicate, private and oversized response fields",()=>{
 for(const data of [{product:null,groups:[group]},{product,groups:[group,group]},{product,groups:[{...group,values:[group.values[0],group.values[0]]}]},{product:{...product,sku:"private"},groups:[group]},{product,groups:[{...group,values:Array.from({length:65},(_,i)=>({id:String(i),label:String(i)}))}]}])expect(productOptionsResultSchema.safeParse(data).success).toBe(false);
 expect(productOptionHref("/products/shirt","a&b","#/blue")).toBe("/products/shirt?optionType=a%26b&optionValue=%23%2Fblue");
});
test("product page accepts only complete public combinations for option-link hints",()=>{
 const types=[{id:"color",name:"Color",values:[{id:"blue",label:"Blue"},{id:"red",label:"Red"}]},{id:"size",name:"Size",values:[{id:"s",label:"Small"},{id:"l",label:"Large"}]}];
 const variants=[{_id:"private",title:"private",status:"private",selections:[{optionTypeId:"color",optionValueId:"red"},{optionTypeId:"size",optionValueId:"s"}]},{_id:"public",title:"public",status:"publish",selections:[{optionTypeId:"color",optionValueId:"blue"},{optionTypeId:"size",optionValueId:"l"}]}];
 expect(getLinkedSelectedOptions(types,variants,{optionType:"color",optionValue:"blue"})).toEqual({color:"blue",size:"l"});
 for(const hint of [undefined,{optionType:"color",optionValue:"red"},{optionType:"color",optionValue:"missing"},{optionType:"foreign",optionValue:"blue"}])expect(getLinkedSelectedOptions(types,variants,hint)).toBeNull();
 expect(getLinkedSelectedOptions(types,[{...variants[1]!,selections:[{optionTypeId:"color",optionValueId:"blue"},{optionTypeId:"color",optionValueId:"blue"}]}],{optionType:"color",optionValue:"blue"})).toBeNull();
 expect(getLinkedSelectedOptions(types,[{...variants[1]!,selections:[{optionTypeId:"color",optionValueId:"blue"},{optionTypeId:"size",optionValueId:"invalid"}]}],{optionType:"color",optionValue:"blue"})).toBeNull();
});

test("sparse product combinations remain switchable and preserve compatible choices",()=>{
 const types=[{id:"color",name:"Color",values:[{id:"ink",label:"Ink"},{id:"chalk",label:"Chalk"}]},{id:"size",name:"Size",values:[{id:"s",label:"Small"},{id:"l",label:"Large"}]}];
 const make=(id:string,color:string,size:string,status="publish")=>({_id:id,title:id,status,selections:[{optionTypeId:"color",optionValueId:color},{optionTypeId:"size",optionValueId:size}]});
 const sparse=[make("ink-small","ink","s"),make("chalk-large","chalk","l"),make("private-ink-large","ink","l","private")];
 expect(getNextSelectedOptions(types,sparse,{color:"chalk",size:"l"},"color","ink")).toEqual({color:"ink",size:"s"});
 expect(getNextSelectedOptions(types,sparse,{color:"ink",size:"s"},"size","l")).toEqual({color:"chalk",size:"l"});
 expect(getNextSelectedOptions(types,[...sparse,make("ink-large","ink","l")],{color:"chalk",size:"l"},"color","ink")).toEqual({color:"ink",size:"l"});
 expect(getNextSelectedOptions(types,sparse,{color:"ink",size:"s"},"color","missing")).toBeNull();
});
