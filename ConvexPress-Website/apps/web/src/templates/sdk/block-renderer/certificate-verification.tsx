import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, BadgeCheck, Search, ShieldCheck } from "lucide-react";
import { certificateCodeSchema, certificateVerificationSchema, type CertificateVerification } from "../block-data/portable/certificateContracts";
import * as P from "../primitives";
import "./certificate-verification.css";
type Verify = (serial: string) => Promise<unknown>;
const CertificateHost = createContext<Verify | null>(null);
export function CertificateVerificationProvider({ verify, children }: { verify: Verify | null; children: ReactNode }) {
  return <CertificateHost value={verify}>{children}</CertificateHost>;
}
export function CertificateVerificationBody({ title, available }: { title: string; available: boolean }) {
  const verify = useContext(CertificateHost);
  return <CertificateVerificationView title={title} available={available} verify={verify} />;
}
export function CertificateVerificationView({ title, available = true, verify }: { title: string; available?: boolean; verify: Verify | null }) {
  const id=useId(), [code,setCode]=useState(""), [pending,setPending]=useState(false);
  const [result,setResult]=useState<CertificateVerification|null>(null), [error,setError]=useState("");
  const [checkedAt,setCheckedAt]=useState<number|null>(null), [expired,setExpired]=useState(false);
  const generation=useRef(0), locked=useRef(false), alive=useRef(true), notice=useRef<HTMLDivElement>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  // Availability and verifier identity define a request boundary. An older
  // promise must neither disclose its result nor unlock a newer submission.
  useEffect(()=>{
    generation.current++;locked.current=false;
    setPending(false);setResult(null);setCheckedAt(null);setError("");setExpired(false);
    return()=>{generation.current++;locked.current=false;};
  },[available,verify]);
  useEffect(()=>{if(result||error)notice.current?.focus();},[result,error]);
  useEffect(()=>{
    if(!checkedAt)return;
    const expire=()=>{if(Date.now()-checkedAt>=60000){setResult(null);setCheckedAt(null);setExpired(true);}};
    const timer=setTimeout(expire,60000);document.addEventListener("visibilitychange",expire);
    return()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",expire);};
  },[checkedAt]);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(!available||!verify||locked.current)return;
    const parsed=certificateCodeSchema.safeParse(code);
    setResult(null);setCheckedAt(null);setExpired(false);
    if(!parsed.success){setError("Enter the complete certificate code, beginning with CERT-.");return;}
    const attempt=++generation.current;locked.current=true;setPending(true);setError("");
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{
      const raw=await Promise.race([verify(parsed.data),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error("timeout")),15000);})]);
      const value=certificateVerificationSchema.parse(raw);
      if(value.state==="valid"&&value.serial!==parsed.data)throw Error("Certificate code mismatch");
      if(alive.current&&generation.current===attempt){setResult(value);setCheckedAt(Date.now());}
    }catch{if(alive.current&&generation.current===attempt)setError("We couldn’t check that certificate. Please try again.");}
    finally{clearTimeout(timeout);if(alive.current&&generation.current===attempt){locked.current=false;setPending(false);}}
  };
  const status=result?.state==="valid"?"Certificate verified":result?.state==="unavailable"?"Verification unavailable":result?"Unable to verify":"";
  return <div className="cp-certificate-shell"><section className="cp-certificate" aria-labelledby={`${id}-heading`}>
    <header className="cp-certificate-header"><span className="cp-certificate-mark" aria-hidden="true"><ShieldCheck size={27}/></span><p className="cp-certificate-eyebrow">Credential verification</p><div id={`${id}-heading`}><P.Heading>{title}</P.Heading></div><p className="cp-certificate-intro">Confirm an achievement. Enter the unique code printed on the certificate to check its record.</p></header>
    <form onSubmit={submit} aria-busy={pending} noValidate>
      <label htmlFor={`${id}-code`}>Certificate code</label>
      <div className="cp-certificate-controls"><input id={`${id}-code`} type="text" value={code} maxLength={100} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="CERT-…" disabled={pending||!available||!verify} aria-describedby={`${id}-hint`} aria-invalid={!!error} onChange={event=>{setCode(event.target.value);setResult(null);setCheckedAt(null);setError("");setExpired(false);}}/>
      <button type="submit" disabled={pending||!available||!verify}>{pending?"Checking…":"Verify certificate"}<Search size={17} aria-hidden="true"/></button></div>
      <p id={`${id}-hint`} className="cp-certificate-hint">{!available?"Certificate verification is currently unavailable.":!verify?"Verification preview — open the published website to check a certificate.":"Use the full code exactly as it appears on the certificate."}</p>
    </form>
    <div ref={notice} tabIndex={-1} className="cp-certificate-notice" role={error?"alert":"status"}>
      {error&&<p>{error}</p>}{expired&&<p>Check again to see the latest certificate status.</p>}
      {result&&<div className="cp-certificate-result" data-state={result.state}>
        <div className="cp-certificate-result-title">{result.state==="valid"&&<BadgeCheck size={28} aria-hidden="true"/>}<h3>{status}</h3></div>
        {result.state==="valid"?<><p className="cp-certificate-holder">{result.holderName}</p><p className="cp-certificate-award">{result.certificateTitle}</p><dl><div><dt>Course</dt><dd>{result.courseTitle}</dd></div><div><dt>Issued</dt><dd>{new Date(result.issuedAt).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"})}</dd></div></dl><p className="cp-certificate-serial">{result.serial}</p>{result.pdfUrl&&<a href={result.pdfUrl} target="_blank" rel="noopener noreferrer">View certificate PDF<ArrowUpRight size={16} aria-hidden="true"/></a>}<p className="cp-certificate-hint">Verified at {new Date(checkedAt!).toLocaleTimeString()}. Status may change.</p></>:<p>{result.state==="unavailable"?"This website isn’t accepting certificate checks right now. Please try again later.":"No valid certificate matches this code. Check for a typing error, or contact the issuer if your certificate has been revoked."}</p>}
      </div>}
    </div>
  </section></div>;
}
