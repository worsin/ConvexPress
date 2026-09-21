import {createContext,useContext,useId,useRef,useState,type ReactNode} from "react";
import {ArrowDown,ArrowUpRight,Check,FileText} from "lucide-react";
import type {LeadMagnetOffer} from "../block-data/portable/leadMagnetContracts";
import {FormSecurityControls} from "../../../extensions/forms/SecurityControls";
export type LeadReceipt={id:string;fileName:string;expiresAt:number};
export type LeadSubmission={email:string;marketingConsent:boolean;startedAt:number;honeypot:string;captchaToken:string};
export type LeadMagnetHost={live:boolean;available:boolean;submit:(offer:LeadMagnetOffer,input:LeadSubmission)=>Promise<LeadReceipt>;download:(receipt:LeadReceipt)=>Promise<void>;unsubscribe:(receipt:LeadReceipt)=>Promise<void>};
const unavailable=async():Promise<never>=>{throw Error("Downloads are unavailable in this preview.");};
const Context=createContext<LeadMagnetHost>({live:false,available:false,submit:unavailable,download:unavailable,unsubscribe:unavailable});
export function LeadMagnetProvider({value,children}:{value:LeadMagnetHost;children:ReactNode}){return <Context value={value}>{children}</Context>;}
export function LeadMagnetForm({offer}:{offer:LeadMagnetOffer|null}){
 const host=useContext(Context),id=useId(),started=useRef(Date.now()),status=useRef<HTMLParagraphElement>(null),pending=useRef(false);
 const [email,setEmail]=useState(""),[consent,setConsent]=useState(false),[honeypot,setHoneypot]=useState(""),[captchaToken,setCaptchaToken]=useState(""),[captchaError,setCaptchaError]=useState<string|null>(null);
 const [receipt,setReceipt]=useState<LeadReceipt|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[failed,setFailed]=useState(false),[optedOut,setOptedOut]=useState(false),[captchaVersion,setCaptchaVersion]=useState(0);
 const act=async(operation:()=>Promise<void>)=>{if(pending.current)return;pending.current=true;setBusy(true);setMessage("");setFailed(false);try{await operation();}catch(error){setFailed(true);setMessage(error instanceof Error?error.message:"Something went wrong. Please try again.");}finally{pending.current=false;setBusy(false);requestAnimationFrame(()=>status.current?.focus());}};
 const disabled=!host.live||!host.available||!offer;
 return <div className="cp-lead-form">
  {receipt?<div className="cp-lead-ready">
   <span className="cp-lead-check" aria-hidden="true"><Check size={24}/></span><h3>Your next chapter awaits.</h3>
   <p>Your file is ready. Save a copy and make it your own.</p>
   <button className="cp-lead-submit" type="button" disabled={busy||!host.available} onClick={()=>void act(async()=>{await host.download(receipt);setMessage("Download requested. Check your browser’s downloads.");})}><span>{busy?"Preparing…":"Download your guide"}</span><ArrowDown size={19} aria-hidden="true"/></button>
   <p className="cp-lead-filename"><FileText size={14} aria-hidden="true"/>{receipt.fileName}</p>
   {consent&&!optedOut&&<button className="cp-lead-optout" type="button" disabled={busy||!host.available} onClick={()=>void act(async()=>{await host.unsubscribe(receipt);setOptedOut(true);setMessage("Your opt-out request has been received.");})}>Stop email updates</button>}
   <button className="cp-lead-optout" type="button" disabled={busy} onClick={()=>{setReceipt(null);setMessage("");started.current=Date.now();}}>Back to the form</button>
  </div>:<form onSubmit={event=>{event.preventDefault();if(disabled||!offer||captchaError)return;void act(async()=>{const next=await host.submit(offer,{email,marketingConsent:consent,startedAt:started.current,honeypot,captchaToken});setReceipt(next);setOptedOut(false);setMessage("Your download is ready.");}).finally(()=>{setCaptchaToken("");setCaptchaVersion(value=>value+1);});}}>
   <p className="cp-lead-form-title">A little inspiration, to keep.</p>
   <label className="cp-lead-email-label" htmlFor={`${id}-email`}>Email address</label>
   <input id={`${id}-email`} name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required value={email} disabled={disabled||busy} onChange={event=>setEmail(event.target.value)} aria-describedby={`${id}-privacy`}/>
   <p id={`${id}-privacy`} className="cp-lead-privacy">Enter your email to request this download.{offer&&<> Read our <a href={offer.audience.privacyUrl}>privacy policy</a>.</>}</p>
   <label className="cp-lead-consent"><input type="checkbox" name="marketingConsent" checked={consent} disabled={disabled||busy} onChange={event=>setConsent(event.target.checked)}/><span>{offer?.audience.consentText||"I would also like occasional email updates. I can unsubscribe at any time."}<small>Optional</small></span></label>
   {host.live&&offer&&<FormSecurityControls key={captchaVersion} formId={`lead-${id}`} security={offer.security} honeypotValue={honeypot} onHoneypotChange={setHoneypot} onCaptchaTokenChange={setCaptchaToken} onCaptchaErrorChange={setCaptchaError}/>}
   {captchaError&&<p role="alert" className="cp-lead-error">{captchaError}</p>}
   <button className="cp-lead-submit" type="submit" disabled={disabled||busy||!!captchaError}><span>{busy?"Preparing your download…":"Get the guide"}</span><ArrowUpRight size={19} aria-hidden="true"/></button>
   <p className="cp-lead-small">Yours to download. Email updates are your choice.</p>
  </form>}
  <p ref={status} tabIndex={-1} className={failed?"cp-lead-status cp-lead-error":"cp-lead-status"} role={failed?"alert":"status"} aria-live="polite">{message||(!host.live?"Preview — no email is collected or download requested.":!offer?"This download is not currently available.":!host.available?"Reconnect to request your download.":"")}</p>
 </div>;
}
