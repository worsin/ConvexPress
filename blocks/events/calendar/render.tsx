// Normalize ICU date-range spacing so server and browser text hydrate identically.
import {useState} from 'react';
import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import {useBlockPageHref} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/pagination';
import {calendarDays,calendarMonthAt,shiftCalendarMonth,eventOverlapsWindow} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/calendarContracts';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/calendar.css';
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export default defineDataBlock('events/calendar','events.list',({attrs,data,blockId})=>{
 const [display,setDisplay]=useState({authored:attrs.view,selected:attrs.view}),pageHref=useBlockPageHref(blockId);
 // Apply author edits and undo without discarding visitor choice on data refresh.
 if(display.authored!==attrs.view)setDisplay({authored:attrs.view,selected:attrs.view});
 const view=display.authored===attrs.view?display.selected:attrs.view;
 const setView=(selected:'month'|'agenda')=>setDisplay({authored:attrs.view,selected});
 const href=(month:string|null,cursor:string|null=null)=>month?pageHref(JSON.stringify({month,cursor})):null;
 const label=new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:data.timeZone}).format(data.startsAt);
 const days=calendarDays(data.month,data.timeZone),leading=days[0]!.weekday;
 const cells=[...Array.from({length:leading},()=>null),...days];while(cells.length%7)cells.push(null);
 const previous=href(shiftCalendarMonth(data.month,-1)),next=href(shiftCalendarMonth(data.month,1)),today=href(calendarMonthAt(data.asOf,data.timeZone));
 const dateFormat=new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:data.timeZone,timeZoneName:'short'});
 const more=data.nextCursor?href(data.month,data.nextCursor):null,first=data.cursor?href(data.month):null;
 return <section className="cp-calendar" aria-label={`${label} event calendar`}>
  <header className="cp-calendar-header"><div><P.Text size="sm" tone="muted">Make a little time</P.Text><P.Heading level={2} size="lg">{label}</P.Heading><P.Text size="sm" tone="muted">Times shown in {data.timeZone}</P.Text></div>
   <nav aria-label="Calendar month navigation" className="cp-calendar-month-actions">{previous&&<P.Link href={previous} label="← Previous month"/>}{today&&<P.Link href={today} label="Today"/>}{next&&<P.Link href={next} label="Next month →"/>}</nav>
  </header>
  <div className="cp-calendar-toolbar"><div className="cp-calendar-view" role="group" aria-label="Calendar display"><button type="button" aria-pressed={view==='month'} onClick={()=>setView('month')}>Month</button><button type="button" aria-pressed={view==='agenda'} onClick={()=>setView('agenda')}>Agenda</button></div>
   <P.Text size="sm" tone="muted">{data.items.length} {data.items.length===1?'event':'events'} on this page{data.nextCursor?' · More this month':''}</P.Text></div>
  {view==='month'?<div className="cp-calendar-month"><table><caption className="cp-calendar-sr">{label}. This calendar shows the events on the current page.{data.nextCursor?' More events are available below.':''}</caption>
   <thead><tr>{weekdays.map(day=><th scope="col" key={day}><abbr title={day}>{day.slice(0,3)}</abbr></th>)}</tr></thead>
   <tbody>{Array.from({length:cells.length/7},(_,week)=><tr key={week}>{cells.slice(week*7,week*7+7).map((day,index)=><td key={day?.date??`blank-${index}`} className={day?'':'cp-calendar-blank'}>{day&&<><time className="cp-calendar-day" dateTime={day.date}>{day.day}</time><ul>{data.items.filter(event=>eventOverlapsWindow(event,day)).map(event=><li key={event.id}><P.Link href={event.href} label={event.title}/></li>)}</ul></>}</td>)}</tr>)}</tbody>
  </table><ol className="cp-calendar-compact-events" aria-label="Events on this calendar page">{data.items.map(event=><li key={event.id}><P.Link href={event.href} label={event.title}/><P.Text size="sm" tone="muted">{dateFormat.formatRange(event.startsAt,event.endsAt).replace(/[\u00a0\u2009\u202f]/gu,' ')}</P.Text></li>)}</ol></div>:<div className="cp-calendar-agenda">{data.items.map(event=><article key={event.id}><div className="cp-calendar-agenda-date"><P.Text size="sm" tone="muted">{event.startsAt<data.startsAt?'Continues into this month':new Intl.DateTimeFormat('en',{weekday:'long',timeZone:data.timeZone}).format(event.startsAt)}</P.Text><P.Text>{dateFormat.formatRange(event.startsAt,event.endsAt).replace(/[\u00a0\u2009\u202f]/gu,' ')}</P.Text></div><div><P.Heading level={3} size="md"><P.Link href={event.href} label={event.title}/></P.Heading>{event.venue&&<P.Text size="sm" tone="muted">{event.venue}</P.Text>}{event.description&&<P.Text>{event.description}</P.Text>}</div></article>)}</div>}
  {!data.items.length&&<div className="cp-calendar-empty"><P.Text>{data.nextCursor?'No accessible events on this page. Continue to browse this month.':data.cursor?'You’ve reached the end of this month’s events.':'A little room for something new. No events are scheduled for these filters this month.'}</P.Text></div>}
  {(data.cursor||data.nextCursor)&&<nav className="cp-calendar-paging" aria-label="Calendar event pages">{first&&<P.Link href={first} label="First events this month"/>}{more&&<P.Link href={more} label="More events this month →"/>}</nav>}
 </section>;
});
