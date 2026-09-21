import {localEventDate as localDate,rsvpDraft,rsvpSettings} from "./rsvp-settings";
import {EventAttendees} from "./EventAttendees";
import {getErrorMessage} from "@/lib/utils";
import {useUnsavedChangesWarning} from "@/hooks/useUnsavedChangesWarning";
import {EventCategorySelect} from "./EventCategorySelect";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
type EventStatus = "draft" | "published" | "cancelled" | "archived";
function fresh() { const start = Date.now() + 86_400_000; return { ...rsvpDraft(), title: "", slug: "", description: "", starts: localDate(start), ends: localDate(start + 3_600_000), timeZone: browserZone(), venue: "", venueAddress: "", registrationUrl: "", categoryId:"", status: "draft" as EventStatus }; }
export function EventEditor({ id }: { id?: Id<"extension_events"> }) {
  const row = useQuery(api.extensions.events.queries.get, id ? { id } : "skip");
  const create = useMutation(api.extensions.events.mutations.create); const update = useMutation(api.extensions.events.mutations.update);
  const navigate = useNavigate(); const [values, setValues] = useState(fresh); const [base, setBase] = useState<number | null>(null); const [saving, setSaving] = useState(false);
  const [baseline,setBaseline]=useState(()=>JSON.stringify(values));
  useUnsavedChangesWarning({isDirty:JSON.stringify(values)!==baseline,enabled:!saving});
  const seed = () => { if (!row) return; const next={ ...rsvpDraft(row.rsvp), title: row.title, slug: row.slug, description: row.description, starts: localDate(row.startsAt), ends: localDate(row.endsAt), timeZone: row.timeZone, venue: row.venue, venueAddress: row.venueAddress, registrationUrl: row.registrationUrl ?? "", categoryId:row.categoryId??"", status: row.status };setValues(next);setBaseline(JSON.stringify(next)); setBase(row.updatedAt); };
  useEffect(() => { if (row && base === null) seed(); }, [row, base]);
  const conflict = !!row && base !== null && row.updatedAt !== base;
  const set = (key: keyof typeof values, value: string) => setValues(current => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      const { starts, ends, status, categoryId, rsvpMode, rsvpCapacity, rsvpCloses, ...fields } = values; const startsAt=new Date(starts).getTime(); const rsvp=rsvpSettings({rsvpMode,rsvpCapacity,rsvpCloses},startsAt,fields.registrationUrl); const args = { ...fields, rsvp, categoryId:categoryId?categoryId as Id<"extension_event_categories">:null, startsAt, endsAt: new Date(ends).getTime(), registrationUrl: fields.registrationUrl || undefined };
      if (id && base === null) throw new Error("Reload the event before saving.");
      if (id && base !== null) await update({ id, expectedUpdatedAt: base, ...args, status });
      else await create(args);
      toast.success(id ? "Event saved." : "Event draft created."); await navigate({ to: "/events" });
    } catch (error) { toast.error(getErrorMessage(error, "Could not save the event.")); }
    finally { setSaving(false); }
  };
  if (id && row === undefined) return <p role="status">Loading event…</p>;
  if (id && row === null) return <p>Event not found. <Link to="/events">Back to events</Link></p>;
  return <div className="max-w-4xl space-y-5"><PageHeader title={id ? "Edit event" : "Add event"} meta={["Publish the details guests need before attending."]} actions={<Button disabled={saving || conflict || (!!id && base === null)} onClick={() => void save()}>{saving ? "Saving…" : id ? "Save event" : "Save draft"}</Button>} />
  {conflict && <div role="alert" className="rounded-lg border p-4">This event changed in another editor. <Button variant="outline" size="sm" onClick={seed}>Reload current event</Button></div>}
  <fieldset disabled={saving} className="grid gap-5 rounded-lg border bg-card p-5 sm:grid-cols-2">
    {([['title','Title'],['slug','URL slug'],['venue','Venue'],['venueAddress','Address']] as const).map(([key,label]) => <div key={key} className="space-y-2"><Label htmlFor={`event-${key}`}>{label}</Label><Input id={`event-${key}`} value={values[key]} onChange={e=>set(key,e.target.value)} /></div>)}
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="event-description">Description</Label><Textarea id="event-description" rows={8} value={values.description} onChange={e=>set('description',e.target.value)} /></div>
    {([['starts','Starts'],['ends','Ends']] as const).map(([key,label]) => <div key={key} className="space-y-2"><Label htmlFor={`event-${key}`}>{label} ({browserZone()})</Label><Input id={`event-${key}`} type="datetime-local" value={values[key]} onChange={e=>set(key,e.target.value)} /></div>)}
    <div className="space-y-2"><Label htmlFor="event-zone">Display time zone</Label><Input id="event-zone" value={values.timeZone} onChange={e=>set('timeZone',e.target.value)} placeholder="America/Denver" /><p className="text-xs text-muted-foreground">Start and end are entered in your local time. Guests see them in this zone.</p></div>
    <div className="space-y-2"><Label htmlFor="event-registration">Registration link (optional)</Label><Input id="event-registration" type="url" value={values.registrationUrl} onChange={e=>set('registrationUrl',e.target.value)} /></div>
    <div className="space-y-4 rounded-lg border p-4 sm:col-span-2"><div><h2 className="font-semibold">Website RSVPs</h2><p className="mt-1 text-sm text-muted-foreground">Collect registrations using an Event RSVP block on a published page. Enable this event plugin and Forms for that page.</p></div>
      <div className="space-y-2"><Label htmlFor="event-rsvp-mode">Who can register</Label><Select items={{closed:"Website RSVPs disabled",guests:"Guests and signed-in visitors",signedIn:"Signed-in visitors only"}} value={values.rsvpMode} onValueChange={value=>{if(value==="closed"||value==="guests"||value==="signedIn")setValues(current=>({...current,rsvpMode:value}));}}><SelectTrigger id="event-rsvp-mode" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="closed">Website RSVPs disabled</SelectItem><SelectItem value="guests">Guests and signed-in visitors</SelectItem><SelectItem value="signedIn">Signed-in visitors only</SelectItem></SelectContent></Select></div>
      {values.rsvpMode!=="closed"&&<><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="event-rsvp-capacity">Capacity (optional)</Label><Input id="event-rsvp-capacity" type="number" min={1} max={1000000} step={1} value={values.rsvpCapacity} onChange={event=>set("rsvpCapacity",event.target.value)} placeholder="No limit"/><p className="text-xs text-muted-foreground">Each registration reserves one place. A cancellation releases it.</p></div><div className="space-y-2"><Label htmlFor="event-rsvp-closes">Registration closes ({browserZone()})</Label><Input id="event-rsvp-closes" type="datetime-local" value={values.rsvpCloses} max={values.starts} onChange={event=>set("rsvpCloses",event.target.value)}/><p className="text-xs text-muted-foreground">Leave blank to close when the event starts.</p></div></div><p className="text-xs text-muted-foreground">Guest registrations are remembered in that browser. Signed-in registrations follow the account. Visitors can cancel before the event starts.</p>{values.registrationUrl.trim()&&<p role="alert" className="text-sm text-destructive">Remove the external registration link to use website RSVPs.</p>}</>}
    </div>
    <EventCategorySelect value={values.categoryId} onChange={value=>set("categoryId",value)}/>
    {id && <div className="space-y-2"><Label htmlFor="event-status">Status</Label><Select value={values.status} onValueChange={value=>{ if (value === 'draft' || value === 'published' || value === 'cancelled' || value === 'archived') setValues(current=>({...current,status:value})); }}><SelectTrigger id="event-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{['draft','published','cancelled','archived'].map(status=><SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>}
  </fieldset>{id&&<EventAttendees key={id} eventId={id}/>}</div>;
}
