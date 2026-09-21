import {useEffect,useState} from "react";
import {useQuery,useMutation} from "convex/react";
import {api} from "@backend/convex/_generated/api";
import type {Id} from "@backend/convex/_generated/dataModel";
import {useAuth} from "@/lib/auth-context";
import {Button} from "@/components/ui/button";

type Media={_id:Id<"media">;updatedAt:number;altText?:string;caption?:string;mediaType:string;status:string};
type Approval={creditName:string;creditUrl:string|null;altText:string;caption:string;rightsBasis:"owned"|"permission"|"license";permissionNote:string;expiresAt:number|null;approved:boolean;revision:number;needsReview:boolean;reviewedAt:number};
const inputClass="w-full border border-border bg-background px-3 py-2 text-sm text-foreground";
function localDate(value:number|null){if(value===null)return "";const date=new Date(value);return new Date(value-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
export function MediaShowcaseApproval({media}:{media:Media}){
 const {can}=useAuth();
 return can("manage_options")&&media.mediaType==="image"?<ApprovalPicker key={media._id} media={media}/>:null;
}
function ApprovalPicker({media}:{media:Media}){
 const [cursors,setCursors]=useState<(string|null)[]>([null]),[tagId,setTagId]=useState<Id<"terms">|null>(null),[tagName,setTagName]=useState("");
 const tags=useQuery(api.media.showcase.tags,{paginationOpts:{numItems:25,cursor:cursors.at(-1)??null}});
 const publication=useQuery(api.media.showcase.get,tagId?{mediaId:media._id,tagId}:"skip");
 return <section className="border border-border bg-card p-4 space-y-4" aria-label="Community image approval">
  <div><h3 className="text-sm font-semibold">Community image approval</h3><p className="mt-1 text-xs text-muted-foreground">Choose a tag used by a UGC Grid, then review this image’s permission and public credit.</p></div>
  <label className="block text-xs font-medium space-y-1">Showcase tag
   <select aria-label="Showcase tag" className={inputClass} value={tagId??""} onChange={event=>{setTagId(event.target.value as Id<"terms">||null);setTagName(tags?.page.find(tag=>tag.id===event.target.value)?.name??"");}}>
    <option value="">Choose a tag</option>
    {tagId&&!tags?.page.some(tag=>tag.id===tagId)&&<option value={tagId}>{tagName}</option>}
    {tags?.page.map(tag=><option key={tag.id} value={tag.id}>{tag.name}</option>)}
   </select>
  </label>
  {tags?.page.length===0&&<p className="text-xs text-muted-foreground">Create a tag in Posts → Tags to organize community images.</p>}
  {(cursors.length>1||tags&&!tags.isDone)&&<div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={cursors.length===1} onClick={()=>setCursors(value=>value.slice(0,-1))}>Previous tags</Button><Button type="button" variant="outline" size="sm" disabled={!tags||tags.isDone} onClick={()=>{if(tags&&!tags.isDone)setCursors(value=>[...value,tags.continueCursor]);}}>More tags</Button></div>}
  {tagId&&publication!==undefined?<ApprovalForm key={tagId} media={media} tagId={tagId} publication={publication}/>:tagId?<p role="status" className="text-xs">Loading approval…</p>:null}
 </section>;
}
function ApprovalForm({media,tagId,publication}:{media:Media;tagId:Id<"terms">;publication:Approval|null}){
 const approve=useMutation(api.media.showcase.approve),revoke=useMutation(api.media.showcase.revoke);
 const [creditName,setCreditName]=useState(publication?.creditName??""),[creditUrl,setCreditUrl]=useState(publication?.creditUrl??""),[altText,setAltText]=useState(publication?.altText??media.altText??""),[caption,setCaption]=useState(publication?.caption??media.caption??"");
 const [basis,setBasis]=useState<Approval["rightsBasis"]>(publication?.rightsBasis??"permission"),[note,setNote]=useState(publication?.permissionNote??""),[expiry,setExpiry]=useState(localDate(publication?.expiresAt??null));
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(publication?.revision??null),[imageVersion,setImageVersion]=useState(media.updatedAt);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const expiry=publication?.expiresAt;if(expiry===null||expiry===undefined||expiry<=now)return;const timer=setTimeout(()=>setNow(Date.now()),Math.min(2147483647,Math.max(1,expiry-Date.now())));return()=>clearTimeout(timer);},[publication?.expiresAt,now]);
 const stale=revision!==(publication?.revision??null)||imageVersion!==media.updatedAt;
 const loadCurrent=()=>{setCreditName(publication?.creditName??"");setCreditUrl(publication?.creditUrl??"");setAltText(publication?.altText??media.altText??"");setCaption(publication?.caption??media.caption??"");setBasis(publication?.rightsBasis??"permission");setNote(publication?.permissionNote??"");setExpiry(localDate(publication?.expiresAt??null));setRevision(publication?.revision??null);setImageVersion(media.updatedAt);setConfirmed(false);setError(null);};
 const status=publication?.approved?(publication.needsReview||(publication.expiresAt!==null&&publication.expiresAt<=now)?"Needs a new review":"Approved for this tag"):"Not approved for this tag";
 return <form className="space-y-3" onSubmit={async event=>{event.preventDefault();if(!confirmed||stale||busy)return;setBusy(true);setError(null);setMessage(null);try{await approve({mediaId:media._id,tagId,expectedMediaUpdatedAt:imageVersion,expectedRevision:revision,creditName,creditUrl:creditUrl.trim()||null,altText,caption,rightsBasis:basis,permissionNote:note,expiresAt:expiry?new Date(expiry).getTime():null});setRevision((revision??0)+1);setConfirmed(false);setMessage("Approval saved. Eligible images can now appear in grids using this tag.");}catch(error){setError(error instanceof Error?error.message:"Approval could not be saved.");}finally{setBusy(false);}}}>
  <p role="status" className="text-xs font-medium">{status}</p>
  {stale&&<div className="text-xs space-y-2"><p>The image or approval changed while this form was open. Reload the current details before continuing.</p><Button type="button" size="sm" variant="outline" onClick={loadCurrent}>Reload approval details</Button></div>}
  <label className="block text-xs font-medium space-y-1">Public credit<input className={inputClass} aria-label="Public credit" value={creditName} onChange={e=>setCreditName(e.target.value)} maxLength={160} required/></label>
  <label className="block text-xs font-medium space-y-1">Credit link (optional)<input className={inputClass} aria-label="Credit link" type="url" placeholder="https://" value={creditUrl} onChange={e=>setCreditUrl(e.target.value)} maxLength={2048}/></label>
  <label className="block text-xs font-medium space-y-1">Public image description<input className={inputClass} aria-label="Public image description" value={altText} onChange={e=>setAltText(e.target.value)} maxLength={500} required/></label>
  <label className="block text-xs font-medium space-y-1">Public caption<textarea className={inputClass} aria-label="Public caption" value={caption} onChange={e=>setCaption(e.target.value)} maxLength={1000} rows={2}/></label>
  <label className="block text-xs font-medium space-y-1">Permission basis<select className={inputClass} aria-label="Permission basis" value={basis} onChange={e=>setBasis(e.target.value as Approval["rightsBasis"])}><option value="permission">Creator’s permission</option><option value="owned">We own this image</option><option value="license">Licensed for this use</option></select></label>
  <label className="block text-xs font-medium space-y-1">Private permission note<textarea className={inputClass} aria-label="Private permission note" value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} rows={3} required/></label>
  <p className="text-xs text-muted-foreground">Record where permission came from and any restrictions. This note is visible only to website managers.</p>
  <label className="block text-xs font-medium space-y-1">Permission expires (optional)<input className={inputClass} aria-label="Permission expires" type="datetime-local" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>
  <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required className="mt-0.5"/>I confirm this image may be displayed publicly with the credit and permission recorded above.</label>
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}{message&&<p role="status" className="text-xs">{message}</p>}
  <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={!confirmed||busy||stale||media.status!=="active"}>{busy?"Saving…":"Approve for this tag"}</Button><Button type="button" variant="outline" size="sm" disabled={!publication?.approved||busy||stale} onClick={async()=>{setBusy(true);setError(null);setMessage(null);try{await revoke({mediaId:media._id,tagId,expectedRevision:revision});setRevision((revision??0)+1);setConfirmed(false);setMessage("Approval revoked. This image is no longer eligible for this tag’s grids.");}catch(error){setError(error instanceof Error?error.message:"Approval could not be revoked.");}finally{setBusy(false);}}}>Revoke approval</Button></div>
 </form>;
}
