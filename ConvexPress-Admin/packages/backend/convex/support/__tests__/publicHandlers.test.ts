import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import schema from "../../schema";
const modules={"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads"),"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/support/widget.ts":()=>import("../widget"),"./convex/support/analytics.ts":()=>import("../analytics"),"./convex/support/channels.ts":()=>import("../channels")};
const recent=makeFunctionReference<"query">("support/widget:getRecentTickets"),stats=makeFunctionReference<"query">("support/analytics:getDeflectionStats"),create=makeFunctionReference<"mutation">("support/channels:create");
test("typed support handlers preserve customer ticket isolation and staff-only configuration",async()=>{
 const t=convexTest({schema,modules});const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert("roles",{name:"Fixture support manager",slug:"support-manager",description:"Synthetic support test",isDefault:false,isProtected:false,pageAccess:[],type:"internal",status:"active",capabilities:["manage_options","ticket.viewAll"],level:80,createdAt:1,updatedAt:1});
  const user=await ctx.db.insert("users",{authSource:"local",email:"manager@example.invalid",emailVerified:true,status:"active",roleId:role,createdAt:1,updatedAt:1});
  const customer=await ctx.db.insert("users",{authSource:"clerk",clerkUserId:"test-customer",email:"customer@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{ticketsEnabled:true},updatedBy:user,updatedAt:1});
  for(const owner of [user,customer])await ctx.db.insert("ticket_tickets",{ticketNumber:owner===user?"TKT-STAFF":"TKT-CUSTOMER",userId:owner,userEmailSnapshot:"PRIVATE_EMAIL",userNameSnapshot:"PRIVATE_NAME",subject:"A question",description:"PRIVATE_BODY",category:"general",status:"open",priority:"medium",source:"dashboard",tags:[],aiAttempted:false,messageCount:0,createdAt:1,updatedAt:1});
  return {user,customer};
 });
 expect(await t.query(recent,{})).toBeNull();expect(await t.query(stats,{})).toBeNull();await expect(t.mutation(create,{code:"unauthorized",kind:"form",label:"Form"})).rejects.toThrow();
 const customer=t.withIdentity({subject:"test-customer",issuer:"https://fixture.clerk.accounts.dev",tokenIdentifier:"https://fixture.clerk.accounts.dev|test-customer"});
 const tickets=await customer.query(recent,{});expect(tickets).toHaveLength(1);expect(tickets[0].ticketNumber).toBe("TKT-CUSTOMER");expect(JSON.stringify(tickets)).not.toContain("PRIVATE");expect(await customer.query(stats,{})).toBeNull();
 const staff=t.withIdentity({subject:ids.user,issuer:"https://convexpress-admin.local",tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 expect((await staff.query(recent,{}))[0].ticketNumber).toBe("TKT-STAFF");expect((await staff.query(stats,{})).totalQueries).toBe(0);
 const channel=await staff.mutation(create,{code:"fixture-form",kind:"form",label:"Fixture form"});expect(typeof channel).toBe("string");await expect(staff.mutation(create,{code:"fixture-form",kind:"form",label:"Duplicate"})).rejects.toThrow("DUPLICATE_CODE");
});
