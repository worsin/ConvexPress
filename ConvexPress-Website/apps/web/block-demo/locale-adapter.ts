import {resolveCanonicalData} from "../src/templates/sdk/block-data/portable/resolve";
import type {DataScope,ResolverPolicy} from "../src/templates/sdk/block-data/portable/contracts";
export function resolveLocaleDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy){
 const parameters:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];
 parameters[34]=async()=>({enabled:true,currentLocale:"en",items:[
  {code:"en",label:"English",direction:"ltr",href:"/page/demo-english",current:true,destination:"translation"},
  {code:"es",label:"Español",direction:"ltr",href:"/page/demo-espanol",current:false,destination:"translation"},
  {code:"ar",label:"العربية",direction:"rtl",href:"/page/demo-arabic",current:false,destination:"landing"},
 ]});return resolveCanonicalData(...parameters);
}
