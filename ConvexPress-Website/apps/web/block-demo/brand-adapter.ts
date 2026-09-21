import mark from "./assets/aster-objects-compact.png";
import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import type { BrandResult } from "../src/templates/sdk/block-data/portable/brandContracts";
/** Fictional makers for internal visual acceptance, never seeded as store defaults. */
export const demoBrands:BrandResult={items:[
 {id:"aster",name:"Aster Objects",slug:"aster-objects",description:"Considered objects for everyday rituals.",href:"/brands/aster-objects",logo:{src:mark.startsWith("/")?mark:`/${mark}`,alt:"Aster Objects flower and wordmark"}},
 {id:"field",name:"Fieldwork",slug:"fieldwork",description:"Tools for a thoughtful day.",href:"/brands/fieldwork",logo:null},
 {id:"still",name:"Still House",slug:"still-house",description:"Simple forms, generous spaces.",href:"/brands/still-house",logo:null},
 {id:"common",name:"Common Ground",slug:"common-ground",description:"Useful things, made with care.",href:"/brands/common-ground",logo:null},
]};
export function resolveBrandDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,result=demoBrands){
  return resolveCanonicalData(tree, scope, policy, async () => null, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, async (args) => ({ items: result.items.slice(0,args.limit) }));
}
