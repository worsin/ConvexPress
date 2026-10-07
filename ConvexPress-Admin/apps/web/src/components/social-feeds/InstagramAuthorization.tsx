import {useEffect,useState} from "react";
import {useMutation} from "convex/react";
import {api} from "@backend/convex/_generated/api";
import type {Id} from "@backend/convex/_generated/dataModel";
import {Button} from "@/components/ui/button";
import {CredentialField,SECRET_SENTINEL} from "@/components/settings/integrations/CredentialField";

export type InstagramDraft={userId:string;apiVersion:string;accessToken:string|null;mediaOrigins:string};
export const emptyInstagramDraft=():InstagramDraft=>({userId:"",apiVersion:"",accessToken:"",mediaOrigins:""});
export const instagramOrigins=(draft:InstagramDraft)=>draft.mediaOrigins.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
const input="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";
export function InstagramAuthorizationFields({value,onChange,disabled=false}:{value:InstagramDraft;onChange:(value:InstagramDraft)=>void;disabled?:boolean}){
 return <fieldset disabled={disabled} className="space-y-4">
  <label className="block space-y-1 text-sm">Professional account ID<input className={input} name="instagramUserId" inputMode="numeric" pattern="[0-9]{1,40}" maxLength={40} required value={value.userId} onChange={event=>onChange({...value,userId:event.target.value})}/></label>
  <label className="block space-y-1 text-sm">API version<input className={input} name="instagramApiVersion" placeholder="vN.0" pattern="v[1-9][0-9]*\.0" maxLength={12} required value={value.apiVersion} onChange={event=>onChange({...value,apiVersion:event.target.value})}/></label>
  <CredentialField id="instagramAccessToken" label="Instagram access token" value={value.accessToken} onChange={accessToken=>onChange({...value,accessToken})} disabled={disabled} help="Use the token authorized for this professional account. It stays private to this website environment."/>
  <label className="block space-y-1 text-sm">Image servers (one HTTPS origin per line)<textarea className={input} name="instagramMediaOrigins" rows={3} maxLength={40960} value={value.mediaOrigins} onChange={event=>onChange({...value,mediaOrigins:event.target.value})}/></label>
  <p className="text-xs text-muted-foreground">Only images from these approved servers appear. Leave empty to display text and post links. The account must use Instagram API with Facebook Login.</p>
 </fieldset>;
}
type EditableSource={id:Id<"socialFeedSources">;handle:string;revision:number;instagramAuthorization?:{userId:string;apiVersion:string;mediaOrigins:string[]}|null};
function sourceDraft(source:EditableSource):InstagramDraft{return source.instagramAuthorization?{...source.instagramAuthorization,accessToken:SECRET_SENTINEL,mediaOrigins:source.instagramAuthorization.mediaOrigins.join("\n")}:emptyInstagramDraft();}
export function InstagramAuthorizationEditor({source,changed,close}:{source:EditableSource;changed:(value:boolean)=>void;close:()=>void}){
 const configure=useMutation(api.socialFeeds.sources.configureInstagram),[draft,setDraft]=useState(()=>sourceDraft(source)),[baseline,setBaseline]=useState(()=>JSON.stringify(sourceDraft(source))),[revision,setRevision]=useState(source.revision),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const dirty=JSON.stringify(draft)!==baseline,stale=revision!==source.revision;
 useEffect(()=>changed(dirty||busy),[dirty,busy,changed]);
 const hasToken=!!draft.accessToken;
 return <section className="space-y-4 rounded-lg border border-border p-5" aria-label="Instagram authorization"><h2 className="font-semibold">Authorize @{source.handle}</h2><p className="text-sm text-muted-foreground">Saving authorization clears cached posts. Refresh posts afterward to verify the account. Connect a separate source to use a different username.</p>
 {stale&&<div role="status"><p>This source changed while you were editing. Your draft is still here.</p><Button variant="outline" disabled={busy} onClick={()=>{const next=sourceDraft(source);setDraft(next);setBaseline(JSON.stringify(next));setRevision(source.revision);setError("");}}>Reload current authorization</Button></div>}
 <form className="space-y-4" onSubmit={async event=>{event.preventDefault();if(busy||stale||!dirty||!hasToken)return;setBusy(true);setError("");try{await configure({sourceId:source.id,expectedRevision:revision,userId:draft.userId,apiVersion:draft.apiVersion,mediaOrigins:instagramOrigins(draft),...(draft.accessToken===SECRET_SENTINEL?{}:{accessToken:draft.accessToken!})});close();}catch(error){setError(error instanceof Error?error.message:"Authorization could not be saved. Your draft is still here.");}finally{setBusy(false);}}}>
 <InstagramAuthorizationFields value={draft} onChange={setDraft} disabled={busy}/>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 <div className="flex gap-2"><Button type="submit" disabled={busy||stale||!dirty||!hasToken}>{busy?"Saving…":"Save authorization"}</Button><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel editing</Button></div></form></section>;
}
