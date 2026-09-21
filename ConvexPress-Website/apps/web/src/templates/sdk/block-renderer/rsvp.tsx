import {createContext,useContext,useEffect,useId,useRef,useState,type ReactNode} from "react";
import {ArrowUpRight,CalendarDays,Check,MapPin} from "lucide-react";
import type {RsvpResult,RsvpSnapshot} from "../block-data/portable/rsvpContracts";
import {rsvpContactSchema} from "../block-data/portable/rsvpContracts";
import * as P from "../primitives";
import "./rsvp.css";
export class RsvpInteractionError extends Error {}
type Host={render:((snapshot:RsvpSnapshot)=>ReactNode)|null};
const RsvpHost=createContext<Host>({render:null});
export function RsvpProvider({value,children}:{value:Host;children:ReactNode}){return <RsvpHost value={value}>{children}</RsvpHost>;}
export function RsvpBody({data}:{data:RsvpResult}){
 const host=useContext(RsvpHost);
 if(!data.rsvp)return <div className="cp-rsvp-empty"><P.Heading size="md">An invitation to join us</P.Heading><P.Text>Registration is not currently available. Please check back for event details.</P.Text></div>;
 return host.render?host.render(data.rsvp):<RsvpView snapshot={data.rsvp} preview/>;
}
type Contact={name:string;email:string};
export function RsvpView({snapshot,preview=false,contact,onContactChange,onRegister,onCancel,onRefresh,securityControls,returnTo}:{snapshot:RsvpSnapshot;preview?:boolean;returnTo?:string;contact?:Contact;onContactChange?:(value:Contact)=>void;onRegister?:(value:Contact)=>Promise<void>;onCancel?:()=>Promise<void>;onRefresh?:()=>void;securityControls?:ReactNode}){
 const id=useId(),[local,setLocal]=useState<Contact>({name:"",email:""}),[pending,setPending]=useState(false),[error,setError]=useState(""),[confirmCancel,setConfirmCancel]=useState(false);
 const active=useRef(true),busy=useRef(false),notice=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(error)notice.current?.focus();},[error]);
 const values=contact??local,setValues=(value:Contact)=>onContactChange?onContactChange(value):setLocal(value);
 const confirmed=snapshot.registration?.status==="confirmed",cancelled=snapshot.registration?.status==="cancelled";
 const open=snapshot.state==="open",disabled=preview||pending;
 const date=new Intl.DateTimeFormat("en-US",{day:"2-digit",timeZone:snapshot.timeZone}).format(snapshot.startsAt);
 const month=new Intl.DateTimeFormat("en-US",{month:"short",year:"numeric",timeZone:snapshot.timeZone}).format(snapshot.startsAt);
 const schedule=new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:snapshot.timeZone,timeZoneName:"short"}).format(snapshot.startsAt);
 const send=async(operation:"register"|"cancel")=>{
  if(disabled||busy.current)return;
  const parsed=rsvpContactSchema.safeParse(values);
  if(operation==="register"&&!parsed.success){setError("Enter your name and a valid email address.");return;}
  if(operation==="register"&&!onRegister||operation==="cancel"&&!onCancel)return;
  busy.current=true;setPending(true);setError("");
  try{if(operation==="register"&&parsed.success)await onRegister!(parsed.data);else await onCancel!();if(active.current)setConfirmCancel(false);}
  catch(cause){if(active.current)setError(cause instanceof RsvpInteractionError?cause.message:"Your request could not be confirmed. Check your RSVP status before trying again.");}
  finally{busy.current=false;if(active.current)setPending(false);}
 };
 const status=snapshot.state==="cancelled"?"This event has been cancelled.":confirmed?"Your place is reserved.":snapshot.state==="full"?"All places are currently reserved.":snapshot.state==="closed"?"Registration has closed.":snapshot.state==="sign-in-required"?"Sign in to reserve your place.":cancelled?"Your reservation was cancelled. You can reserve again while places are available.":"We look forward to seeing you.";
 return <div className="cp-rsvp-shell"><section className="cp-rsvp" aria-labelledby={`${id}-title`}>
  <div className="cp-rsvp-invitation"><p className="cp-rsvp-eyebrow">You’re invited</p><div className="cp-rsvp-date" aria-hidden="true"><span>{date}</span><small>{month}</small></div><div id={`${id}-title`}><P.Heading>{snapshot.title}</P.Heading></div><div className="cp-rsvp-details"><p><CalendarDays size={17} aria-hidden="true"/><time dateTime={new Date(snapshot.startsAt).toISOString()}>{schedule}</time></p>{snapshot.venue&&<p><MapPin size={17} aria-hidden="true"/>{snapshot.venue}</p>}</div><a className="cp-rsvp-event-link" href={snapshot.href}>Explore the event<ArrowUpRight size={16} aria-hidden="true"/></a></div>
  <div className="cp-rsvp-response"><p className="cp-rsvp-eyebrow">Make it a date</p><h3>{confirmed?"You’re on the list.":snapshot.state==="full"?"A full house.":snapshot.state==="cancelled"?"Plans have changed.":snapshot.state==="closed"?"Registration is closed.":"Save your place."}</h3>
   <p className="cp-rsvp-status" role="status">{confirmed&&<Check size={18} aria-hidden="true"/>}{status}</p>
   {confirmed?<div className="cp-rsvp-confirmed"><p>{snapshot.registration?.name}</p><p>{snapshot.registration?.email}</p>{snapshot.canCancel&&onCancel&&!preview&&<div className="cp-rsvp-cancellation">{confirmCancel?<><p>Release your place for someone else?</p><div className="cp-rsvp-actions"><button type="button" disabled={pending} onClick={()=>void send("cancel")}>{pending?"Cancelling…":"Confirm cancellation"}</button><button type="button" className="cp-rsvp-secondary" disabled={pending} onClick={()=>setConfirmCancel(false)}>Keep my place</button></div></>:<button type="button" className="cp-rsvp-text-button" onClick={()=>setConfirmCancel(true)}>Cancel my reservation</button>}</div>}</div>:open?<form onSubmit={event=>{event.preventDefault();void send("register");}} noValidate aria-busy={pending}>
    <fieldset disabled={disabled||!onRegister}><legend className="cp-rsvp-sr">Your registration details</legend><label htmlFor={`${id}-name`}>Your name</label><input id={`${id}-name`} autoComplete="name" maxLength={160} value={values.name} onChange={event=>setValues({...values,name:event.target.value})} required/><label htmlFor={`${id}-email`}>Email address</label><input id={`${id}-email`} type="email" autoComplete="email" maxLength={254} value={values.email} onChange={event=>setValues({...values,email:event.target.value})} required/></fieldset>
    {securityControls}<button type="submit" className="cp-rsvp-submit" disabled={disabled||!onRegister}>{pending?"Reserving your place…":"Reserve my place"}<ArrowUpRight size={19} aria-hidden="true"/></button><p className="cp-rsvp-footnote">One place per registration. Cancel before the event starts if your plans change.</p>
   </form>:snapshot.state==="sign-in-required"?<a className="cp-rsvp-sign-in" href={`/login?returnTo=${encodeURIComponent(returnTo??snapshot.href)}`}>Sign in<ArrowUpRight size={17} aria-hidden="true"/></a>:null}
   {open&&!confirmed&&snapshot.remaining!==null&&<p className="cp-rsvp-availability">{snapshot.remaining.toLocaleString("en-US")} {snapshot.remaining===1?"place":"places"} available</p>}
   {preview&&<p className="cp-rsvp-footnote">Preview only. Registrations are not sent.</p>}
   <p ref={notice} tabIndex={-1} role={error?"alert":undefined} className="cp-rsvp-error">{error}</p>{error&&onRefresh&&<button type="button" className="cp-rsvp-text-button" disabled={pending} onClick={onRefresh}>Check my RSVP status</button>}
  </div>
 </section></div>;
}
