import {useState} from "react";
import {useQuery} from "convex/react";
import {api} from "@backend/convex/_generated/api";
/** Only the current installation's active lists are selectable. Pagination is
 * explicit; an existing selection is never discarded when it is off-page. */
export function FooterAudienceSelect({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const [cursors,setCursors]=useState<(string|null)[]>([null]);
 const page=useQuery(api.audiences.lists.list,{status:"active",paginationOpts:{numItems:20,cursor:cursors.at(-1)??null}});
 return <div className="space-y-2">
  <label className="flex flex-col gap-1.5 text-xs font-medium">Mailing list
   <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" value={value} onChange={e=>onChange(e.target.value)} disabled={!page}>
    <option value="">General newsletter</option>
    {value&&!page?.page.some(row=>row.id===value)&&<option value={value}>Selected list (not on this page)</option>}
    {page?.page.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
   </select>
  </label>
  {!page&&<p role="status" className="text-xs">Loading mailing lists…</p>}
  <p className="text-xs text-muted-foreground">Choose an active list from this website. Visitors must accept its signup consent. Manage lists in Audience.</p>
  {(cursors.length>1||page&&!page.isDone)&&<div className="flex gap-3 text-xs"><button type="button" disabled={cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))}>Previous lists</button><button type="button" disabled={!page||page.isDone} onClick={()=>page&&setCursors(v=>[...v,page.continueCursor])}>Next lists</button></div>}
 </div>;
}
