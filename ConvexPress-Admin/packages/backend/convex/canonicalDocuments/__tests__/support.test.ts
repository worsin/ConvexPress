import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readTicketCta } from "../support";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")};
test("ticket handoff requires the tickets plugin and visible support routes",async()=>{
 const t=convexTest({schema,modules});
 const settings=await t.run(async ctx=>{const user=await ctx.db.insert("users",{authSource:"local",email:"fixture@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});return ctx.db.insert("settings",{section:"plugins",values:{ticketsEnabled:true,membershipEnabled:true},updatedBy:user,updatedAt:1});});
 expect(await t.run(ctx=>readTicketCta(ctx))).toEqual({available:true});
 for(const path of ["/support","/support/new"]){
 const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:path,ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1}));
 expect(await t.run(ctx=>readTicketCta(ctx))).toEqual({available:false});await t.run(ctx=>ctx.db.delete(rule));
 }
 await t.run(ctx=>ctx.db.patch(settings,{values:{ticketsEnabled:false}}));expect(await t.run(ctx=>readTicketCta(ctx))).toEqual({available:false});
});
