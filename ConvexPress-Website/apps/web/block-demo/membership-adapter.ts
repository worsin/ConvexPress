import {resolveCanonicalData} from "../src/templates/sdk/block-data/portable/resolve";
import type {DataScope,ResolverPolicy} from "../src/templates/sdk/block-data/portable/contracts";
import type {MembershipAccessResult} from "../src/templates/sdk/block-data/portable/membershipContracts";
/** Synthetic specimen states only; never an authenticated site session. */
export function resolveMembershipDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,state:MembershipAccessResult['state']='signed-out'){
 return resolveCanonicalData(tree,scope,policy,async()=>null,undefined,undefined,undefined,{},undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async args=>!args.plan ? {state:'unconfigured',plan:null} : state==='unconfigured'||state==='unavailable' ? {state:'unavailable',plan:null} : {state,plan:{id:args.plan,title:'The Studio Circle'}});
}
