import {useEffect,useRef,useState} from "react";
import {useMutation,usePaginatedQuery,useQuery} from "convex/react";
import {api} from "@backend/convex/_generated/api";
import type {Id} from "@backend/convex/_generated/dataModel";
import {Button} from "@/components/ui/button";
import {getErrorMessage} from "@/lib/utils";

type Selection={id:Id<"event_rsvp_entries">;name:string;revision:number};
export function EventAttendees({eventId}:{eventId:Id<"extension_events">}){
 const [filter,setFilter]=useState<"confirmed"|"cancelled">("confirmed");
 const {results,status,loadMore}=usePaginatedQuery(api.extensions.events.rsvpOrganizer.list,{eventId,status:filter},{initialNumItems:25});
 const summary=useQuery(api.extensions.events.rsvpOrganizer.summary,{eventId});
 const cancel=useMutation(api.extensions.events.rsvpOrganizer.cancel);
 const [selected,setSelected]=useState<Selection|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const pending=useRef<{id:string;revision:number;key:string}|null>(null),inFlight=useRef(false),active=useRef(true);
 const confirmButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(selected)confirmButton.current?.focus();},[selected]);
 const current=selected?results.find(row=>row.id===selected.id):null;
 const changed=!!selected&&(!current||current.revision!==selected.revision||current.status!=="confirmed");
 const submit=async()=>{
  if(!selected||changed||inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");
  if(pending.current?.id!==selected.id||pending.current.revision!==selected.revision)pending.current={id:selected.id,revision:selected.revision,key:crypto.randomUUID()};
  try{
   await cancel({eventId,entryId:selected.id,expectedRevision:selected.revision,requestKey:pending.current.key});
   if(active.current){setSelected(null);pending.current=null;}
  }catch(cause){if(active.current)setError(getErrorMessage(cause,"The cancellation could not be confirmed. Review the current registration before trying again."));}
  finally{inFlight.current=false;if(active.current)setBusy(false);}
 };
 return <section aria-labelledby="event-attendees-title" className="overflow-hidden rounded-lg border bg-card">
  <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5"><div><h2 id="event-attendees-title" className="font-semibold">Attendees</h2><p className="mt-1 text-sm text-muted-foreground" role="status">{summary?`${summary.confirmed.toLocaleString()} confirmed${summary.capacity===null?"":` · ${summary.capacity.toLocaleString()} places total`}`:"Loading attendance…"}</p></div>
   <div className="flex gap-2" role="group" aria-label="Registration status">{(["confirmed","cancelled"] as const).map(value=><Button key={value} type="button" size="sm" variant={value===filter?"default":"outline"} aria-pressed={value===filter} disabled={busy} onClick={()=>{setFilter(value);setSelected(null);setError("");}}>{value==="confirmed"?"Confirmed":"Cancelled"}</Button>)}</div>
  </div>
  {selected&&<div className="space-y-3 border-b bg-muted/30 p-5" role="group" aria-label="Cancel attendee registration"><p className="text-sm">Cancel the reservation for <strong>{selected.name}</strong>? This releases one place. The attendee’s website status will update; no email is sent.</p>{changed&&<p role="status" className="text-sm">This registration changed. Close this panel and review its current status.</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap gap-2"><Button ref={confirmButton} type="button" variant="destructive" disabled={busy||changed} onClick={()=>void submit()}>{busy?"Cancelling…":"Confirm attendee cancellation"}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{setSelected(null);setError("");}}>{changed?"Close":"Keep registration"}</Button></div></div>}
  <ul className="divide-y">{results.map(row=><li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="break-words font-medium">{row.name}</p><p className="break-all text-sm text-muted-foreground">{row.email}</p><p className="mt-1 text-xs text-muted-foreground">{row.status==="confirmed"?"Registered":"Cancelled"} · {new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(row.updatedAt)}</p></div>{row.status==="confirmed"&&<Button type="button" variant="outline" size="sm" disabled={busy} aria-label={`Cancel registration for ${row.name}`} onClick={()=>{setSelected({id:row.id,name:row.name,revision:row.revision});setError("");}}>Cancel registration</Button>}</li>)}</ul>
  {status==="LoadingFirstPage"?<p role="status" className="p-5 text-sm text-muted-foreground">Loading registrations…</p>:!results.length&&<p className="p-5 text-sm text-muted-foreground">{filter==="confirmed"?"No confirmed registrations yet. Add an Event RSVP block to a published page to invite visitors.":"No cancelled registrations."}</p>}
  {(status==="CanLoadMore"||status==="LoadingMore")&&<div className="border-t p-5"><Button type="button" variant="outline" disabled={status==="LoadingMore"||busy} onClick={()=>loadMore(25)}>{status==="LoadingMore"?"Loading…":"Load more attendees"}</Button></div>}
 </section>;
}
