import {resolveCanonicalData} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
export function resolveSupportDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,available=true){
 const args:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];
 args[29]=async()=>({available});
 return resolveCanonicalData(...args);
}
