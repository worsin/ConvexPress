import {useEffect,useState} from "react";
import {useConvex,useMutation,useQuery} from "convex/react";
import {api} from "@backend/convex/_generated/api";
import type {Id} from "@backend/convex/_generated/dataModel";
import {useAuth} from "@/lib/auth-context";
import {useUnsavedChangesWarning} from "@/hooks/useUnsavedChangesWarning";
import {Button} from "@/components/ui/button";
type Fields={name:string;description:string;consentText:string;privacyUrl:string;status:"draft"|"active"|"archived"};
type List=Fields&{id:Id<"mailingLists">;revision:number;updatedAt:number};
const blank:Fields={name:"",description:"",consentText:"",privacyUrl:"",status:"draft"};
const input="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";
export function AudienceManager(){const {can,isLoading}=useAuth(),client=useConvex();if(isLoading)return <p role="status">Loading audience…</p>;if(!can("manage_options"))return <p role="alert">You do not have permission to manage this website’s audience.</p>;return <Manager key={client.url}/>;}
function Manager(){
 const [cursors,setCursors]=useState<(string|null)[]>([null]),[selected,setSelected]=useState<Id<"mailingLists">|"new"|null>(null),[dirty,setDirty]=useState(false);
 const lists=useQuery(api.audiences.lists.list,{paginationOpts:{numItems:20,cursor:cursors.at(-1)??null}});
 const selectedList=useQuery(api.audiences.lists.get,selected&&selected!=="new"?{listId:selected}:"skip");
 useUnsavedChangesWarning({isDirty:dirty,enabled:true});
 return <div className="space-y-6 p-6" aria-label="Mailing lists">
  <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Mailing lists</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Organize this website’s audience and the consent people give when joining. List management does not send emails.</p></div><Button disabled={dirty} onClick={()=>setSelected("new")}>New mailing list</Button></header>
  <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)]">
   <section className="min-w-0 rounded-lg border border-border" aria-label="Website mailing lists"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-4">List</th><th className="p-4">Status</th><th className="p-4"><span className="sr-only">Actions</span></th></tr></thead><tbody>{lists?.page.map(list=><tr key={list.id} className="border-b border-border last:border-0"><td className="p-4 font-medium">{list.name}</td><td className="p-4 capitalize">{list.status}</td><td className="p-4"><Button variant="outline" size="sm" disabled={dirty} aria-label={`Edit ${list.name}`} onClick={()=>setSelected(list.id)}>Edit</Button></td></tr>)}</tbody></table></div>
    {!lists?<p className="p-4 text-sm" role="status">Loading lists…</p>:!lists.page.length?<p className="p-4 text-sm text-muted-foreground">No mailing lists yet. Create one to define its name, consent and privacy policy.</p>:null}
    {(cursors.length>1||lists&&!lists.isDone)&&<nav className="flex justify-between gap-3 border-t border-border p-3" aria-label="Mailing list pages"><Button variant="outline" disabled={dirty||cursors.length===1} onClick={()=>setCursors(value=>value.slice(0,-1))}>Previous lists</Button><Button variant="outline" disabled={dirty||!lists||lists.isDone} onClick={()=>lists&&setCursors(value=>[...value,lists.continueCursor])}>Next lists</Button></nav>}
   </section>
   {selected==="new"?<ListEditor key="new" list={null} changed={setDirty} saved={id=>{setDirty(false);setSelected(id);}} cancelled={()=>{setDirty(false);setSelected(null);}}/>:selected?selectedList===undefined?<p role="status">Loading list details…</p>:selectedList===null?<p role="alert">This mailing list is no longer available.</p>:<ListEditor key={selected} list={selectedList} changed={setDirty} saved={()=>setDirty(false)} cancelled={()=>{setDirty(false);setSelected(null);}}/>:<p className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">Choose a list to edit its signup language and review its audience.</p>}
  </div>
 </div>;
}
function ListEditor({list,changed,saved,cancelled}:{list:List|null;changed:(value:boolean)=>void;saved:(id:Id<"mailingLists">)=>void;cancelled:()=>void}){
 const create=useMutation(api.audiences.lists.create),update=useMutation(api.audiences.lists.update);
 const fields=(value:List|null):Fields=>value?{name:value.name,description:value.description,consentText:value.consentText,privacyUrl:value.privacyUrl,status:value.status}:{...blank};
 const [draft,setDraft]=useState(()=>fields(list)),[baseline,setBaseline]=useState(()=>JSON.stringify(fields(list))),[revision,setRevision]=useState(list?.revision??null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
 const dirty=JSON.stringify(draft)!==baseline,stale=list!==null&&list.revision!==revision;
 useEffect(()=>{changed(dirty||busy);},[dirty,busy,changed]);
 const load=()=>{const fresh=fields(list);setDraft(fresh);setBaseline(JSON.stringify(fresh));setRevision(list?.revision??null);setMessage(null);setError(null);};
 const edit=<K extends keyof Fields>(key:K,value:Fields[K])=>{setDraft(current=>({...current,[key]:value}));setMessage(null);};
 return <section className="space-y-5 rounded-lg border border-border p-5" aria-label={list?`Edit mailing list ${list.name}`:"New mailing list"}>
  <h2 className="text-lg font-semibold">{list?"List details":"Create a mailing list"}</h2>
  {stale&&<div role="status" className="space-y-2 text-sm"><p>This list changed while you were editing. Your draft is still here.</p><Button variant="outline" disabled={busy} onClick={load}>Reload current list</Button></div>}
  <form className="space-y-4" onSubmit={async event=>{event.preventDefault();if(busy||stale)return;setBusy(true);setError(null);setMessage(null);try{const values={...draft,name:draft.name.trim(),description:draft.description.trim(),consentText:draft.consentText.trim(),privacyUrl:draft.privacyUrl.trim()};const id=list?.id??await create(values);if(list){await update({...values,listId:id,expectedRevision:revision!});setRevision(revision!+1);}setDraft(values);setBaseline(JSON.stringify(values));setMessage("Mailing list saved.");saved(id);}catch(error){setError(error instanceof Error?error.message:"The list could not be saved. Your draft is still here.");}finally{setBusy(false);}}}>
   <fieldset disabled={busy} className="space-y-4">
    <label className="block space-y-1 text-sm">List name<input className={input} value={draft.name} maxLength={160} required onChange={event=>edit("name",event.target.value)}/></label>
    <label className="block space-y-1 text-sm">Description<textarea className={input} value={draft.description} maxLength={1000} rows={2} onChange={event=>edit("description",event.target.value)}/></label>
    <label className="block space-y-1 text-sm">Signup consent<textarea className={input} value={draft.consentText} maxLength={1000} rows={3} required onChange={event=>edit("consentText",event.target.value)}/></label>
    <p className="text-xs text-muted-foreground">Tell people what emails they can expect and how they can unsubscribe. Each signup preserves the wording accepted at that time.</p>
    <label className="block space-y-1 text-sm">Privacy policy address<input className={input} value={draft.privacyUrl} placeholder="/privacy" maxLength={2048} required onChange={event=>edit("privacyUrl",event.target.value)}/></label>
    <label className="block space-y-1 text-sm">List status<select aria-label="List status" className={input} value={draft.status} onChange={event=>edit("status",event.target.value as Fields["status"])}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
   </fieldset>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}
   <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy||stale||!dirty}>{busy?"Saving…":"Save mailing list"}</Button><Button type="button" variant="outline" disabled={busy} onClick={cancelled}>Cancel editing</Button></div>
  </form>
  {list&&<Subscribers key={list.id} listId={list.id}/>}
 </section>;
}
function Subscribers({listId}:{listId:Id<"mailingLists">}){
 const [status,setStatus]=useState<"subscribed"|"unsubscribed"|"bounced">("subscribed"),[cursors,setCursors]=useState<(string|null)[]>([null]),[pending,setPending]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 const rows=useQuery(api.audiences.subscribers.list,{listId,status,paginationOpts:{numItems:20,cursor:cursors.at(-1)??null}}),suppress=useMutation(api.audiences.subscribers.suppress);
 return <section className="space-y-3 border-t border-border pt-5" aria-label="List subscribers"><h3 className="font-medium">Audience</h3><label className="block space-y-1 text-sm">Subscription status<select aria-label="Subscription status" className={input} value={status} onChange={event=>{setStatus(event.target.value as typeof status);setCursors([null]);setError(null);}}><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option></select></label>
 {!rows?<p role="status">Loading audience…</p>:!rows.page.length?<p className="text-sm text-muted-foreground">No {status} addresses in this list.</p>:<ul className="divide-y divide-border">{rows.page.map(row=><li key={row.id} className="space-y-2 py-3"><p className="break-all text-sm">{row.email}</p><p className="text-xs text-muted-foreground">Consent recorded {new Date(row.consentedAt).toLocaleDateString()}</p>{row.status==="subscribed"&&<Button variant="outline" size="sm" disabled={pending!==null} aria-label={`Unsubscribe ${row.email}`} onClick={async()=>{setPending(row.id);setError(null);try{await suppress({listId,subscriberId:row.id,reason:"unsubscribed",expectedUpdatedAt:row.updatedAt});}catch{setError("The subscription changed or could not be updated. Refresh the list before trying again.");}finally{setPending(null);}}}>{pending===row.id?"Updating…":"Unsubscribe"}</Button>}</li>)}</ul>}
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {(cursors.length>1||rows&&!rows.isDone)&&<nav className="flex justify-between gap-3" aria-label="Audience pages"><Button variant="outline" disabled={cursors.length===1} onClick={()=>setCursors(value=>value.slice(0,-1))}>Previous addresses</Button><Button variant="outline" disabled={!rows||rows.isDone} onClick={()=>rows&&setCursors(value=>[...value,rows.continueCursor])}>Next addresses</Button></nav>}
 </section>;
}
