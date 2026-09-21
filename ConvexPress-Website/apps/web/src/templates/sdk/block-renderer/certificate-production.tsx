import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { CertificateVerificationProvider } from "./certificate-verification";
import type { CertificateVerification } from "../block-data/portable/certificateContracts";
const verifyCode=makeFunctionReference<"query",{serial:string},CertificateVerification>("lms/certificates/queries:verifyPublicCode");
export function ProductionCertificateProvider({generation,children}:{generation:string;children:ReactNode}){
 const client=useConvex(),[ready,setReady]=useState(false);
 useEffect(()=>{setReady(true);},[]);
 const verify=useMemo(()=>ready?(serial:string)=>client.query(verifyCode,{serial}):null,[ready,client]);
 return <CertificateVerificationProvider key={client.url+":"+generation} verify={verify}>{children}</CertificateVerificationProvider>;
}
