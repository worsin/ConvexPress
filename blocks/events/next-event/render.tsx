// Normalize ICU date-range spacing so server and browser text hydrate identically.
import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/events.css';
const date=(value:number,zone:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en',{...options,timeZone:zone}).format(value);
export default defineDataBlock('events/next-event','events.next',({data})=>{
 const event=data.event;
 if(!event)return <div className="cp-events-empty"><P.Text tone="muted">Our next gathering is taking shape. Check back for a new date.</P.Text><P.Link href="/events" label="Explore all events →"/></div>;
 return <div className="cp-next-event-shell"><article className="cp-next-event">
  <div className="cp-next-event-date" aria-hidden="true"><P.Text size="sm">{date(event.startsAt,event.timeZone,{weekday:'long'})}</P.Text><strong>{date(event.startsAt,event.timeZone,{day:'2-digit'})}</strong><P.Text>{date(event.startsAt,event.timeZone,{month:'long',year:'numeric'})}</P.Text></div>
  <P.Stack gap="md"><P.Text size="sm" tone="muted">Coming up</P.Text><P.Heading level={2} size="lg">{event.title}</P.Heading>
   <P.Text size="sm" tone="muted"><time dateTime={new Date(event.startsAt).toISOString()}>{new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:event.timeZone}).formatRange(event.startsAt,event.endsAt).replace(/[\u00a0\u2009\u202f]/gu,' ')}</time></P.Text>
   {event.venue&&<P.Text>{event.venue}</P.Text>}{event.description&&<P.Text>{event.description}</P.Text>}
   <div className="cp-events-all"><P.Link href={event.href} label="Event details →"/></div>
  </P.Stack>
 </article></div>;
});
