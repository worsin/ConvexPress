import { expect, test } from "bun:test";
import { RequestReadLedger } from "../requestReadLedger";
import { getCurrentUser, currentUserCan } from "../permissions";
import { canEditContent } from "../publicContent";
import { readAppearance } from "../../settings/appearanceMigration";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { getDocumentSize } from "convex/values";
const limits = { queries: 256, documents: 2048, bytes: 8*1024*1024, documentBytes: 512*1024 };
async function code(fn:()=>unknown) {try {await fn();return null;}catch(error:any){return error.data?.code??error.message;}}
function admin() {return commerceHarness({users:[{_id:"editor",authSource:"local",status:"active",email:"editor@example.invalid",roleId:"role"}],roles:[{_id:"role",slug:"editor",type:"internal",status:"active",level:80,capabilities:["page.update"]}]},"editor");}
test("full local identity and role records count before ownership-authorized document access",async()=>{
 const ctx=admin(), budget=new RequestReadLedger();
 expect(await canEditContent(ctx as any,{type:"page",authorId:"editor"} as any,budget)).toBe(true);
 const expected=2*getDocumentSize(ctx.tables.users[0])+getDocumentSize(ctx.tables.roles[0]);
 expect(budget.bytes).toBe(expected); expect(budget.documents).toBe(3); expect(budget.queries).toBe(3);
 ctx.tables.users[0].privateMetadata="x".repeat(3000);
 const tiny=new RequestReadLedger({...limits,documentBytes:1000});
 expect(await code(()=>currentUserCan(ctx as any,"page.update",tiny))).toBe("CANONICAL_READ_BUDGET");
 expect(tiny.queries).toBe(1);
});
test("no further role or configuration lookup begins after the cumulative read limit",async()=>{
 const ctx=admin(), budget=new RequestReadLedger({...limits,queries:1});
 expect(await code(()=>currentUserCan(ctx as any,"page.update",budget))).toBe("CANONICAL_READ_BUDGET");
 expect(budget.queries).toBe(1); expect(budget.documents).toBe(1);
 const empty=new RequestReadLedger({...limits,bytes:0});
 expect(await code(()=>getCurrentUser(ctx as any,empty))).toBe("CANONICAL_READ_BUDGET"); expect(empty.queries).toBe(0);
});
test("management authentication does not swallow a request budget refusal as missing session",async()=>{
 const ctx=admin();
 ctx.auth.getUserIdentity=async()=>({tokenIdentifier:"https://convexpress-management.local|session",subject:"session"});
 ctx.tables.convexpress_managementSessions=[{_id:"session",status:"active",expiresAt:Date.now()+60_000,userId:"editor",authorityId:"authority",bindingId:"binding",siteRoleSlug:"editor",siteCapabilities:["page.update"]}];
 const budget=new RequestReadLedger({...limits,queries:1});
 expect(await code(()=>getCurrentUser(ctx as any,budget))).toBe("CANONICAL_READ_BUDGET");
 expect(budget.queries).toBe(1);
});
test("appearance counts full stored template and all actual legacy projection inputs",async()=>{
 const ctx=admin();
 ctx.tables.settings=[{_id:"appearance",section:"appearance.template",values:{active:"core",settings:{},overrides:{},variants:{}}},{_id:"header",section:"header",values:{privateUnused:"x".repeat(300)}}];
 const budget=new RequestReadLedger(); await readAppearance(ctx as any,budget);
 expect(budget.queries).toBe(4); expect(budget.documents).toBe(2);
 expect(budget.bytes).toBe(ctx.tables.settings.reduce((sum:any,row:any)=>sum+getDocumentSize(row),0));
 expect(await code(()=>readAppearance(ctx as any,new RequestReadLedger({...limits,queries:3})))).toBe("CANONICAL_READ_BUDGET");
});

test("metered policy handlers account for omitted raw metadata and refuse before the next status read",async()=>{
 const { measuredGrants, measuredRules } = await import("../../membership/policyReads");
 const { readMembershipAuthorityGrants } = await import("../membershipAuthority");
 const ctx=admin();
 ctx.tables.membership_grants=[{_id:"grant",userId:"editor",status:"active",planId:"plan",metadata:{notInDto:"x".repeat(3000)}}];
 const measured=await (measuredGrants as any)._handler(ctx,{userId:"editor",status:"active"});
 expect(measured.rows).toBe(1);expect(measured.bytes).toBe(getDocumentSize(ctx.tables.membership_grants[0]));expect(measured.items[0].metadata).toBeUndefined();
 const budget=new RequestReadLedger({...limits,bytes:1000});
 expect(await code(()=>readMembershipAuthorityGrants(ctx as any,"editor" as any,budget))).toBe("CANONICAL_READ_BUDGET");
 expect(ctx.calls.filter((call:any)=>call.name==="membership/policyReads:measuredGrants").length).toBe(1);
 ctx.tables.membership_restriction_rules=[{_id:"r",resourceType:"route",resourceIdOrKey:"/member",ruleMode:"allow_only",metadata:{large:"x".repeat(2000)}},...Array.from({length:600},(_,i)=>({_id:`other${i}`,resourceType:"post",resourceIdOrKey:`p${i}`,ruleMode:"allow_only"}))];
 const rules=await (measuredRules as any)._handler(ctx,{resourceType:"route",resourceIdOrKey:"/member"});
 expect(rules.rows).toBe(1);expect(rules.bytes).toBe(getDocumentSize(ctx.tables.membership_restriction_rules[0]));
});

test("actual nested measured policy query counts pending grant writes and subsequent revocations",async()=>{
 const {convexTest}=await import("convex-test"); const {default:schema}=await import("../../schema");
 const {makeFunctionReference}=await import("convex/server");
 const t=convexTest({schema,modules:{"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads")}});
 await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"fixture@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const plan=await ctx.db.insert("membership_plans",{title:"Fixture",slug:"fixture",status:"active",grantMode:"manual",priority:1,createdAt:1,updatedAt:1});
  await ctx.db.query("posts").paginate({cursor:null,numItems:1});
  const grant=await ctx.db.insert("membership_grants",{userId:user,planId:plan,status:"grace",sourceType:"manual",startsAt:1,createdAt:1,updatedAt:1});
  const ref=makeFunctionReference<"query",{userId:typeof user;status:"grace"}, {items:unknown[];rows:number;bytes:number}>("membership/policyReads:measuredGrants");
  const first=await ctx.runQuery(ref,{userId:user,status:"grace"}); expect(first.rows).toBe(1);
  expect(first.bytes).toBe(getDocumentSize((await ctx.db.get("membership_grants",grant))!));
  await ctx.db.patch("membership_grants",grant,{status:"revoked"});
  const last=await ctx.runQuery(ref,{userId:user,status:"grace"});expect(last.rows).toBe(0);expect(last.bytes).toBe(0);
 });
});
