import {useEffect,useRef,useState} from "react";
import {useMutation,useQuery} from "convex/react";
import {makeFunctionReference} from "convex/server";
import type {FooterNewsletterCell} from "@/lib/layout/types";
type Offer={name:string;consentText:string;privacyUrl:string;digest:string};
const offerRef=makeFunctionReference<"query",{audienceId:string},Offer|null>("audiences/footer:offer");
const subscribeRef=makeFunctionReference<"mutation",{audienceId:string;offerDigest:string;email:string;consent:boolean;secret:string;startedAt:number;honeypot:string},{ok:true}>("audiences/footer:subscribe");
const unsubscribeRef=makeFunctionReference<"mutation",{secret:string},null>("audiences/footer:unsubscribe");
export function FooterAudienceNewsletter({cell,tone="default"}:{cell:FooterNewsletterCell;tone?:"default"|"editorial"}){
 const offer=useQuery(offerRef,{audienceId:cell.audienceId!});
 return <div className="w-full min-w-0 space-y-3">
  {cell.heading&&<h3 className="text-sm font-semibold">{cell.heading}</h3>}
  {cell.subtext&&<p className="text-sm text-muted-foreground">{cell.subtext}</p>}
  {offer?<Signup key={`${cell.audienceId}:${offer.digest}`} audienceId={cell.audienceId!} offer={offer} buttonText={cell.buttonText} tone={tone}/>:<p className="text-xs text-muted-foreground" role="status">{offer===undefined?"Preparing signup…":"This mailing list is not available for signup."}</p>}
 </div>;
}
function Signup({audienceId,offer,buttonText,tone}:{audienceId:string;offer:Offer;buttonText:string;tone:"default"|"editorial"}){
 const subscribe=useMutation(subscribeRef),unsubscribe=useMutation(unsubscribeRef);
 const [email,setEmail]=useState(""),[consent,setConsent]=useState(false),[honeypot,setHoneypot]=useState(""),[status,setStatus]=useState("idle"),[message,setMessage]=useState(""),[secret,setSecret]=useState<string|null>(null);
 const startedAt=useRef(Date.now()),pending=useRef(false),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 return <form className="space-y-3" aria-label={`Join ${offer.name}`} onSubmit={async event=>{
  event.preventDefault();if(pending.current||!consent||!event.currentTarget.reportValidity())return;
  pending.current=true;setStatus("pending");setMessage("");
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,"0")).join("");
  try{const result=await subscribe({audienceId,offerDigest:offer.digest,email,consent,secret:token,startedAt:startedAt.current,honeypot});if(!alive.current)return;if(result?.ok!==true)throw Error("Unconfirmed signup");setSecret(token);setStatus("success");setMessage("Request received. Existing opt-outs remain in effect.");setEmail("");}
  catch{if(alive.current){setStatus("error");setMessage("Could not confirm signup. Refresh the page and try again.");}}
  finally{pending.current=false;}
 }}>
  {status!=="success"&&<>
   <div className="flex min-w-0 items-end gap-3">
    <label className="min-w-0 flex-1"><span className="sr-only">Email address for newsletter</span><input type="email" name="email" autoComplete="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" disabled={status==="pending"} className={`w-full min-w-0 border-border bg-background px-2 py-2 text-sm text-foreground ${tone==="editorial"?"border-b":"border"}`}/></label>
    <button type="submit" disabled={!consent||status==="pending"} className={`shrink-0 px-3 py-2 text-sm disabled:opacity-50 ${tone==="editorial"?"text-foreground underline underline-offset-4":"bg-foreground text-background"}`}>{status==="pending"?"Subscribing…":buttonText}</button>
   </div>
   <label className="flex items-start gap-2 text-xs"><input type="checkbox" required checked={consent} disabled={status==="pending"} onChange={e=>setConsent(e.target.checked)}/><span>{offer.consentText} <a className="underline" href={offer.privacyUrl}>Privacy policy</a></span></label>
   <label hidden aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e=>setHoneypot(e.target.value)}/></label>
  </>}
  {message&&<p className="text-xs text-muted-foreground" role={status==="error"?"alert":"status"}>{message}</p>}
  {secret&&status==="success"&&<button type="button" className="text-xs underline" onClick={async()=>{if(pending.current)return;pending.current=true;try{await unsubscribe({secret});if(alive.current){setSecret(null);setMessage("Opt-out request recorded.");}}catch{if(alive.current)setMessage("Could not record the opt-out. Try again.");}finally{pending.current=false;}}}>Undo this signup</button>}
 </form>;
}
