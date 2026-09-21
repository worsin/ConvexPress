import type {QueryCtx,MutationCtx} from "../../_generated/server";
import {loadSecuritySettings} from "../forms/spam";
import {sha256Hex,canonicalJson} from "../../canonicalDocuments/foundation/shared/fingerprints";
import type {RsvpSnapshot} from "../../canonicalDocuments/foundation/rsvpContracts";
import {refuse,type RsvpAuthority} from "./rsvpAuthority";
export async function rsvpSecurity(ctx:QueryCtx,source:RsvpAuthority){
 const settings=await loadSecuritySettings(ctx,source.budget);
 const required=settings.captchaEnabled&&!(settings.skipForLoggedIn&&source.userId!==null),limit=settings.perFormLimit??120;
 if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(settings.windowMs)||settings.windowMs<1000||!Number.isFinite(settings.recaptchaMinScore)||settings.recaptchaMinScore<0||settings.recaptchaMinScore>1||!settings.honeypotFieldName.trim()||settings.honeypotFieldName.length>256||(settings.captchaSiteKey?.length??0)>1000)refuse();
 if(required&&(settings.captchaProvider==="none"||!settings.captchaSiteKey?.trim()))refuse("RSVP_VERIFICATION_UNAVAILABLE","Response verification is not configured. Please try again later.");
 const publicSecurity:RsvpSnapshot["security"]={honeypotEnabled:settings.honeypotEnabled,honeypotFieldName:settings.honeypotFieldName,captchaEnabled:required,captchaProvider:settings.captchaProvider,captchaSiteKey:settings.captchaSiteKey??null,recaptchaMinScore:settings.recaptchaMinScore};
 const policy={required,provider:settings.captchaProvider,minScore:settings.recaptchaMinScore,failClosed:settings.failClosed,rateEnabled:settings.rateLimitEnabled,limit,windowMs:settings.windowMs};
 return {...policy,publicSecurity,fingerprint:sha256Hex(canonicalJson({...policy,publicSecurity}))};
}
export async function recordRsvpRate(ctx:MutationCtx,source:RsvpAuthority,policy:Awaited<ReturnType<typeof rsvpSecurity>>){
 if(!policy.rateEnabled)return;
 source.budget.beforeRead();const row=source.budget.record(await ctx.db.query("event_rsvp_rate_limits").withIndex("by_event",q=>q.eq("eventId",source.event._id)).unique());
 if(row&&(!Number.isSafeInteger(row.windowStart)||!Number.isSafeInteger(row.accepted)||row.accepted<0))refuse();
 const now=Date.now(),windowStart=Math.floor(now/policy.windowMs)*policy.windowMs,accepted=row?.windowStart===windowStart?row.accepted:0;
 if(accepted>=policy.limit)refuse("RSVP_RATE_LIMIT","This event is receiving many responses. Please try again shortly.");
 if(row)await ctx.db.patch("event_rsvp_rate_limits",row._id,{windowStart,accepted:accepted+1,updatedAt:now});
 else await ctx.db.insert("event_rsvp_rate_limits",{eventId:source.event._id,windowStart,accepted:1,updatedAt:now});
}
