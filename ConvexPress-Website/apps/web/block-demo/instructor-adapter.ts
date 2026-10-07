import {resolveCanonicalData} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
import type {BlockPageRequest} from '../src/templates/sdk/block-data/portable/postGridContracts';
import {demoCourses} from './courses-adapter';
export type InstructorSpecimen = { profile: "initials" | "portrait" | "minimal" | "unavailable"; portrait?: string };
export function resolveInstructorDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={},specimen:InstructorSpecimen={profile:"initials"}){
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
 async args=>{
  if(!args.instructor||specimen.profile==="unavailable")return {instructor:null,courses:[],cursor:args.cursor,nextCursor:null};
  const offset=args.cursor===null?0:args.cursor==="demo-instructor:6"?6:-1;if(offset<0)throw Error("Invalid synthetic instructor cursor");
  return {instructor:{id:args.instructor,name:"Robin Ellis",bio:specimen.profile==="minimal"?"":"Maker, educator, and lifelong beginner. Robin teaches thoughtful approaches to everyday creativity, with room for curiosity, experimentation, and finding your own way.",image:specimen.profile==="portrait"&&specimen.portrait?{src:specimen.portrait,alt:"Robin Ellis, fictional instructor"}:null},courses:demoCourses.slice(offset,offset+6).map(({id,title,slug,href})=>({id,title,slug,href})),cursor:args.cursor,nextCursor:offset===0?"demo-instructor:6":null};
 });
}
