import {makeFunctionReference as ref} from "convex/server";
import {httpAction} from "../_generated/server";
import {handleDownloadBytes} from "../commerceDigital/byteTransport";
import type {LeaseRead} from "../commerceDigital/delivery";
import type {Proof} from "./types";
const read=ref<"query",Proof&{requestTime:number},LeaseRead>("leadMagnets/delivery:readLease");
const start=ref<"mutation",Proof,null>("leadMagnets/delivery:startLease");
export const downloadBytes=httpAction((ctx,request)=>handleDownloadBytes(request,{authorize:args=>ctx.runQuery(read,args),start:args=>ctx.runMutation(start,args),fetch}));
