import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { fieldGuideAttrsSchema } from './schema';
import { FieldGuideView } from './View';
import { upcomingEventsAttrsSchema } from '../upcoming-events/schema';
import { UpcomingEventsView } from '../upcoming-events/View';

test('field reference validates portable values, rejects active links and bounds repeaters', () => {
 const attrs=fieldGuideAttrsSchema.parse({heading:'<script>Authored</script>',body:'Body',count:1,link:{label:'Read',href:'/story',newTab:true},items:[{label:'One',value:'First'},{label:'Two',value:'Second'}]});
 expect(JSON.parse(JSON.stringify(attrs))).toEqual(attrs);
 expect(fieldGuideAttrsSchema.safeParse({link:{href:'javascript:alert(1)'}}).success).toBe(false);
 expect(fieldGuideAttrsSchema.safeParse({count:13}).success).toBe(false);
 expect(fieldGuideAttrsSchema.safeParse({items:Array.from({length:13},()=>({label:'x',value:'y'}))}).success).toBe(false);
 const html=renderToStaticMarkup(<FieldGuideView attrs={attrs}/>);
 expect(html).toContain('&lt;script&gt;Authored&lt;/script&gt;');
 expect(html).toContain('noopener noreferrer');
 expect(html).toContain('First');
 expect(html.includes('Second')).toBe(false);
});
test('nullable overrides and detail toggles preserve meaningful empty versus inherited values',()=>{
 const attrs=fieldGuideAttrsSchema.parse({body:'Hidden body',note:'',showDetails:false});
 expect(attrs.note).toBe('');
 expect(fieldGuideAttrsSchema.parse({}).note).toBeNull();
 expect(renderToStaticMarkup(<FieldGuideView attrs={attrs}/>).includes('Hidden body')).toBe(false);
});
test('live event reference renders loading, authored empty state, current DTO and cancellation',()=>{
 const attrs=upcomingEventsAttrsSchema.parse({emptyText:'No dates this season.'});
 expect(renderToStaticMarkup(<UpcomingEventsView attrs={attrs} events={undefined}/>)).toContain('Loading events');
 expect(renderToStaticMarkup(<UpcomingEventsView attrs={attrs} events={[]}/>)).toContain('No dates this season.');
 const event={_id:'event',title:'Authored walk',slug:'trail-walk',description:'An authored description.',startsAt:Date.UTC(2026,8,8,12),endsAt:Date.UTC(2026,8,8,14),timeZone:'UTC',venue:'Trailhead',venueAddress:'',registrationUrl:null,status:'cancelled' as const};
 const html=renderToStaticMarkup(<UpcomingEventsView attrs={attrs} events={[event]}/>);
 expect(html).toContain('Authored walk');expect(html).toContain('/events/trail-walk');expect(html).toContain('Cancelled');
 expect(upcomingEventsAttrsSchema.safeParse({count:0}).success).toBe(false);
});
