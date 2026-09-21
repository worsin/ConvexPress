import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {useConvex} from "convex/react";
import {api} from "@convexpress-website/backend/generated/api";
import type {Id} from "@convexpress-website/backend/generated/dataModel";
import type {RsvpSnapshot} from "../block-data/portable/rsvpContracts";
import {RsvpProvider,RsvpView,RsvpInteractionError} from "./rsvp";
import {rsvpIdentityKey,subscribeRsvp,rsvpResponseError,isDefinitiveRsvpFailure} from "./rsvp-client";
import {readPollVisitor,ensurePollVisitorAcrossTabs} from "./poll-client";
import {retryPollWrite} from "../block-data/portable/pollRetry";
import {FormSecurityControls} from "../../../extensions/forms/SecurityControls";
type Contact={name:string;email:string};
type Pending={fingerprint:string;requestKey:string;operation:"register"|"cancel";expectedRevision:number;definitionVersion:string};
type Draft={contact:Contact;pending?:Pending};
const Drafts=createContext<Map<string,Draft>|null>(null);
/** Contact drafts stay in memory only and are discarded on document/session
 * generation changes. The map survives short authorization-lease renewals. */
export function RsvpDraftScope({children}:{children:ReactNode}){const [drafts]=useState(()=>new Map<string,Draft>());return <Drafts value={drafts}>{children}</Drafts>;}
export function ProductionRsvpProvider({instanceKey,generation,postId,signedIn,password,children}:{instanceKey:string;generation:string;postId:string;signedIn:boolean;password?:string;children:ReactNode}){
 const client=useConvex(),[ready,setReady]=useState(false);useEffect(()=>{setReady(true);},[]);
 const value=useMemo(()=>({render:ready?(snapshot:RsvpSnapshot)=>snapshot.postId!==postId?null:<LiveRsvp key={JSON.stringify([client.url,instanceKey,generation,signedIn,password,postId,snapshot.blockId,snapshot.eventId,snapshot.providerId??"events"])} initial={snapshot} instanceKey={instanceKey} signedIn={signedIn} password={password}/>:null}),[client,ready,instanceKey,generation,postId,signedIn,password]);
 return <RsvpProvider value={value}>{children}</RsvpProvider>;
}
function LiveRsvp({initial,instanceKey,signedIn,password}:{initial:RsvpSnapshot;instanceKey:string;signedIn:boolean;password?:string}){
 const client=useConvex(),drafts=useContext(Drafts),key=rsvpIdentityKey(client.url,instanceKey,initial.eventId),draftKey=JSON.stringify([key,initial.postId,initial.blockId]);
 const draft=useRef<Draft>(drafts?.get(draftKey)??{contact:{name:"",email:""}}),[contact,setContact]=useState(draft.current.contact);
 const [snapshot,setSnapshot]=useState<RsvpSnapshot|null|undefined>(),[visitor,setVisitor]=useState<string|undefined>(),[refresh,setRefresh]=useState(0);
 const [captchaToken,setCaptchaToken]=useState(""),[captchaError,setCaptchaError]=useState<string|null>(null),[honeypot,setHoneypot]=useState(""),[challenge,setChallenge]=useState(0);
 const alive=useRef(true),current=useRef<RsvpSnapshot|null>(null),writing=useRef(false);
 const retain=()=>{if(!drafts)return;if(!drafts.has(draftKey)&&drafts.size>=64)drafts.delete(drafts.keys().next().value!);drafts.set(draftKey,draft.current);};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;current.current=null;};},[]);
 useEffect(()=>{
  if(signedIn)return;
  const read=()=>{try{setVisitor(readPollVisitor(window.localStorage,key));}catch{setVisitor(undefined);}};read();
  const changed=(event:StorageEvent)=>{if(event.key===key||event.key===null)read();};window.addEventListener("storage",changed);return()=>window.removeEventListener("storage",changed);
 },[key,signedIn]);
 useEffect(()=>{
  current.current=null;setSnapshot(undefined);
  const watch=client.watchQuery(api.canonicalRsvp.get,{postId:initial.postId as Id<"posts">,blockId:initial.blockId,instanceKey,password,visitorToken:signedIn?undefined:visitor,refreshKey:crypto.randomUUID()});
  return subscribeRsvp(watch,initial,value=>{current.current=value;setSnapshot(value);},()=>setRefresh(value=>value+1));
 },[client,initial.postId,initial.blockId,initial.eventId,initial.providerId,instanceKey,password,signedIn,visitor,refresh]);
 const securityKey=JSON.stringify(snapshot?.security),security=useMemo(()=>snapshot?.security,[securityKey]);
 const submit=async(operation:"register"|"cancel",details?:Contact)=>{
  const source=current.current;if(!alive.current||!source||writing.current)throw new RsvpInteractionError("Check your RSVP status before trying again.");
  if(operation==="register"&&source.state!=="open"||operation==="cancel"&&!source.canCancel)throw new RsvpInteractionError("This RSVP is no longer available for that change.");
  if(operation==="register"&&source.security.captchaEnabled&&!captchaToken.trim())throw new RsvpInteractionError(captchaError??"Complete the verification challenge before registering.");
  writing.current=true;
  try{
   let token=visitor;
   if(!signedIn&&source.responsePolicy==="guests"){
    try{token=await ensurePollVisitorAcrossTabs(window.localStorage,key,crypto,{locks:window.navigator.locks,indexedDB:window.indexedDB});}
    catch{throw new RsvpInteractionError("Allow browser storage to remember your RSVP and avoid duplicate reservations.");}
   }
   if(!alive.current||current.current!==source)throw new RsvpInteractionError("Event details changed. Check your RSVP status before trying again.");
   const fingerprint=JSON.stringify([operation,details??null,source.definitionVersion]);
   const old=draft.current.pending;
   if(old&&old.fingerprint!==fingerprint&&(source.registration?.revision??0)<=old.expectedRevision)throw new RsvpInteractionError("A previous request is still unconfirmed. Check its status before changing your details.");
   const pending=old?.fingerprint===fingerprint?old:{fingerprint,requestKey:crypto.randomUUID(),operation,expectedRevision:source.registration?.revision??0,definitionVersion:source.definitionVersion};draft.current.pending=pending;retain();
   const args={postId:source.postId as Id<"posts">,blockId:source.blockId,instanceKey,password,visitorToken:signedIn?undefined:token,operation,requestKey:pending.requestKey,expectedRevision:pending.expectedRevision,definitionVersion:pending.definitionVersion,...(details?{contact:details}:{}),honeypot};
   try{
    if(operation==="register"&&source.security.captchaEnabled)await client.action(api.canonicalRsvp.submitWithVerification,{...args,captchaToken});
    else await retryPollWrite(()=>client.mutation(api.canonicalRsvp.submit,args),{active:()=>alive.current&&current.current?.definitionVersion===source.definitionVersion});
    // The receipt may describe an earlier operation. Only the subscribed current
    // registration determines what is displayed, never this historical receipt.
    if(alive.current){draft.current.pending=undefined;retain();setRefresh(value=>value+1);}
   }catch(error){if(isDefinitiveRsvpFailure(error)){draft.current.pending=undefined;retain();}throw rsvpResponseError(error);}
   finally{if(alive.current&&token!==visitor)setVisitor(token);if(alive.current&&source.security.captchaEnabled){setCaptchaToken("");setChallenge(value=>value+1);}}
  }finally{writing.current=false;}
 };
 if(snapshot===undefined)return <p role="status">Checking your RSVP…</p>;
 if(snapshot===null)return <p role="status">This RSVP is not currently available.</p>;
 return <RsvpView snapshot={snapshot} returnTo={window.location.pathname+window.location.search} contact={contact} onContactChange={value=>{setContact(value);draft.current.contact=value;retain();}} onRefresh={()=>setRefresh(value=>value+1)} onRegister={details=>submit("register",details)} onCancel={()=>submit("cancel")} securityControls={snapshot.state==="open"&&snapshot.registration?.status!=="confirmed"?<FormSecurityControls key={challenge} formId={`rsvp-${snapshot.postId}-${snapshot.blockId}`} security={security} honeypotValue={honeypot} onHoneypotChange={setHoneypot} onCaptchaTokenChange={setCaptchaToken} onCaptchaErrorChange={setCaptchaError}/>:null}/>;
}
