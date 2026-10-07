// Normalize ICU date-range spacing so server and browser text hydrate identically.
import {defineDataBlock} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model';
import * as P from '../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives';
import {Intro} from '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation';
import '../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/events.css';
const format=(at:number,timeZone:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en',{...options,timeZone}).format(at);
export default defineDataBlock('events/upcoming','events.upcoming',({attrs,data})=><div className="cp-upcoming-events">
 <P.Stack gap="lg">
  <Intro heading={attrs.heading} body={attrs.intro}/>
  {data.items.length?<>
   <div className="cp-event-list">{data.items.map(event=><article key={event.id} className="cp-event-row">
    <div className="cp-event-date" aria-hidden="true"><span>{format(event.startsAt,event.timeZone,{month:'short'})}</span><strong>{format(event.startsAt,event.timeZone,{day:'2-digit'})}</strong></div>
    <P.Stack gap="md">
     <P.Text size="sm" tone="muted"><time dateTime={new Date(event.startsAt).toISOString()}>{format(event.startsAt,event.timeZone,{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</time></P.Text>
     <P.Heading level={3} size="md"><P.Link href={event.href} label={event.title}/></P.Heading>
     <div className="cp-event-details"><P.Text size="sm" tone="muted">
      {new Intl.DateTimeFormat('en',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:event.timeZone}).formatRange(event.startsAt,event.endsAt).replace(/[\u00a0\u2009\u202f]/gu,' ')}
     </P.Text>{event.venue&&<P.Text size="sm" tone="muted">{event.venue}</P.Text>}</div>
     {attrs.showDescription&&event.description&&<P.Text>{event.description}</P.Text>}
    </P.Stack>
   </article>)}</div>
   <div className="cp-events-all"><P.Link href="/events" label="Explore all events →"/></div>
  </>:<div className="cp-events-empty"><P.Text tone="muted">{attrs.emptyText}</P.Text></div>}
 </P.Stack>
</div>);
