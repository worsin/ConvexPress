import {test,expect} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import upcoming from '../../../../../../../blocks/events/upcoming/render';
import {prepareBlocks} from './model';
import {resolveCanonicalData} from '../block-data/portable/resolve';
import {createDemoContentPageHost} from '../block-data/demo-channel';

// Node and browser ICU versions use different spaces in the same date range.
// Only that platform boundary is varied; both passes render the real blocks.
function renderAcrossRangeSpacing(render:()=>string){
 const original=Intl.DateTimeFormat.prototype.formatRange;
 try{
  const output=[' ', '\u2009', '\u202f'].map(space=>{
   Intl.DateTimeFormat.prototype.formatRange=function(start,end){return original.call(this,start,end).replace(/[\u0020\u00a0\u2009\u202f]/gu,space);};
   return render();
  });
  expect(output[1]).toBe(output[0]);expect(output[2]).toBe(output[0]);
  return output[0]!;
 }finally{Intl.DateTimeFormat.prototype.formatRange=original;}
}
const policy={enabledPlugins:['events'],capabilities:[],disabledBlocks:[]};
const current={scope:{websiteKey:'site',instanceKey:'stage'},documentKey:'page',revision:'1',viewerKey:'public'};
const event={id:'gathering',title:'Clay & <script>care</script>',href:'/events/clay',description:'Bring <b>curiosity</b>.',startsAt:Date.UTC(2026,10,1,5,30),endsAt:Date.UTC(2026,10,1,10),timeZone:'America/Denver',venue:'The workroom'};
test('events render authored values with local date badges, DST-aware times, escaped text and exact links',async()=>{
 const tree=[{id:'upcoming',name:'events/upcoming',version:1,attrs:{heading:'Gather at the house'}}];
 const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,undefined,{},async()=>({asOf:event.startsAt-100,items:[event]}));
 const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});
 const render=()=>renderToStaticMarkup(prepareBlocks(tree,{'events/upcoming':upcoming},policy,{media:{}},{grant,current}));
 const html=renderAcrossRangeSpacing(render);
 for(const text of ['Gather at the house','&lt;script&gt;care&lt;/script&gt;','&lt;b&gt;curiosity&lt;/b&gt;','Oct','31','The workroom','href="/events/clay"','href="/events"','MDT','MST'])expect(html).toContain(text);
 expect(html).not.toContain('<script>');expect(html).not.toContain('<b>');
 host.invalidate();expect(render).toThrow();
});
test('events respect plugin disablement, omitted descriptions and the authored empty message',async()=>{
 const tree=[{id:'upcoming',name:'events/upcoming',version:1,attrs:{showDescription:false,emptyText:'Our next gathering is taking shape.'}}];
 expect(()=>prepareBlocks(tree,{'events/upcoming':upcoming},{...policy,enabledPlugins:[]})).toThrow();
 for(const items of [[],[{...event,description:null}]]){
  const envelope=await resolveCanonicalData(tree,current.scope,policy,async()=>null,undefined,undefined,undefined,{},async()=>({asOf:event.startsAt-100,items}));
  const grant=createDemoContentPageHost().install({tree,context:current,policy,envelope});
  const html=renderToStaticMarkup(prepareBlocks(tree,{'events/upcoming':upcoming},policy,{media:{}},{grant,current}));
  expect(html).not.toContain('curiosity');if(!items.length){expect(html).toContain('Our next gathering is taking shape.');expect(html).not.toContain('<article');}
 }
});
import next from '../../../../../../../blocks/events/next-event/render';
test('Next Event renders exact guest details and keeps category-empty state honest',async()=>{
 const nextPolicy={...policy,capabilities:['reference.targetResolution']};
 for(const value of [event,null]){
  const tree=[{id:'next',name:'events/next-event',version:1,attrs:{category:'category'}}];
  const envelope=await resolveCanonicalData(tree,current.scope,nextPolicy,async()=>null,undefined,undefined,undefined,{},undefined,async()=>({asOf:50,categoryId:'category',event:value}));
  const host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy:nextPolicy,envelope});
  const html=renderAcrossRangeSpacing(()=>renderToStaticMarkup(prepareBlocks(tree,{'events/next-event':next},nextPolicy,{media:{}},{grant,current})));
  if(value){for(const text of ['Coming up','&lt;script&gt;care&lt;/script&gt;','The workroom','href="/events/clay"','Event details','MDT','MST'])expect(html).toContain(text);expect(html).not.toContain('<script>');}
  else {expect(html).toContain('Our next gathering is taking shape');expect(html).not.toContain('Coming up');expect(html).not.toContain('Clay');}
 }
});
import calendar from '../../../../../../../blocks/events/calendar/render';
import {calendarWindow} from '../block-data/portable/calendarContracts';
import {BlockPaginationProvider} from './pagination';
test('Calendar month and agenda preserve timezone dates, escaped source and page navigation',async()=>{
 const p={...policy,capabilities:['reference.targetResolution']},window=calendarWindow('2026-11','America/Denver');
 for(const view of ['month','agenda']){
  const tree=[{id:'calendar',name:'events/calendar',version:1,attrs:{view,timeZone:'America/Denver'}}];
  const request={calendar:JSON.stringify({month:'2026-11',cursor:null})},context={...current,request};
  const envelope=await resolveCanonicalData(tree,current.scope,p,async()=>null,undefined,undefined,undefined,request,undefined,undefined,async()=>({...window,asOf:window.startsAt+1,categoryId:null,items:[event],cursor:null,nextCursor:'more-events'}));
  const grant=createDemoContentPageHost().install({tree,context,policy:p,envelope});
  const html=renderAcrossRangeSpacing(()=>renderToStaticMarkup(<BlockPaginationProvider href="/page/events/?keep=yes#events">{prepareBlocks(tree,{'events/calendar':calendar},p,{media:{}},{grant,current:context})}</BlockPaginationProvider>));
  for(const value of ['November 2026','America/Denver','&lt;script&gt;care&lt;/script&gt;','href="/events/clay"','More events this month','keep=yes','blockPages='])expect(html).toContain(value);
  expect(html).not.toContain('<script>');if(view==='agenda'){expect(html).toContain('MDT');expect(html).toContain('MST');expect(html).toContain('Continues into this month');}
 }
});
test('Calendar does not call a partial or exhausted page an empty month',async()=>{
 const p={...policy,capabilities:['reference.targetResolution']},window=calendarWindow('2026-11','UTC');
 for(const nextCursor of ['more',null]){
  const tree=[{id:'calendar',name:'events/calendar',version:1,attrs:{view:'agenda'}}],request={calendar:JSON.stringify({month:'2026-11',cursor:null})},context={...current,request};
  const envelope=await resolveCanonicalData(tree,current.scope,p,async()=>null,undefined,undefined,undefined,request,undefined,undefined,async()=>({...window,asOf:window.startsAt,categoryId:null,items:[],cursor:null,nextCursor}));
  const grant=createDemoContentPageHost().install({tree,context,policy:p,envelope});const html=renderToStaticMarkup(prepareBlocks(tree,{'events/calendar':calendar},p,{media:{}},{grant,current:context}));
  expect(html).toContain(nextCursor?'Continue to browse this month':'No events are scheduled');
 }
});
