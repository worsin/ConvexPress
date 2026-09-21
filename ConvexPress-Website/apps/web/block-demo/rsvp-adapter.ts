import {resolveCanonicalData} from "../src/templates/sdk/block-data/portable/resolve";
import type {DataScope,ResolverPolicy} from "../src/templates/sdk/block-data/portable/contracts";
import type {RsvpSnapshot} from "../src/templates/sdk/block-data/portable/rsvpContracts";
export function demoRsvp(blockId="rsvp",eventId="demo-studio-gathering"):RsvpSnapshot{
 const asOf=Date.now(),startsAt=asOf+7*86400000;
 return {postId:"demo-page",blockId,eventId,definitionVersion:"a".repeat(64),title:"An evening at the studio",href:"/events/studio-evening",startsAt,endsAt:startsAt+7200000,timeZone:"America/Denver",venue:"The garden studio · Denver",state:"open",closesAt:startsAt,remaining:12,responsePolicy:"guests",registration:null,canCancel:false,asOf,nextChangeAt:startsAt,security:{honeypotEnabled:false,honeypotFieldName:"website_url",captchaEnabled:false,captchaProvider:"none",captchaSiteKey:null,recaptchaMinScore:.5}};
}
export function resolveRsvpDemo(tree:unknown,scope:DataScope,policy:ResolverPolicy){
 const parameters:Parameters<typeof resolveCanonicalData>=[tree,scope,policy,async()=>null];
 parameters[35]=async args=>{const rsvp=args.event?demoRsvp(args.blockId,args.event):null;return {eventId:args.event??null,blockId:args.blockId,rsvp,asOf:rsvp?.asOf??Date.now(),nextChangeAt:rsvp?.nextChangeAt??null};};
 return resolveCanonicalData(...parameters);
}
