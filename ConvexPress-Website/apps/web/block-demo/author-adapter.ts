import {resolveCanonicalDataWithDefinitions} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
export function resolveAuthorDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,portrait='/portrait.png') {
 return resolveCanonicalDataWithDefinitions(tree,scope,policy,{readPage:async()=>null,readAuthor:async args=>({author:(args.useCurrentAuthor || args.userId==='demo-author')?{id:'demo-author',name:'Rowan Vale',bio:'A fictional writer interested in useful objects and everyday observations.',href:'/author/rowan-vale',image:{src:portrait,alt:'Fictional author portrait'}}:null})});
}
