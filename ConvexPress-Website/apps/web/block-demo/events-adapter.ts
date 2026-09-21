import {calendarWindow,calendarMonthAt,eventOverlapsWindow} from "../src/templates/sdk/block-data/portable/calendarContracts";
import type {BlockPageRequest} from "../src/templates/sdk/block-data/portable/postGridContracts";
import {resolveCanonicalData} from '../src/templates/sdk/block-data/portable/resolve';
import type {DataScope,ResolverPolicy} from '../src/templates/sdk/block-data/portable/contracts';
/** Synthetic BlockDemo records only. Production readers never import these. */
const events=[
  {id:'demo-clay',title:'A morning with clay',href:'/events/a-morning-with-clay',description:'Slow down, find your rhythm, and make something useful with your hands. An unhurried introduction to the studio.',startsAt:Date.UTC(2026,9,17,15),endsAt:Date.UTC(2026,9,17,18),timeZone:'America/Denver',venue:'The workroom · Aster House'},
  {id:'demo-table',title:'Stories around the table',href:'/events/stories-around-the-table',description:'A seasonal supper and a few good stories. Come for the food, stay for the conversation.',startsAt:Date.UTC(2026,9,24,23,30),endsAt:Date.UTC(2026,9,25,2),timeZone:'America/Denver',venue:'The long table · Aster House'},
  {id:'demo-field',title:'Field notes at first light',href:'/events/field-notes-at-first-light',description:'Bring a notebook and a little curiosity. We follow the morning light and notice what we would usually walk past.',startsAt:Date.UTC(2026,9,31,13,30),endsAt:Date.UTC(2026,9,31,15),timeZone:'America/Denver',venue:'Meet at the east porch'},];
export function resolveUpcomingEventsDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy,request:BlockPageRequest={}){
 return resolveCanonicalData(tree,scope,policy,async()=>null,undefined,undefined,undefined,request,async args=>({asOf:Date.UTC(2026,8,6),items:events.slice(0,args.limit).map(event=>({...event,description:args.showDescription?event.description:null}))}),async args=>({asOf:Date.UTC(2026,8,6),categoryId:args.category??null,event:args.category?null:events[0]}),async args=>{
 const asOf=Date.UTC(2026,9,1,12),timeZone=args.timeZone??'America/Denver',month=args.month??calendarMonthAt(asOf,timeZone),window=calendarWindow(month,timeZone);
 const all=args.category?[]:events.filter(event=>eventOverlapsWindow(event,window));
 const offset=args.cursor?Number(args.cursor.replace('demo-calendar-','')):0;
 if(!Number.isInteger(offset)||offset<0)throw Error('Invalid synthetic calendar cursor');
 return {...window,asOf,categoryId:args.category??null,items:all.slice(offset,offset+args.limit),cursor:args.cursor,nextCursor:offset+args.limit<all.length?`demo-calendar-${offset+args.limit}`:null};
 });
}
