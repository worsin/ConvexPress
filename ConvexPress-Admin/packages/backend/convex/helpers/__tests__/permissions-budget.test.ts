import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { get as mediaGet } from "../../media/queries";
import { currentUserCan, getCurrentRoleLevel, requireCan } from "../permissions";
import { RequestReadLedger } from "../requestReadLedger";
function managedFixture() {
 const ctx=commerceHarness({
  users:[{_id:'managed-user',authSource:'management',status:'active',roleId:'managed-role'}],
  roles:[{_id:'managed-role',slug:'administrator',type:'internal',status:'active',level:100,capabilities:['form.update']}],
  convexpress_managementSessions:[{_id:'managed-session',authorityId:'authority',bindingId:'binding',userId:'managed-user',websiteKey:'site',instanceKey:'live',siteRoleSlug:'administrator',siteCapabilities:['form.update'],capabilityRevision:1,status:'active',expiresAt:Date.now()+60_000}],
  convexpress_managementAuthorities:[{_id:'authority',controllerId:'controller',websiteKey:'site',instanceKey:'live',capabilityRevision:1,status:'active',notBefore:0}],
  convexpress_managementBindings:[{_id:'binding',authorityId:'authority',controllerId:'controller',userId:'managed-user',capabilityRevision:1,status:'active'}],
 });
 ctx.auth.getUserIdentity=async()=>({subject:'managed-session',tokenIdentifier:'https://convexpress-management.local|managed-session'});
 return ctx;
}
test('repeated brokered form authorization fits the unchanged document read budget',async()=>{
 const ctx=managedFixture(),budget=new RequestReadLedger();
 for(let i=0;i<40;i++){
  if(i%2)expect(await currentUserCan(ctx,'form.update',budget)).toBe(true);
  else expect((await requireCan(ctx,'form.update',budget))._id).toBe('managed-user');
 }
 expect(budget.queries).toBeLessThanOrEqual(256);
});
test('brokered capability resolution rechecks revocation and capability reductions on every call',async()=>{
 const changes=[
  (ctx:any)=>{ctx.tables.convexpress_managementSessions[0].status='revoked';},
  (ctx:any)=>{ctx.tables.convexpress_managementSessions[0].expiresAt=Date.now()-1;},
  (ctx:any)=>{ctx.tables.convexpress_managementAuthorities[0].status='revoked';},
  (ctx:any)=>{ctx.tables.convexpress_managementAuthorities[0].capabilityRevision++;},
  (ctx:any)=>{ctx.tables.convexpress_managementBindings[0].status='revoked';},
  (ctx:any)=>{ctx.tables.users[0].status='banned';},
  (ctx:any)=>{ctx.tables.roles[0].capabilities=[];},
  (ctx:any)=>{ctx.tables.convexpress_managementSessions[0].siteCapabilities=[];},
 ];
 for(const change of changes){
  const ctx=managedFixture(),budget=new RequestReadLedger();
  expect((await requireCan(ctx,'form.update',budget))._id).toBe('managed-user');
  change(ctx);
  expect(await currentUserCan(ctx,'form.update',budget)).toBe(false);
  await expect(requireCan(ctx,'form.update',budget)).rejects.toBeDefined();
 }
});
function fixture(extra: Record<string, any[]> = {}) {
  return commerceHarness({
    users: [{ _id: "customer", authSource: "local", roleId: "base", status: "active", email: "fixture@example.invalid" }],
    roles: [{ _id: "base", slug: "subscriber", type: "customer", level: 20, status: "active", capabilities: ["media.read"] }],
    settings: [{ _id: "plugins", section: "plugins", values: { membershipEnabled: true } }],
    ...extra,
  }, "customer");
}
const grant = (index: number, status = "active") => ({ _id: `grant${index}`, userId: "customer", planId: "plan", startsAt: 0, status });
async function errorCode(run: () => Promise<unknown>) { try { await run(); return null; } catch (error: any) { return error.data?.code ?? error.message; } }

test("actual authenticated media handler refuses an incomplete permission grant read before reading media", async () => {
  const ctx = fixture({ membership_grants: Array.from({ length: 257 }, (_, i) => grant(i)) });
  const get = ctx.db.get;
  let mediaReads = 0;
  ctx.db.get = async (...args: any[]) => { if (args[0] === "media") mediaReads++; return get(...args); };
  expect(await errorCode(() => (mediaGet as any)._handler(ctx, { mediaId: "missing" }))).toBe("MEMBERSHIP_POLICY_BUDGET");
  expect(mediaReads).toBe(0);
});

test("internal base roles do not read customer grants which cannot alter their resolved role", async () => {
  const ctx = fixture({ roles: [{ _id: "base", slug: "editor", type: "internal", status: "active", level: 80, capabilities: ["media.read"] }] });
  const query = ctx.db.query;
  let reads = 0;
  ctx.db.query = (table: string) => { if (table === "membership_grants") reads++; return query(table); };
  expect(await currentUserCan(ctx, "media.read")).toBe(true);
  expect(await getCurrentRoleLevel(ctx)).toBe(80);
  expect(reads).toBe(0);
});

test("permission policy budget errors are propagated rather than swallowed as missing optional tables", async () => {
  const ctx = fixture();
  ctx.runQuery = async () => { const { ConvexError } = await import("convex/values"); throw new ConvexError({ code: "MEMBERSHIP_POLICY_BUDGET", message: "fixture overflow" }); };
  expect(await errorCode(() => currentUserCan(ctx, "media.read"))).toBe("MEMBERSHIP_POLICY_BUDGET");
});

test("both live statuses are bounded while revoked and other-user grant history does not consume the indexed page", async () => {
  for (const status of ["active", "grace"]) {
    const ctx = fixture({ membership_grants: Array.from({ length: 257 }, (_, i) => grant(i, status)) });
    expect(await errorCode(() => currentUserCan(ctx, "media.read"))).toBe("MEMBERSHIP_POLICY_BUDGET");
  }
  const ctx = fixture({ membership_grants: [...Array.from({ length: 600 }, (_, i) => grant(i, "revoked")), ...Array.from({ length: 600 }, (_, i) => ({ ...grant(i + 600), userId: "unrelated" }))] });
  expect(await currentUserCan(ctx, "media.read")).toBe(true);
  expect(ctx.calls.map((call: any) => call.args.status)).toEqual(["active", "grace"]);
});

test("oversized full grants, base roles and dependent plans refuse before continuing authority reads", async () => {
  for (const extra of [
    { membership_grants: [{ ...grant(0), metadata: { hidden: "x".repeat(513 * 1024) } }] },
    { roles: [{ _id: "base", slug: "subscriber", type: "customer", level: 20, status: "active", capabilities: ["media.read"], description: "x".repeat(129 * 1024) }] },
    { membership_grants: [grant(0)], membership_plans: [{ _id: "plan", status: "active", description: "x".repeat(129 * 1024) }] },
  ]) expect(await errorCode(() => currentUserCan(fixture(extra), "media.read"))).toBe("MEMBERSHIP_POLICY_BUDGET");
});

test("dependent reads deduplicate within one resolution and refuse before the next read exhausts the cap", async () => {
  const ctx = fixture({ membership_grants: Array.from({ length: 130 }, (_, i) => ({ ...grant(i), planId: `p${i}` })), membership_plans: Array.from({ length: 130 }, (_, i) => ({ _id: `p${i}`, status: "active" })) });
  const get = ctx.db.get; let reads = 0;
  ctx.db.get = async (...args: any[]) => { if (args[0] === "membership_plans") reads++; return get(...args); };
  expect(await errorCode(() => currentUserCan(ctx, "media.read"))).toBe("MEMBERSHIP_POLICY_BUDGET");
  expect(reads).toBe(127); // The base role consumed the first of 128 bounded reads.
  const repeated = fixture({ membership_grants: Array.from({ length: 200 }, (_, i) => grant(i)), membership_plans: [{ _id: "plan", status: "active" }] });
  const repeatedGet = repeated.db.get; let planReads = 0;
  repeated.db.get = async (...args: any[]) => { if (args[0] === "membership_plans") planReads++; return repeatedGet(...args); };
  expect(await currentUserCan(repeated, "media.read")).toBe(true);
  expect(planReads).toBe(1);
  expect(await currentUserCan(repeated, "media.read")).toBe(true);
  expect(planReads).toBe(2); // No cross-call cache in a mutable transaction.
});

test("capability augmentation preserves expiry, plan status and plugin checks", async () => {
  const now = Date.now();
  for (const [status, dates, allowed] of [["active", { endsAt: now + 60_000 }, true], ["active", { endsAt: now - 1 }, false], ["grace", { graceEndsAt: now + 60_000 }, true], ["grace", { graceEndsAt: now - 1 }, false]] as const) {
    const ctx = fixture({ roles: [{ _id: "base", slug: "subscriber", type: "customer", level: 20, status: "active", capabilities: [] }], membership_grants: [{ ...grant(0, status), ...dates }], membership_plans: [{ _id: "plan", status: "active", linkedCapabilities: ["media.read"] }] });
    expect(await currentUserCan(ctx, "media.read")).toBe(allowed);
    ctx.tables.membership_plans[0].status = "inactive";
    expect(await currentUserCan(ctx, "media.read")).toBe(false);
    ctx.tables.membership_plans[0].status = "active";
    ctx.tables.settings[0].values.membershipEnabled = false;
    expect(await currentUserCan(ctx, "media.read")).toBe(false);
  }
});

test("real nested grant handlers see pending grants and revocations after an outer pagination read", async () => {
  const { convexTest } = await import("convex-test");
  const { default: schema } = await import("../../schema");
  const t = convexTest({ schema, modules: {
    "./convex/_generated/api.js": () => import("../../_generated/api.js"),
    "./convex/_generated/server.js": () => import("../../_generated/server.js"),
    "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  } });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Subscriber", slug: "subscriber", description: "Fixture", level: 20, type: "customer", isDefault: false, isProtected: false, capabilities: [], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "fixture@example.invalid", emailVerified: true, roleId: role, status: "active", createdAt: 1, updatedAt: 1 });
    const plan = await ctx.db.insert("membership_plans", { title: "Fixture", slug: "fixture", status: "active", grantMode: "manual", linkedCapabilities: ["media.read"], priority: 1, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: true }, updatedAt: 1, updatedBy: user });
    return { user, plan };
  });
  const authenticated = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  await authenticated.run(async ctx => {
    await ctx.db.query("posts").paginate({ cursor: null, numItems: 1 });
    expect(await currentUserCan(ctx, "media.read")).toBe(false);
    const id = await ctx.db.insert("membership_grants", { userId: ids.user, planId: ids.plan, sourceType: "manual", status: "grace", startsAt: 1, graceEndsAt: Date.now() + 60_000, createdAt: 1, updatedAt: 1 });
    expect(await currentUserCan(ctx, "media.read")).toBe(true);
    await ctx.db.patch("membership_grants", id, { status: "revoked" });
    expect(await currentUserCan(ctx, "media.read")).toBe(false);
  });
});
