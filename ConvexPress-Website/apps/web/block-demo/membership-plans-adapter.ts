import {resolveCanonicalData} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
import type {BlockPageRequest} from '../src/templates/sdk/block-data/portable/postGridContracts';
export const demoMembershipPlans=[
 {id:'demo-plan-studio',title:'Studio Notes',description:'A closer look at the ideas, materials, and everyday rituals behind the work.',benefits:[{id:'studio-notes',label:'Letters from the studio',description:'New work and the stories behind it.'},{id:'studio-library',label:'The reading room',description:'A growing collection of field notes and thoughtful references.'}]},
 {id:'demo-plan-circle',title:'The Makers Circle',description:'Make room for a shared practice, a little encouragement, and good company.',benefits:[{id:'circle-table',label:'Around the table',description:'Small group conversations with the people doing the work.'},{id:'circle-process',label:'Inside the process',description:'Follow a piece from the first sketch to the final details.'},{id:'circle-notes',label:'Studio notes included',description:''}]},
 {id:'demo-plan-workshop',title:'Open Workshop',description:'For curious hands and unfinished ideas. Come with a question; leave with something of your own.',benefits:[{id:'workshop-session',label:'Guided workshop sessions',description:'Time and space to explore a new material or technique.'},{id:'workshop-feedback',label:'Thoughtful feedback',description:'Share your progress with an experienced maker.'}]},
 {id:'demo-plan-reader',title:'The Reading Room',description:'Space for long-form ideas and thoughtful conversations.',benefits:[]},
 {id:'demo-plan-seasonal',title:'Seasonal Gatherings',description:'A small gathering as the seasons turn.',benefits:[]},
 {id:'demo-plan-archive',title:'The Archive',description:'A collection of the things we return to.',benefits:[]},
 {id:'demo-plan-residency',title:'Studio Residency',description:'Time to develop a practice of your own.',benefits:[]},
];
export function resolveMembershipPlansDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={}){
 return resolveCanonicalData(tree,scope,policy,async()=>null,undefined,undefined,undefined,request,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,async args=>{
  const selected=args.selection==='all'?demoMembershipPlans:args.plans.flatMap(id=>demoMembershipPlans.filter(p=>p.id===id));
  const offset=args.cursor?Number(args.cursor.slice('demo-plans:'.length)):0;
  if(!Number.isInteger(offset)||offset<0||offset>selected.length||(args.cursor&&args.cursor!==`demo-plans:${offset}`))throw Error('Invalid synthetic membership cursor');
  return {items:selected.slice(offset,offset+args.limit),cursor:args.cursor,nextCursor:offset+args.limit<selected.length?`demo-plans:${offset+args.limit}`:null};
 });
}
