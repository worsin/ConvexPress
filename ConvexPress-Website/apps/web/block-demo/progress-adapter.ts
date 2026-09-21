import {resolveCanonicalData} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
import type {BlockPageRequest} from '../src/templates/sdk/block-data/portable/postGridContracts';
import {demoCourses} from './courses-adapter';
export function resolveProgressDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={}){
 return resolveCanonicalData(tree,
 scope,
 policy,
 async()=>null,
 undefined,
 undefined,
 undefined,
 request,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 undefined,
 async args=>{
  const offset=args.cursor===null?0:args.cursor==="demo-progress:6"?6:-1;if(offset<0)throw Error("Invalid demonstration progress cursor");
  const courses=args.scope==="course"?demoCourses.filter(course=>course.id===args.course):demoCourses;
  return {state:"ready",items:courses.slice(offset,offset+6).map(({id,title,slug,href,progress},i)=>({id,title,slug,href,progress:progress??(i===2?{state:"preparing"}:{completed:0,total:10,percent:0})})),cursor:args.cursor,nextCursor:args.scope==="all"&&offset+6<courses.length?"demo-progress:6":null};
 });
}
