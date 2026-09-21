import {test,expect} from 'bun:test';
import {planCanonicalData} from './planner';
import {resolveCanonicalData,validateCanonicalData} from './resolve';
import {upcomingEventsResultSchema} from './eventContracts';
const scope={websiteKey:'site',instanceKey:'stage'},policy={enabledPlugins:['events'],capabilities:[],disabledBlocks:[]};
const block=(id:string,attrs={})=>({id,name:'events/upcoming',version:1,attrs});
const event={id:'event',title:'A gathering',href:'/events/gathering',description:null,startsAt:100,endsAt:200,timeZone:'America/Denver',venue:'House'};
test('upcoming event plans require the plugin, deduplicate identical reads and bind disclosure',async()=>{
 const tree=[block('one',{showDescription:false}),block('two',{showDescription:false})];
 expect(()=>planCanonicalData(tree,scope,{...policy,enabledPlugins:[]})).toThrow();
 expect(planCanonicalData(tree,scope,policy).jobs).toHaveLength(1);
 let reads=0;
 await expect(resolveCanonicalData(tree,scope,policy,async()=>{reads++;return null;})).rejects.toThrow('Trusted events reader');expect(reads).toBe(0);
 const envelope=await resolveCanonicalData(tree,scope,policy,async()=>null,undefined,undefined,undefined,{},async args=>{reads++;expect(args.showDescription).toBe(false);return {asOf:50,items:[event]};});
 expect(reads).toBe(1);expect(validateCanonicalData(tree,scope,policy,envelope)).toEqual(envelope);
 const changed=structuredClone(envelope);if(changed.dataByBlock.one.resolver!=='events.upcoming')throw Error('Wrong fixture');changed.dataByBlock.one.data.items[0].description='Unrequested description';
 expect(()=>validateCanonicalData(tree,scope,policy,changed)).toThrow();
 expect(()=>validateCanonicalData(tree,{...scope,instanceKey:'other'},policy,envelope)).toThrow();
});
test('event summaries reject chronology, invalid zones, duplicates and source-only fields',()=>{
 for(const value of [
 {asOf:101,items:[event]}, {asOf:50,items:[event,event]}, {asOf:50,items:[{...event,timeZone:'Bad/Zone'}]},
 {asOf:50,items:[{...event,endsAt:99}]}, {asOf:50,items:[{...event,href:'javascript:alert(1)'}]},
 {asOf:50,items:[{...event,createdBy:'controller'}]},
 ])expect(()=>upcomingEventsResultSchema.parse(value)).toThrow();
 expect(upcomingEventsResultSchema.parse({asOf:50,items:[event]}).items).toHaveLength(1);
});
test('Next Event deduplicates, requires its trusted reader and binds the exact event category',async()=>{
 const nextPolicy={...policy,capabilities:['reference.targetResolution']};
 const tree=[{id:'one',name:'events/next-event',version:1,attrs:{category:'category-a'}},{id:'two',name:'events/next-event',version:1,attrs:{category:'category-a'}}];
 expect(planCanonicalData(tree,scope,nextPolicy).jobs).toHaveLength(1);
 let reads=0;
 await expect(resolveCanonicalData(tree,scope,nextPolicy,async()=>{reads++;return null;})).rejects.toThrow('Trusted Next Event reader');expect(reads).toBe(0);
 const envelope=await resolveCanonicalData(tree,scope,nextPolicy,async()=>null,undefined,undefined,undefined,{},undefined,async args=>{reads++;return {asOf:50,categoryId:args.category??null,event};});
 expect(reads).toBe(1);expect(validateCanonicalData(tree,scope,nextPolicy,envelope)).toEqual(envelope);
 const mismatch=structuredClone(envelope);if(mismatch.dataByBlock.one.resolver!=='events.next')throw Error('Invalid fixture');mismatch.dataByBlock.one.data.categoryId='category-b';
 expect(()=>validateCanonicalData(tree,scope,nextPolicy,mismatch)).toThrow();
 for(const result of [{asOf:101,categoryId:'category-a',event},{asOf:50,categoryId:'category-b',event}, {asOf:50,categoryId:'category-a',event:{...event,registrationUrl:'https://secret.example.invalid'}}])await expect(resolveCanonicalData(tree,scope,nextPolicy,async()=>null,undefined,undefined,undefined,{},undefined,async()=>result)).rejects.toThrow();
});
import {calendarWindow} from './calendarContracts';
test('Calendar binds visitor months separately, deduplicates, and requires a trusted reader before reads',async()=>{
 const p={...policy,capabilities:['reference.targetResolution']};
 const tree=[{id:'one',name:'events/calendar',version:1,attrs:{category:'category-a'}},{id:'two',name:'events/calendar',version:1,attrs:{category:'category-a'}}];
 const request={one:JSON.stringify({month:'2026-09',cursor:null})};
 expect(planCanonicalData(tree,scope,p).jobs).toHaveLength(1);expect(planCanonicalData(tree,scope,p,request).jobs).toHaveLength(2);
 let reads=0;await expect(resolveCanonicalData(tree,scope,p,async()=>{reads++;return null;})).rejects.toThrow('Trusted Calendar reader');expect(reads).toBe(0);
 const envelope=await resolveCanonicalData(tree,scope,p,async()=>null,undefined,undefined,undefined,request,undefined,undefined,async args=>{
  reads++;return {...calendarWindow(args.month??'2026-10','America/Denver'),asOf:Date.UTC(2026,9,1,12),categoryId:args.category??null,items:[],cursor:args.cursor,nextCursor:null};
 });
 expect(reads).toBe(2);expect(validateCanonicalData(tree,scope,p,envelope,request)).toEqual(envelope);
 expect(()=>validateCanonicalData(tree,scope,p,envelope)).toThrow();
 const bad=structuredClone(envelope);if(bad.dataByBlock.one.resolver!=='events.list')throw Error('Fixture');bad.dataByBlock.one.data.categoryId='another';expect(()=>validateCanonicalData(tree,scope,p,bad,request)).toThrow();
 for(const raw of ['{"month":"2026-09","category":"private"}','{"month":"2026-13"}','null'])expect(()=>planCanonicalData(tree,scope,p,{one:raw})).toThrow();
});
