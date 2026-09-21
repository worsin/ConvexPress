import { expect, test } from "bun:test";
import { runDunningSweep } from "../dunning";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";

test("dunning contract boundary preserves empty and missing-invoice handling",async()=>{
 const ctx=commerceHarness();
 ctx.handlers["commerceSubscriptions/internals:getRetryableDunningAttempts"]=()=>[];
 expect(await (runDunningSweep as any)._handler(ctx,{})).toEqual({processed:0,succeeded:0,failed:0,cancelled:0});
 ctx.handlers["commerceSubscriptions/internals:getRetryableDunningAttempts"]=()=>[{attemptId:"attempt",subscriptionId:"subscription",invoiceId:"missing",attemptNumber:1}];
 expect(await (runDunningSweep as any)._handler(ctx,{limit:5})).toEqual({processed:1,succeeded:0,failed:0,cancelled:0});
 expect(ctx.calls.find(call=>call.name==="commerceSubscriptions/internals:abortDunningAttempt")?.args).toEqual({attemptId:"attempt",reason:"invoice_not_found"});
 expect(ctx.calls.some(call=>call.name.includes("stripeCharge"))).toBe(false);
});
