import {resolveCanonicalData} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
import type {BlockPageRequest} from '../src/templates/sdk/block-data/portable/postGridContracts';
export function resolveCurriculumDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={}){
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
 undefined,
 async args=>{
  if(!args.course)return {course:null,groups:[],cursor:args.cursor,nextCursor:null};
  if(args.cursor!==null&&args.cursor!=='demo-curriculum:second')throw Error('Invalid demo curriculum cursor');
  const first=args.cursor===null,entry=(title:string,i:number)=>({id:'demo-lesson-'+i,title,kind:i===3?'section_heading' as const:'lesson' as const});
  return {course:{id:args.course,title:'The art of working with clay',slug:'working-with-clay',href:'/courses/working-with-clay'},groups:first?[{topic:{id:'demo-module-one',title:'The foundations of a good practice',continued:false,continues:true},entries:['Meet your materials','A space for making','Understanding your clay','Tools and techniques','Creating the first form','Working with texture','Shaping the rim'].map(entry)}]:[{topic:{id:'demo-module-one',title:'The foundations of a good practice',continued:true,continues:false},entries:['Drying with care','Finishing your piece','Your first firing'].map((title,i)=>entry(title,i+7))},{topic:{id:'demo-module-two',title:'Finding your own expression',continued:false,continues:false},entries:['A family of forms','Colour, glaze, and surface','Building a lasting practice'].map((title,i)=>entry(title,i+10))}],cursor:args.cursor,nextCursor:first?'demo-curriculum:second':null};
 });
}
