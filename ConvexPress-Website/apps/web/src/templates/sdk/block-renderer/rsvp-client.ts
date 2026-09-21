import {rsvpSnapshotSchema,type RsvpSnapshot} from "../block-data/portable/rsvpContracts";
import {sha256Hex} from "../block-data/portable/shared/fingerprints";
import {createPublicLeaseClock,publicLeaseTimers,type PublicLeaseTimers} from "../block-public/access-lease";
import type {PublicWatch} from "../block-public/subscription";
import {RsvpInteractionError} from "./rsvp";
export function rsvpIdentityKey(origin:string,instanceKey:string,eventId:string){return `convexpress:rsvp:v1:${sha256Hex(JSON.stringify([origin,instanceKey,eventId]))}`;}
export function rsvpResponseError(error:unknown):RsvpInteractionError{
 const data=error&&typeof error==="object"&&"data" in error?error.data:null;
 const code=data&&typeof data==="object"&&"code" in data?data.code:null;
 const messages:Record<string,string>={RSVP_FULL:"This event is now full. Check again later for an available place.",RSVP_CLOSED:"Registration has closed.",RSVP_STARTED:"The event has started. Contact the organizer to change your RSVP.",RSVP_CHANGED:"Event details changed. Check your RSVP status before trying again.",RSVP_CONFLICT:"Your RSVP changed in another tab. Check your current status.",RSVP_VERIFICATION_REQUIRED:"Complete a new verification challenge before trying again.",RSVP_VERIFICATION_UNAVAILABLE:"Verification is temporarily unavailable. Please try again later.",RSVP_RATE_LIMIT:"This event is receiving many registrations. Please try again shortly.",RSVP_COUNT_UNAVAILABLE:"Registration is temporarily unavailable. Please contact the organizer.",RSVP_UNAVAILABLE:"This RSVP is no longer available. Refresh the page.",RSVP_CONTACT:"Enter your name and a valid email address."};
 return new RsvpInteractionError(typeof code==="string"&&Object.hasOwn(messages,code)?messages[code]:"Your request could not be confirmed. Check your RSVP status before trying again.");
}
export function isDefinitiveRsvpFailure(error:unknown){const data=error&&typeof error==="object"&&"data" in error?error.data:null;return !!data&&typeof data==="object"&&"code" in data&&typeof data.code==="string"&&data.code.startsWith("RSVP_");}
export function subscribeRsvp(watch:PublicWatch,target:Pick<RsvpSnapshot,"postId"|"blockId"|"eventId"|"providerId">,notify:(snapshot:RsvpSnapshot|null)=>void,expired:()=>void,timers:PublicLeaseTimers=publicLeaseTimers()){
 let active=true,lapsed=false;
 const expire=()=>{if(!active||lapsed)return;lapsed=true;notify(null);expired();};
 const lease=createPublicLeaseClock(timers,expire),wake=()=>lease.check();
 globalThis.document?.addEventListener("visibilitychange",wake);globalThis.window?.addEventListener("focus",wake);
 const update=()=>{
  if(!active||lapsed)return;
  try{const raw=watch.localQueryResult();if(raw===undefined)return;if(raw===null){lease.install(null);notify(null);return;}
   const snapshot=rsvpSnapshotSchema.parse(raw);
   if(snapshot.postId!==target.postId||snapshot.blockId!==target.blockId||snapshot.eventId!==target.eventId||(snapshot.providerId??"events")!==(target.providerId??"events")){lease.install(null);notify(null);return;}
   if(!lease.install({evaluatedAt:snapshot.asOf,expiresAt:Math.min(snapshot.asOf+60000,snapshot.nextChangeAt??Infinity)})){expire();return;}
   notify(snapshot);
  }catch{lease.install(null);notify(null);}
 };
 const stop=watch.onUpdate(update);update();
 return()=>{active=false;lease.dispose();stop();globalThis.document?.removeEventListener("visibilitychange",wake);globalThis.window?.removeEventListener("focus",wake);};
}
