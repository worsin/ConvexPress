import { test, expect } from "bun:test";
import { getFunctionName } from "convex/server";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { begin, finish, failReview, get } from "../records";
import { runReview, boundedSiteFetch, preview, type ReviewTransport } from "../review";
import { CURRENT_SITE_CONTRACT_VERSION } from "@convexpress/site-contract";
import { hash } from "../policy";
import type { ContentPromotionManifest } from "@convexpress/site-contract/content-promotion";
import { fixture, modules, addReusableTransfer } from "./harness";
test('controller review includes reusable source revisions as authored content',async()=>{
 const f=await fixture();addReusableTransfer(f);
 const result=await runReview(f.context,f.args,f.remote);
 expect(result.status).toBe('reviewed');expect(result.canApply).toBe(true);expect(result.recordCount).toBe(2);
 const shared=result.authoredRecords.find(r=>r.kind==='syncedBlock');expect(shared?.key).toBe('synced:source-shared');expect(JSON.parse(shared!.dataJson).revisions[0].title).toBe('Shared studio section');expect(result.changes).toHaveLength(2);
});
test("broker review stores authored hashes and sanitized readiness; duplicate request does not exchange sessions again",async()=>{
  const f=await fixture();const result=await runReview(f.context,f.args,f.remote);
  expect(result.status).toBe("reviewed");expect(result.reviewReady).toBe(true);expect(result.canApply).toBe(true);expect(result.recordCount).toBe(1);expect(JSON.parse(result.authoredRecords[0].dataJson).title).toBe("Aster");
  expect(JSON.stringify(result)).not.toContain("opaque-");expect(JSON.stringify(result)).not.toContain("manifestJson");expect(JSON.stringify(result)).not.toContain("site-review");
  const count=f.calls.length;expect(await runReview(f.context,f.args,f.remote)).toEqual(result);expect(f.calls.filter(c=>c==="siteBroker/session:exchange")).toHaveLength(2);expect(f.calls.length).toBe(count+1);
  const stored=await f.t.run(ctx=>ctx.db.get(result.receiptId));expect(stored!.manifestHash).toBeTruthy();expect(stored!.sourceRevisionHash).toBeTruthy();expect(JSON.stringify(stored)).not.toContain("opaque-");
  expect(f.calls.some(c=>/snapshot|apply/.test(c))).toBe(false);
});
test("broker rejects a target review that changes the kind of an authored record",async()=>{
  const f=await fixture();const real=f.remote.dryRun;f.remote.dryRun=async(...args)=>{const result=await real(...args) as any;result.changes[0].kind="membership_grants";return result;};
  expect((await runReview(f.context,f.args,f.remote)).status).toBe("failed");
});

test("broker never forwards echoed session material to a target dry-run",async()=>{
  const f=await fixture();const original=f.remote.export;let targetCalls=0;
  f.remote.export=async(...args)=>{const result=await original(...args) as any;result.manifest.records[0].data.title="opaque-source-session-secret";return result;};
  f.remote.dryRun=async()=>{targetCalls++;throw new Error("must not run");};
  expect((await runReview(f.context,f.args,f.remote)).status).toBe("failed");expect(targetCalls).toBe(0);
});
test("broker rejects a ready claim when required target media is not bound",async()=>{
  const f=await fixture();const original=f.remote.export;
  f.remote.export=async(...args)=>{const result=await original(...args) as any;result.manifest.records.push({key:"media:photo",kind:"media",sourceRevision:"media1",data:{title:"Photo",fileName:"photo.png",slug:"photo",mimeType:"image/png",mediaType:"image",fileSize:10,sha256:"a".repeat(64)}});return result;};
  const result=await runReview(f.context,f.args,f.remote);expect(result.reviewReady).toBe(false);expect(result.status).toBe("failed");
});

test("broker refuses cross-environment identity, version and authorization failures before a session exchange",async()=>{
  for(const change of ["same-instance","cross-website","wrong-kind","version","disconnected","restricted"]){
    const f=await fixture();
    if(change==="same-instance") f.args.targetConnectionId=f.ids.source.connection;
    if(change==="cross-website") await f.t.run(async ctx=>{const old=(await ctx.db.get(f.ids.website))!;const {_id,_creationTime,...fields}=old;const website=await ctx.db.insert("overseer_websites",{...fields,websiteKey:"other"});await ctx.db.patch(f.ids.target.instance,{website_id:website});await ctx.db.patch(f.ids.target.connection,{website_id:website});});
    if(change==="wrong-kind") await f.t.run(ctx=>ctx.db.patch(f.ids.target.instance,{kind:"staging"}));
    if(change==="version") await f.t.run(ctx=>ctx.db.patch(f.ids.target.instance,{schemaVersion:"future"}));
    if(change==="disconnected") await f.t.run(ctx=>ctx.db.patch(f.ids.target.connection,{status:"revoked"}));
    if(change==="restricted") await f.t.run(ctx=>ctx.db.patch(f.ids.operator,{role:"member"}));
    await expect(runReview(f.context,f.args,f.remote)).rejects.toThrow();expect(f.calls.filter(c=>c==="siteBroker/session:exchange")).toHaveLength(0);
    expect(await f.t.run(ctx=>ctx.db.query("overseer_contentPromotionReviews").collect())).toHaveLength(0);
  }
});
test("review request collisions, stale authority and expired receipts cannot silently replay",async()=>{
  const f=await fixture();const result=await runReview(f.context,f.args,f.remote);
  await expect(runReview(f.context,{...f.args,requestJson:JSON.stringify({...f.request,selection:{...f.request.selection,pageIds:["different-page"]}})},f.remote)).rejects.toThrow("different review");
  await f.t.run(ctx=>ctx.db.patch(f.ids.target.connection,{credentials:{encrypted:"rotated-fixture",iv:"fixture",authTag:"fixture",version:2}}));
  const conflict=await f.invoke(get,{receiptId:result.receiptId});expect(conflict.status).toBe("conflict");expect(conflict.reviewReady).toBe(false);expect(conflict.canApply).toBe(false);
  await expect(runReview(f.context,f.args,f.remote)).rejects.toThrow("identity changed");
  const second=await fixture();const ready=await runReview(second.context,second.args,second.remote);await second.t.run(ctx=>ctx.db.patch(ready.receiptId,{expiresAt:1}));
  const expired=await second.invoke(get,{receiptId:ready.receiptId});expect(expired.status).toBe("expired");expect(expired.mediaReady).toBe(false);await expect(runReview(second.context,second.args,second.remote)).rejects.toThrow("expired");
});
test("broker finalization rechecks authority after network work and hides receipts from other operators",async()=>{
  const f=await fixture();const original=f.remote.dryRun;f.remote.dryRun=async(...args)=>{await f.t.run(ctx=>ctx.db.patch(f.ids.target.connection,{credentials:{encrypted:"changed-in-flight",iv:"fixture",authTag:"fixture",version:2}}));return original(...args);};
  const result=await runReview(f.context,f.args,f.remote);expect(result.status).toBe("conflict");expect(result.reviewReady).toBe(false);
  const stored=await f.t.run(ctx=>ctx.db.get(result.receiptId));expect(stored!.manifestJson).toBeUndefined();expect(stored!.status).toBe("failed");
  await expect(f.invoke(get,{receiptId:result.receiptId},f.ids.other)).rejects.toThrow();
});
test("broker stores missing-media conflicts but strips remote tokens and download URLs from public output",async()=>{
  const f=await fixture();const original=f.remote.export;f.remote.export=async(...args)=>{const result=await original(...args) as any;result.downloadUrls=[{key:"media:photo",url:"https://source.example/private-download"}];result.manifest.records.push({key:"media:photo",kind:"media",sourceRevision:"photo1",data:{title:"Photo",fileName:"photo.png",slug:"photo",mimeType:"image/png",mediaType:"image",fileSize:10,sha256:"a".repeat(64)}});return result;};
  f.remote.dryRun=async(_target,_token,manifest)=>({ready:false,digest:hash(manifest),receiptId:null,changes:[],issues:[{code:"MEDIA_UPLOAD_REQUIRED",key:"media:photo",path:"storageId",message:"Upload verified media to the target"}]});
  const result=await runReview(f.context,f.args,f.remote);expect(result.status).toBe("blocked");expect(result.mediaRequired).toBe(1);expect(result.mediaProvided).toBe(0);expect(result.mediaReady).toBe(false);expect(result.canApply).toBe(false);
  expect(JSON.stringify(result)).not.toContain("private-download");expect(JSON.stringify(await f.t.run(ctx=>ctx.db.get(result.receiptId)))).not.toContain("private-download");
});
test("malformed source identity and secret-bearing site errors cannot become ready or leak through receipts",async()=>{
  const f=await fixture();const original=f.remote.export;let dryRuns=0;f.remote.export=async(...args)=>{const result=await original(...args) as any;result.manifest.source.instanceKey="other-site";return result;};f.remote.dryRun=async()=>{dryRuns++;throw new Error("opaque-target-session-secret");};
  const result=await runReview(f.context,f.args,f.remote);expect(result.status).toBe("failed");expect(dryRuns).toBe(0);expect(result.failureCode).toBe("SITE_REVIEW_FAILED");expect(JSON.stringify(result)).not.toContain("opaque-");
});
test("bounded transport refuses redirected destinations and oversized chunked responses",async()=>{
  const called:string[]=[];
  const fetcher=(async(input:any,init:any)=>{called.push(String(input));expect(init.redirect).toBe("error");return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(2_000_001));controller.close();}}));}) as typeof fetch;
  const guarded=boundedSiteFetch("https://aster-live.convex.cloud",fetcher);
  await expect(guarded("https://elsewhere.example/api/query")).rejects.toThrow("Unexpected");expect(called).toHaveLength(0);
  await expect(guarded("https://aster-live.convex.cloud/api/query",{method:"POST"})).rejects.toThrow("exceeds review bound");expect(called).toHaveLength(1);
});

test("registered preview uses only public export/dryRun HTTP APIs with scoped bearer sessions",async()=>{
  const f=await fixture();f.request.selection.pageIds=[];const originalFetch=globalThis.fetch;const paths:string[]=[];
  globalThis.fetch=(async(input:any,init:any)=>{
    const url=new URL(String(input));const body=JSON.parse(init.body);paths.push(body.path);
    expect(init.headers.Authorization).toBe(url.hostname.includes("staging")?"Bearer opaque-source-session-secret":"Bearer opaque-target-session-secret");
    expect(init.redirect).toBe("error");expect(["/api/query","/api/mutation"]).toContain(url.pathname);
    const value=body.path==="contentPromotion/operations:exportManifest"?{manifest:{version:1,source:{...body.args[0].target,instanceKey:"aster:staging",deploymentOrigin:"https://aster-staging.convex.cloud",siteOrigin:"https://staging.aster.example",environmentKind:"staging"},target:body.args[0].target,selection:body.args[0].selection,records:[],dependencies:[],issues:[]},downloadUrls:[]}:{ready:true,digest:hash(body.args[0].manifest),receiptId:"site-review",issues:[],changes:[]};
    return new Response(JSON.stringify({status:"success",value}),{headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;
  try {const result=await (preview as any)._handler(f.context,{sourceConnectionId:f.args.sourceConnectionId,targetConnectionId:f.args.targetConnectionId,...f.request});expect(result.status).toBe("reviewed");expect(result.canApply).toBe(false);expect(paths).toEqual(["contentPromotion/operations:exportManifest","contentPromotion/operations:dryRun"]);}finally{globalThis.fetch=originalFetch;}
});

test("broker refuses exports that silently omit an explicitly selected record",async()=>{
  const f=await fixture();const original=f.remote.export;f.remote.export=async(...args)=>{const result=await original(...args) as any;result.manifest.records=[];return result;};
  expect((await runReview(f.context,f.args,f.remote)).status).toBe("failed");
});

test("known unsupported-adapter failures retain an actionable code without persisting the remote error body",async()=>{
  const f=await fixture();f.remote.export=async()=>{throw {data:{code:"CATALOG_ADAPTER_REQUIRED",message:"opaque-source-session-secret"}};};
  const result=await runReview(f.context,f.args,f.remote);expect(result.failureCode).toBe("CATALOG_ADAPTER_REQUIRED");expect(JSON.stringify(await f.t.run(ctx=>ctx.db.get(result.receiptId)))).not.toContain("opaque-");
});
test('required route-policy selection retains a safe actionable code without remote error content',async()=>{
 const f=await fixture();f.remote.export=async()=>{throw{data:{code:'ROUTE_POLICY_SELECTION_REQUIRED',message:'opaque-source-session-secret'}};};
 const result=await runReview(f.context,f.args,f.remote);
 expect(result.failureCode).toBe('ROUTE_POLICY_SELECTION_REQUIRED');expect(result.canApply).toBe(false);
 expect(JSON.stringify(await f.t.run(ctx=>ctx.db.get(result.receiptId)))).not.toContain('opaque-');
});

test("every broker endpoint exports an explicit finite return validator", () => {
  for (const fn of [begin, finish, failReview, get, preview]) {
    const shape = JSON.parse((fn as unknown as { exportReturns(): string }).exportReturns());
    expect(shape).not.toBeNull();
    expect(JSON.stringify(shape)).not.toContain('"type":"any"');
  }
});

test("public read revalidates persisted authored data before serializing a DTO", async () => {
  const f = await fixture(); const result = await runReview(f.context, f.args, f.remote);
  expect("data" in result.authoredRecords[0]).toBe(false);
  expect(JSON.parse(result.authoredRecords[0].dataJson).title).toBe("Aster");
  await f.t.run(async ctx => {
    const row = (await ctx.db.get(result.receiptId))!;
    const manifest = JSON.parse(row.manifestJson!); manifest.records[0].data.password = "never-export-unvalidated";
    await ctx.db.patch(row._id, { manifestJson: JSON.stringify(manifest) });
  });
  await expect(f.invoke(get, { receiptId: result.receiptId })).rejects.toThrow();
});

test("Convex enforces the registered public return contract and refuses malformed eligibility or raw data", async () => {
  const f = await fixture(); let result: unknown = await runReview(f.context, f.args, f.remote);
  const { query } = await import("../../_generated/server");
  const { reviewResultValidator } = await import("../validators");
  // This adapter supplies real handler output to Convex's runtime validator, without mocking its validation.
  const checked = query({ args: {}, returns: reviewResultValidator, handler: async () => result as ReturnType<typeof import("../records").publicReceipt> });
  const checkedTest = convexTest({ schema, modules: { ...modules, "./convex/contract.js": async () => ({ checked }) } });
  const ref = (await import("convex/server")).makeFunctionReference<"query">("contract:checked");
  expect((await checkedTest.query(ref, {})).canApply).toBe(true);
  result = { ...result as object, canApply: "not-a-boolean" };
  await expect(checkedTest.query(ref, {})).rejects.toThrow();
  result = await runReview(f.context, f.args, f.remote);
  const valid = result as ReturnType<typeof import("../records").publicReceipt>;
  result = { ...valid, authoredRecords: valid.authoredRecords.map(record => ({ ...record, data: JSON.parse(record.dataJson) })) };
  await expect(checkedTest.query(ref, {})).rejects.toThrow();
});

test("broker transports explicitly selected product tags and refuses an omitted selected tag", async () => {
  for (const included of [true,false]) {
    const f = await fixture();
    const request = {...f.request,selection:{...f.request.selection,pageIds:[],productTagIds:["source-tag"]}};
    const original = f.remote.export;
    f.remote.export = async (...args) => {
      const result = await original(...args);
      result.manifest.records = included ? [{key:"productTag:source-tag",kind:"productTag",sourceRevision:"r1",data:{name:"Studio",slug:"studio",isVisible:true}}] : [];
      return result;
    };
    const result = await runReview(f.context,{...f.args,requestJson:JSON.stringify(request)},f.remote);
    expect(result.reviewReady).toBe(included);
    if (!included) expect(result.status).toBe("failed");
  }
});

test('broker transports selected language settings and empty groups and refuses an omitted language aggregate',async()=>{
 for(const included of [true,false]){
  const f=await fixture();const request={...f.request,selection:{...f.request.selection,pageIds:[],includeLocalization:true,localeGroupKeys:['removed-guide']}};
  const original=f.remote.export;
  f.remote.export=async(...args)=>{const result=await original(...args);result.manifest.records=included?[
   {key:'localeRouting:site',kind:'localeRouting',sourceRevision:'r1',data:{key:'site',enabled:false,locales:[]}},
   {key:'localeGroup:removed',kind:'localeGroup',sourceRevision:'g1',data:{key:'removed-guide',translations:[]}},
  ]:[];return result;};
  const result=await runReview(f.context,{...f.args,requestJson:JSON.stringify(request)},f.remote);
  expect(result.reviewReady).toBe(included);if(included)expect(result.authoredRecords.map(r=>r.kind)).toEqual(['localeRouting','localeGroup']);else expect(result.status).toBe('failed');
 }
});
