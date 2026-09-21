import {test,expect} from 'bun:test';
import {calendarArgsSchema,calendarResultSchema,calendarMatchesArgs,calendarWindow,calendarDays,calendarMonthAt,shiftCalendarMonth,eventOverlapsWindow,calendarHref,parseCalendarNavigation} from './calendarContracts';
import {parseBlockPageSearch} from './postGridContracts';
const hour=3_600_000;
test('civil month boundaries account for Denver spring and fall transitions',()=>{
 const spring=calendarWindow('2026-03','America/Denver'),fall=calendarWindow('2026-11','America/Denver');
 expect(spring.startsAt).toBe(Date.parse('2026-03-01T07:00:00Z'));expect(spring.endsAt).toBe(Date.parse('2026-04-01T06:00:00Z'));
 expect((spring.endsAt-spring.startsAt)/hour).toBe(31*24-1);expect((fall.endsAt-fall.startsAt)/hour).toBe(30*24+1);
 const a=calendarDays('2026-03','America/Denver')[7]!,b=calendarDays('2026-11','America/Denver')[0]!;
 expect((a.endsAt-a.startsAt)/hour).toBe(23);expect((b.endsAt-b.startsAt)/hour).toBe(25);
});
test('non-hour offsets, midnight transitions and skipped dates do not invent days',()=>{
 expect(calendarWindow('2026-09','Asia/Kathmandu').startsAt).toBe(Date.parse('2026-08-31T18:15:00Z'));
 const midnight=calendarDays('2018-11','America/Sao_Paulo')[3]!;expect(midnight.startsAt).toBe(Date.parse('2018-11-04T03:00:00Z'));expect((midnight.endsAt-midnight.startsAt)/hour).toBe(23);
 const skipped=calendarDays('2011-12','Pacific/Apia')[29]!;expect(skipped.endsAt).toBe(skipped.startsAt);expect(eventOverlapsWindow({startsAt:0,endsAt:Date.now()},skipped)).toBe(false);
 const half=calendarDays('2026-10','Australia/Lord_Howe')[3]!;expect((half.endsAt-half.startsAt)/hour).toBe(23.5);
});
test('civil labels, leap years and year navigation ignore machine timezone',()=>{
 expect(calendarMonthAt(Date.parse('2026-10-01T01:00:00Z'),'America/Denver')).toBe('2026-09');
 expect(calendarDays('2028-02','UTC')).toHaveLength(29);expect(calendarDays('2026-02','UTC')).toHaveLength(28);
 expect(shiftCalendarMonth('2026-12',1)).toBe('2027-01');expect(shiftCalendarMonth('2026-01',-1)).toBe('2025-12');expect(shiftCalendarMonth('1970-01',-1)).toBe(null);expect(shiftCalendarMonth('9998-12',1)).toBe(null);
 for(const month of ['2026-00','2026-13','2026-9','1969-12','9999-01'])expect(()=>calendarWindow(month,'UTC')).toThrow();expect(()=>calendarWindow('2026-09','Not/AZone')).toThrow();
});
const window=calendarWindow('2026-09','America/Denver');
const card={id:'event',title:'A gathering',href:'/events/gathering',description:null,startsAt:window.startsAt-2*hour,endsAt:window.startsAt+hour,timeZone:'America/Denver',venue:'Workroom'};
const result={...window,asOf:window.startsAt+hour,categoryId:null,items:[card],cursor:null,nextCursor:null};
test('calendar includes overlap, excludes exclusive boundaries and private payloads',()=>{
 expect(calendarResultSchema.parse(result)).toEqual(result);
 for(const items of [[{...card,endsAt:window.startsAt}],[{...card,startsAt:window.endsAt,endsAt:window.endsAt+hour}],[card,card],[{...card,privateNotes:'secret'}]])expect(calendarResultSchema.safeParse({...result,items}).success).toBe(false);
 expect(calendarResultSchema.safeParse({...result,startsAt:window.startsAt+hour}).success).toBe(false);expect(calendarResultSchema.safeParse({...result,cursor:'same',nextCursor:'same'}).success).toBe(false);
 expect(calendarMatchesArgs(calendarArgsSchema.parse({}),result)).toBe(true);
 for(const args of [{month:'2026-10'},{category:'other'},{timeZone:'UTC'},{month:'2026-09',cursor:'other'}])expect(calendarMatchesArgs(calendarArgsSchema.parse(args),result)).toBe(false);
 expect(calendarArgsSchema.safeParse({cursor:'no-month'}).success).toBe(false);expect(calendarArgsSchema.safeParse({status:'draft'}).success).toBe(false);
});
test('month links preserve other blocks and reset only their own cursor',()=>{
 const first=calendarHref('/page/events/?view=quiet#calendar','calendar-a','2026-09','opaque+/=');const second=calendarHref(first,'calendar-b','2026-10');const url=new URL(calendarHref(second,'calendar-a','2026-11'),'https://example.invalid');
 expect(url.pathname).toBe('/page/events/');expect(url.searchParams.get('view')).toBe('quiet');expect(url.hash).toBe('#calendar');
 const state=parseBlockPageSearch(url.searchParams.get('blockPages'));expect(parseCalendarNavigation(state['calendar-a']!)).toEqual({month:'2026-11',cursor:null});expect(parseCalendarNavigation(state['calendar-b']!)).toEqual({month:'2026-10',cursor:null});
 for(const raw of ['null','[]','{"month":"2026-09","status":"draft"}','{"month":"2026-13"}'])expect(()=>parseCalendarNavigation(raw)).toThrow();
 expect(()=>calendarHref('//outside.invalid','calendar-a','2026-09')).toThrow();expect(()=>calendarHref('/events','__proto__','2026-09')).toThrow();
});
