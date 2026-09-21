import {makeFunctionReference as ref,type RegisteredAction} from "convex/server";
import {action} from "../_generated/server";
import type {Id} from "../_generated/dataModel";
import {requestSchema,requestValidator,resultValidator,deny} from "./submission";
import type {SubmitRequest,Reservation,DeliveryResult} from "./types";
import type {SubmissionSecurityVerdict} from "../extensions/forms/spam";
const reserve=ref<"mutation",SubmitRequest,Reservation>("leadMagnets/submission:reserve");
const finish=ref<"mutation",SubmitRequest&{deliveryId:Id<"leadMagnetDeliveries">;captchaVerified:boolean},DeliveryResult>("leadMagnets/submission:finalize");
const captcha=ref<"action",{provider:"turnstile"|"hcaptcha"|"recaptcha";token:string;recaptchaMinScore:number;failClosed:boolean},SubmissionSecurityVerdict>("extensions/forms/spam:runCaptchaVerification");
/** Reserve abuse budget before external verification. Only this action can pass
 * a CAPTCHA verdict to the final atomic mutation; callers cannot forge it. */
export const requestDownload:RegisteredAction<"public",SubmitRequest,Promise<DeliveryResult>>=action({
 args:requestValidator,returns:resultValidator,
 handler:async(ctx,raw)=>{
  const args=requestSchema.parse(raw),reservation=await ctx.runMutation(reserve,args);let captchaVerified=false;
  if(!reservation.ready&&reservation.captchaEnabled){
   if(reservation.captchaProvider==="none"||!args.captchaToken)return deny();
   const result=await ctx.runAction(captcha,{provider:reservation.captchaProvider,token:args.captchaToken,recaptchaMinScore:reservation.recaptchaMinScore,failClosed:true});
   if(!result.ok||result.block)return deny();captchaVerified=true;
  }
  return ctx.runMutation(finish,{...args,deliveryId:reservation.deliveryId,captchaVerified});
 },
});
