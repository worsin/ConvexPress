import { getSiteRuntime } from "../../../lib/site-runtime";
import { useLiveConnection } from "../../../hooks/useLiveConnection";
import {useEffect,useMemo,useRef,useSyncExternalStore,type ReactNode} from "react";
import {useAction,useConvex,useConvexAuth,useMutation} from "convex/react";
import {makeFunctionReference as ref} from "convex/server";
import {useAuth} from "../../../lib/auth/clerk";
import type {LeadMagnetRequest} from "../block-data/portable/leadMagnetContracts";
import {LeadMagnetProvider,type LeadMagnetHost,type LeadReceipt,type LeadSubmission} from "./lead-magnet";
type Input=LeadMagnetRequest&LeadSubmission&{offerDigest:string;requestId:string;secret:string};
type Result={leaseId:string;expiresAt:number;fileName:string;fileSize:number};
type Attempt={requestId:string;secret:string;receipt?:LeadReceipt};
const request=ref<"action",Input,Result>("leadMagnets/actions:requestDownload"),optOut=ref<"mutation",{leaseId:string;secret:string},null>("leadMagnets/delivery:unsubscribe");
const subscribeHydration=()=>()=>{};
const hydratedSnapshot=()=>true;
const serverHydrationSnapshot=()=>false;
export function ProductionLeadMagnetProvider({children,password}:{children:ReactNode;password?:string}){
 const hydrated=useSyncExternalStore(subscribeHydration,hydratedSnapshot,serverHydrationSnapshot);
 const submitAction=useAction(request),unsubscribe=useMutation(optOut),convex=useConvex(),auth=useConvexAuth(),connection=useLiveConnection(),user=useAuth();
 const scope=JSON.stringify([convex.url,getSiteRuntime().instanceKey,user.userId??null,user.sessionId??null,user.isSignedIn,auth.isLoading,auth.isAuthenticated,password??null]);
 // Public children survive anonymous auth initialization. Operation ownership
 // still uses the full readiness scope above, so stale callbacks cannot revive.
 // Preserve authenticated loading resets as well as real identity changes.
 const identified=!!(user.userId||user.sessionId||user.isSignedIn||auth.isAuthenticated);
 const viewScope=JSON.stringify([convex.url,getSiteRuntime().instanceKey,user.userId??null,user.sessionId??null,!!user.isSignedIn,identified?auth.isLoading:false,auth.isAuthenticated,password??null]);
 const available=hydrated&&!auth.isLoading&&connection.isWebSocketConnected&&(!user.isSignedIn||auth.isAuthenticated);
 const availability=useRef(available);availability.current=available;
 const current=useRef({scope}),lifetime=useRef({active:false,generation:0}),attempts=useRef(new Map<string,Attempt>()),receipts=useRef(new Map<string,Attempt>());
 if(current.current.scope!==scope){current.current={scope};attempts.current.clear();receipts.current.clear();}
 useEffect(()=>{lifetime.current.active=true;return()=>{lifetime.current.active=false;lifetime.current.generation++;attempts.current.clear();receipts.current.clear();};},[]);
 const value=useMemo<LeadMagnetHost>(()=>{
  // Scope strings can return to an earlier value; the owner object cannot.
  // Capture each operation's mount generation and check current availability
  // after awaits, before returning a receipt or triggering a browser download.
  const owner=current.current;
  const authorize = () => {
   const generation = lifetime.current.generation;
   const guard = () => {
    if (!lifetime.current.active || lifetime.current.generation !== generation || current.current !== owner)
     throw Error("Your account or website changed. Refresh the page before continuing.");
    if (!availability.current) throw Error("Reconnect before requesting your download.");
   };
   guard();
   return guard;
  };
  return {live:true,available,submit:async(offer,input)=>{
   const guard=authorize();const email=input.email.trim().toLowerCase(),key=JSON.stringify([offer.digest,email,input.marketingConsent]);
   let attempt=attempts.current.get(key);
   if(!attempt){if(attempts.current.size>=20)throw Error("Please refresh this page before requesting another download.");attempt={requestId:crypto.randomUUID(),secret:Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,"0")).join("")};attempts.current.set(key,attempt);}
   try{
    const result=await submitAction({...input,email,postId:offer.postId,blockId:offer.blockId,offerDigest:offer.digest,...(password!==undefined?{password}:{}),requestId:attempt.requestId,secret:attempt.secret});guard();
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(result.leaseId)||result.fileName!==offer.file.name||result.fileSize!==offer.file.bytes||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=Date.now())throw Error("The download has changed. Refresh this page and try again.");
    const receipt={id:result.leaseId,fileName:result.fileName,expiresAt:result.expiresAt};attempt.receipt=receipt;receipts.current.set(receipt.id,attempt);return receipt;
   }catch(error){guard();if(error instanceof Error&&error.message.includes("LEAD_MAGNET_UNAVAILABLE")){attempts.current.delete(key);throw Error("This offer or request has changed. Refresh this page and try again.");}throw Error("We could not prepare the download. Check your connection and try again.");}
  },download:async(receipt)=>{
   const guard=authorize();const attempt=receipts.current.get(receipt.id);if(!attempt||attempt.receipt?.expiresAt!==receipt.expiresAt||receipt.expiresAt<=Date.now())throw Error("This download session expired. Request a new copy from the form.");
   const path=`/api/lead-magnets/${encodeURIComponent(receipt.id)}`;
   const response=await fetch(path,{method:"POST",credentials:"same-origin",headers:{Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({secret:attempt.secret})});guard();
   if(response.status!==204)throw Error("The file is no longer available in this download session. Refresh the page and request it again.");
   const link=document.createElement("a");link.href=path;link.download=receipt.fileName;document.body.appendChild(link);link.click();link.remove();
  },unsubscribe:async(receipt)=>{const guard=authorize();const attempt=receipts.current.get(receipt.id);if(!attempt)throw Error("This request is no longer available in this tab.");await unsubscribe({leaseId:receipt.id,secret:attempt.secret});guard();}};
 },[hydrated,scope,auth.isLoading,auth.isAuthenticated,connection.isWebSocketConnected,user.isSignedIn,password,submitAction,unsubscribe]);
 return <LeadMagnetProvider key={viewScope} value={value}>{children}</LeadMagnetProvider>;
}
