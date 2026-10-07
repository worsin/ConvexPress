import { test, expect } from "bun:test";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { runReview } from "../review";
import { runApply, execute, type ApplyTransport } from "../apply";
import * as applyRecords from "../applyRecords";
import { hash } from "../policy";
import { fixture, addReusableTransfer } from "./harness";

async function applyFixture(configure?: (value: Awaited<ReturnType<typeof fixture>>) => Promise<Partial<ApplyTransport>>) {
  const f = await fixture();
  const overrides = await configure?.(f);
  const review = await runReview(f.context, f.args, f.remote);
  const stored = (await f.t.run(ctx => ctx.db.get(review.receiptId)))!;
  const confirmation = { receiptId: review.receiptId, expectedReviewFingerprint: review.reviewFingerprint, confirmLive: true as const };
  const calls: string[] = []; let targetApplied = false; let targetWrites = 0;
  const functions = { claim: applyRecords.claim, dispatch: applyRecords.dispatch, finish: applyRecords.finish };
  const context = { ...f.context, runMutation: async (ref: any, args: any) => { const name = getFunctionName(ref); calls.push(name); return f.invoke(functions[name.split(":")[1] as keyof typeof functions], args); }, runQuery: async (_ref: any, args: any) => f.invoke(applyRecords.get, args) };
  const remote: ApplyTransport = {
    retire: async () => { throw new Error("Retirement requires a real expired target receipt"); },
    status: async (target, _token, receiptId) => { calls.push("target.status"); return { receiptId, digest: stored.siteDigest, status: targetApplied ? "applied" : "ready", targetInstanceKey: target.identity.instanceKey, expiresAt: Date.now() + 60_000 }; },
    export: async (...args) => { calls.push("source.export"); return f.remote.export(...args); },
    apply: async (_target, _token, receiptId, digest) => { calls.push("target.apply"); if (!targetApplied) targetWrites++; targetApplied = true; return { receiptId, digest, status: "applied", mappings: [{ key: "page:source-page", kind: "page", targetId: "target-page" }] }; },
  };
  return { ...f, reviewContext: f.context, reviewRemote: f.remote, review, stored, confirmation, context, remote: { ...remote, ...overrides }, calls, writes: () => targetWrites };
}

test("ready apply checks source and target status, then dispatches only the original receipt and confirms mappings", async () => {
  const f = await applyFixture(); const result = await runApply(f.context, f.confirmation, f.remote);
  expect(result.status).toBe("applied"); expect(result.mappings).toEqual([{ key: "page:source-page", kind: "page", targetId: "target-page" }]);
  expect(result.sourceCheckedAt).toBeTruthy(); expect(result.canApply).toBe(false);
  expect(f.calls.indexOf("target.status")).toBeLessThan(f.calls.indexOf("source.export")); expect(f.calls.indexOf("source.export")).toBeLessThan(f.calls.indexOf("target.apply"));
  expect(f.writes()).toBe(1); const before = [...f.calls]; const retry = await runApply(f.context, f.confirmation, f.remote);
  expect(retry).toEqual(result); expect(f.writes()).toBe(1); expect(f.calls.filter(call => call === "target.apply")).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("opaque-"); expect(f.calls.some(call => /dryRun|snapshot|upload|rollback/.test(call))).toBe(false); expect(f.calls.length).toBe(before.length + 1);
});
test('controller accepts the exact reusable mapping set and rejects changed source revisions before dispatch',async()=>{
 const f=await applyFixture(async value=>{addReusableTransfer(value);return{apply:async(_target,_token,receiptId,digest)=>({receiptId,digest,status:'applied',mappings:[{key:'page:source-page',kind:'page',targetId:'target-page'},{key:'synced:source-shared',kind:'syncedBlock',targetId:'target-shared'}]})};});
 const result=await runApply(f.context,f.confirmation,f.remote);expect(result.status).toBe('applied');expect(result.mappings).toHaveLength(2);
 const changed=await applyFixture(async value=>{addReusableTransfer(value);return{};});
 const read=changed.remote.export;
 changed.remote.export=async(...args)=>{const value=await read(...args) as any;value.manifest.synced.sources[0].generation++;return value;};
 const refused=await runApply(changed.context,changed.confirmation,changed.remote);expect(refused.status).toBe('rejected');expect(refused.failureCode).toBe('SOURCE_CHANGED');expect(changed.writes()).toBe(0);
});

test("confirmation, fingerprint, expiry, blocked review and operator scope fail before any target transport", async () => {
  const f = await applyFixture();
  await expect(runApply(f.context, { ...f.confirmation, confirmLive: false } as unknown as typeof f.confirmation, f.remote)).rejects.toThrow();
  await expect(runApply(f.context, { ...f.confirmation, expectedReviewFingerprint: "0".repeat(64) }, f.remote)).rejects.toThrow();
  await expect(f.invoke(applyRecords.claim, { ...f.confirmation, leaseId: "lease-other" }, f.ids.other)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch(f.review.receiptId, { status: "blocked" }));
  await expect(runApply(f.context, f.confirmation, f.remote)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch(f.review.receiptId, { status: "reviewed", expiresAt: 1 }));
  await expect(runApply(f.context, f.confirmation, f.remote)).rejects.toThrow();
  expect(f.calls.filter(call => call.startsWith("target."))).toHaveLength(0);
});

test("source value, revision, selection, dependency and media metadata drift cannot dispatch", async () => {
  for (const change of [
    (manifest: any) => { manifest.records[0].data.title = "Changed"; },
    (manifest: any) => { manifest.records[0].sourceRevision = "Changed"; },
    (manifest: any) => { manifest.selection.includePresentation = true; },
    (manifest: any) => { manifest.selection.includeRoutePolicies = true; },
    (manifest: any) => { manifest.selection.includeLocalization = true; manifest.records.push({key:"localeRouting:site",kind:"localeRouting",sourceRevision:"r1",data:{key:"site",enabled:false,locales:[]}}); },
    (manifest: any) => { manifest.selection.includeLocalization = true; manifest.selection.localeGroupKeys = ["guide"]; manifest.records.push({key:"localeRouting:site",kind:"localeRouting",sourceRevision:"r1",data:{key:"site",enabled:false,locales:[]}},{key:"localeGroup:guide",kind:"localeGroup",sourceRevision:"g1",data:{key:"guide",translations:[]}}); },
    (manifest: any) => { manifest.dependencies.push({ key: "plugin:events", kind: "plugin", requiredBy: ["page:source-page"] }); },
    (manifest: any) => { manifest.records.push({ key: "media:new", kind: "media", sourceRevision: "media-new", data: { title: "New", fileName: "new.png", slug: "new", mimeType: "image/png", mediaType: "image", fileSize: 2, sha256: "a".repeat(64) } }); },
  ]) {
    const f = await applyFixture(); const original = f.remote.export;
    f.remote.export = async (...args) => { const result = await original(...args) as any; change(result.manifest); return result; };
    const result = await runApply(f.context, f.confirmation, f.remote);
    expect(result.status).toBe("rejected"); expect(result.failureCode).toBe("SOURCE_CHANGED"); expect(f.writes()).toBe(0);
  }
});

test("changing transport download URLs do not change the reviewed authored fingerprint", async () => {
  const f = await applyFixture(); const original = f.remote.export;
  f.remote.export = async (...args) => { const result = await original(...args) as any; result.downloadUrls = [{ key: "transport-only", url: "https://source.example/new-signed-download" }]; return result; };
  expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("applied"); expect(f.writes()).toBe(1);
});

test("lost target response recovers applied status before any new source export or target write", async () => {
  const f = await applyFixture(); const original = f.remote.apply;
  f.remote.apply = async (...args) => { await original(...args); throw new Error("opaque-target-session-secret response lost"); };
  const first = await runApply(f.context, f.confirmation, f.remote); expect(first.status).toBe("uncertain"); expect(first.mappings).toBeNull();
  const exports = f.calls.filter(call => call === "source.export").length;
  const recovered = await runApply(f.context, f.confirmation, f.remote);
  expect(recovered.status).toBe("applied"); expect(recovered.mappings).toBeNull(); expect(f.writes()).toBe(1);
  expect(f.calls.filter(call => call === "source.export")).toHaveLength(exports); expect(JSON.stringify(recovered)).not.toContain("opaque-");
});

test("target remains ready after an uncertain dispatch: retry rechecks source and reuses exact receipt", async () => {
  const f = await applyFixture(); const original = f.remote.apply; let attempts = 0; const receipts: string[] = [];
  f.remote.apply = async (...args) => { receipts.push(`${args[2]}:${args[3]}`); if (++attempts === 1) throw new Error("Request did not arrive"); return original(...args); };
  expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("uncertain");
  expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("applied");
  expect(new Set(receipts).size).toBe(1); expect(f.calls.filter(call => call === "source.export")).toHaveLength(2); expect(f.writes()).toBe(1);
});

test("source change after uncertain dispatch preserves uncertainty and never retries stale authored values", async () => {
  const f = await applyFixture(); f.remote.apply = async () => { throw new Error("Unknown arrival"); };
  expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("uncertain");
  const original = f.remote.export; f.remote.export = async (...args) => { const result = await original(...args) as any; result.manifest.records[0].data.title = "Changed"; return result; };
  const recovered = await runApply(f.context, f.confirmation, f.remote); expect(recovered.status).toBe("uncertain"); expect(recovered.failureCode).toBe("SOURCE_CHANGED"); expect(recovered.dispatchCount).toBe(1);
});

test("active and stale leases prevent concurrent dispatch and reject a replaced claimant", async () => {
  const f = await applyFixture();
  const first = await f.invoke(applyRecords.claim, { ...f.confirmation, leaseId: "lease-first" });
  const concurrent = await f.invoke(applyRecords.claim, { ...f.confirmation, leaseId: "lease-second" }); expect(concurrent.work).toBeNull();
  await f.t.run(ctx => ctx.db.patch(first.applyId, { leaseExpiresAt: 1 }));
  expect((await f.invoke(applyRecords.claim, { ...f.confirmation, leaseId: "lease-third" })).work).toBeTruthy();
  await expect(f.invoke(applyRecords.dispatch, { applyId: first.applyId, leaseId: "lease-first", sourceManifestJson: f.stored.manifestJson })).rejects.toThrow();
  expect(f.writes()).toBe(0);
});

test("target atomic conflict is recorded as rejected without claiming a successful write", async () => {
  const f = await applyFixture(); f.remote.apply = async () => { throw { data: { code: "PROMOTION_CONFLICT", message: "Private provider details" } }; };
  const result = await runApply(f.context, f.confirmation, f.remote); expect(result.status).toBe("rejected"); expect(result.failureCode).toBe("PROMOTION_CONFLICT"); expect(f.writes()).toBe(0); expect(JSON.stringify(result)).not.toContain("Private provider");
});

test("lost CP acknowledgement does not overwrite an already recorded applied outcome", async () => {
  const f = await applyFixture(); const original = f.context.runMutation;
  f.context.runMutation = async (ref: any, args: any) => { const result = await original(ref, args); if (getFunctionName(ref).endsWith(":finish") && args.outcome === "applied") throw new Error("CP response lost"); return result; };
  const result = await runApply(f.context, f.confirmation, f.remote); expect(result.status).toBe("applied"); expect(f.writes()).toBe(1);
});

test("mismatched mappings or secret-bearing target responses remain uncertain and cannot be persisted", async () => {
  for (const targetId of ["opaque-target-session-secret", "target-page"]) {
    const f = await applyFixture(); f.remote.apply = async (_target, _token, receiptId, digest) => ({ receiptId, digest, status: "applied", mappings: [{ key: targetId === "target-page" ? "unselected" : "page:source-page", kind: "page", targetId }] });
    const result = await runApply(f.context, f.confirmation, f.remote); expect(result.status).toBe("uncertain"); expect(result.mappings).toBeNull();
    expect(JSON.stringify(await f.t.run(ctx => ctx.db.get(result.applyId)))).not.toContain("opaque-");
  }
});

test("all registered apply functions have finite explicit return validators", () => {
  for (const fn of [applyRecords.claim, applyRecords.dispatch, applyRecords.finish, applyRecords.get, execute]) {
    const shape = JSON.parse((fn as unknown as { exportReturns(): string }).exportReturns()); expect(shape).not.toBeNull(); expect(JSON.stringify(shape)).not.toContain('"type":"any"');
  }
});

test("expired review or rotated authority permits only status recovery of a prior dispatch", async () => {
  for (const applied of [true, false]) {
    const f = await applyFixture(); const original = f.remote.apply;
    f.remote.apply = async (...args) => { if (applied) await original(...args); throw new Error("Lost target response"); };
    expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("uncertain");
    await f.t.run(async ctx => { const connection = (await ctx.db.get(f.ids.target.connection))!; await ctx.db.patch(connection._id, { credentials: { ...connection.credentials!, version: 2 } }); });
    const originalNow = Date.now; Date.now = () => f.stored.expiresAt + 1;
    try {
      const count = f.calls.filter(call => call === "source.export").length;
      const result = await runApply(f.context, f.confirmation, f.remote);
      expect(result.status).toBe(applied ? "applied" : "uncertain"); expect(result.dispatchCount).toBe(1);
      expect(f.calls.filter(call => call === "source.export")).toHaveLength(count);
      expect(f.writes()).toBe(applied ? 1 : 0);
    } finally { Date.now = originalNow; }
  }
});

test("credential rotation during source reconciliation is rejected by the final dispatch checkpoint", async () => {
  const f = await applyFixture(); const original = f.remote.export;
  f.remote.export = async (...args) => { const result = await original(...args); await f.t.run(async ctx => { const connection = (await ctx.db.get(f.ids.target.connection))!; await ctx.db.patch(connection._id, { credentials: { ...connection.credentials!, version: 2 } }); }); return result; };
  const result = await runApply(f.context, f.confirmation, f.remote); expect(result.status).toBe("rejected"); expect(result.failureCode).toBe("AUTHORITY_CHANGED"); expect(f.writes()).toBe(0);
});

test("wrong target receipt status and direct rolled-back evidence never dispatch an apply", async () => {
  for (const outcome of ["wrong-digest", "rolled-back"] as const) {
    const f = await applyFixture(); const original = f.remote.status;
    f.remote.status = async (...args) => { const status = await original(...args) as any; return outcome === "wrong-digest" ? { ...status, digest: "0".repeat(64) } : { ...status, status: "rolled-back" }; };
    const result = await runApply(f.context, f.confirmation, f.remote); expect(result.status).toBe(outcome === "wrong-digest" ? "rejected" : "rolled-back"); expect(f.writes()).toBe(0); expect(f.calls.filter(call => call === "source.export")).toHaveLength(0);
  }
});

test("site apply that commits before operator revocation remains recoverable rather than falsely failed", async () => {
  const f = await applyFixture(); const original = f.remote.apply;
  f.remote.apply = async (...args) => { const result = await original(...args); await f.t.run(ctx => ctx.db.patch(f.ids.operator, { isActive: false })); return result; };
  await expect(runApply(f.context, f.confirmation, f.remote)).rejects.toThrow("recovery");
  const row = await f.t.run(ctx => ctx.db.query("overseer_contentPromotionApplies").withIndex("by_receipt", q => q.eq("receiptId", f.review.receiptId)).unique());
  expect(row!.status).toBe("submitting"); expect(f.writes()).toBe(1);
  await f.t.run(async ctx => { await ctx.db.patch(f.ids.operator, { isActive: true }); await ctx.db.patch(row!._id, { leaseExpiresAt: 1 }); });
  expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("applied"); expect(f.writes()).toBe(1);
});

async function canonicalTargetFixture(withMedia = false) {
  const siteSchema = (await import("../../../../backend/convex/schema")).default;
  const site = convexTest({ schema: siteSchema, modules: { "./convex/_generated/server.js": () => import("../../../../backend/convex/_generated/server.js"), "./convex/contentPromotion/operations.ts": () => import("../../../../backend/convex/contentPromotion/operations") } });
  const userId = await site.run(async ctx => {
    const roleId = await ctx.db.insert("roles", { name: "Administrator", slug: "administrator", description: "Fixture", level: 100, type: "internal", status: "active", isDefault: false, isProtected: true, capabilities: ["manage_options", "page.create", "page.update", "page.publish", "page.set_parent", "page.read", "media.read", "media.upload", "media.update"], pageAccess: [], createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { email: "site-operator@example.test", emailVerified: true, status: "active", authSource: "local", roleId, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("convexpress_siteIdentity", { websiteKey: "aster", instanceKey: "aster:live", deploymentOrigin: "https://aster-live.convex.cloud", siteOrigin: "https://live.aster.example", environmentKind: "live", schemaVersion: "1", identityKey: "site-identity", managementOrigin: "https://aster-live.convex.site", siteContractVersion: "1.0.0", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    return user;
  });
  const authed = site.withIdentity({ subject: userId, issuer: "https://convexpress-admin.local" });
  let uploadedStorageId: string | null = null;
  const f = await applyFixture(async current => {
    if (withMedia) {
      const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64"));
      const sha256 = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("base64");
      const storageId = await site.run(ctx => ctx.storage.store(new Blob([bytes], { type: "image/png" }))); uploadedStorageId = storageId;
      current.request.selection.mediaIds.push("source-photo");
      (current.request.mediaBindings as Array<{ key: string; storageId: string }>).push({ key: "media:source-photo", storageId });
      current.args.requestJson = JSON.stringify(current.request);
      const sourceExport = current.remote.export;
      current.remote.export = async (...args) => {
        const result = await sourceExport(...args) as any;
        result.manifest.records[0].data.featuredImageId = "@promotion:media:source-photo";
        result.manifest.records.push({ key: "media:source-photo", kind: "media", sourceRevision: "source-image-v1", data: { title: "Reviewed pixel", fileName: "pixel.png", slug: "pixel", mimeType: "image/png", mediaType: "image", fileSize: bytes.byteLength, sha256, altText: "A single light pixel used for an offline test" } });
        return result;
      };
    }
    current.remote.dryRun = async (_target, _token, manifest, request) => authed.mutation(makeFunctionReference<"mutation">("contentPromotion/operations:dryRun"), { manifest, mediaBindings: request.mediaBindings, dependencyBindings: request.dependencyBindings });
    return {
      status: (_target, _token, receiptId) => authed.query(makeFunctionReference<"query">("contentPromotion/operations:receiptStatus"), { receiptId }),
      retire: (_target, _token, receiptId, expectedDigest) => authed.mutation(makeFunctionReference<"mutation">("contentPromotion/operations:retireExpiredReview"), { receiptId, expectedDigest }),
      apply: (_target, _token, receiptId, expectedDigest) => authed.mutation(makeFunctionReference<"mutation">("contentPromotion/operations:apply"), { receiptId, expectedDigest, confirmLive: true }),
    };
  });
  return { ...f, site, authed, userId, uploadedStorageId };
}

test("expired uncertain promotion is atomically retired without another content dispatch", async () => {
 const f = await canonicalTargetFixture();
 f.remote.apply = async () => { throw new Error("Transport failed before target execution"); };
 expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("uncertain");
 await f.site.run(ctx => ctx.db.patch(f.stored.siteReceiptId as any, { expiresAt: 1 }));
 const result = await runApply(f.context, f.confirmation, f.remote);
 expect(result.status).toBe("rejected"); expect(result.failureCode).toBe("REVIEW_EXPIRED");
 expect(result.dispatchCount).toBe(1); expect(result.recoveryNeeded).toBe(false);
 expect(await f.site.run(ctx => ctx.db.query("posts").collect())).toHaveLength(0);
 expect((await f.site.run(ctx => ctx.db.get(f.stored.siteReceiptId as any)))?.status).toBe("retired");
 expect(await runApply(f.context, f.confirmation, f.remote)).toEqual(result);
});

test("retirement transport and identity failures preserve uncertain dispatch history", async () => {
 for (const mismatch of ["receiptId", "digest", "targetInstanceKey", "status", "secret", "unavailable"]) {
  const f = await canonicalTargetFixture();
  f.remote.apply = async () => { throw new Error("Lost transport"); };
  await runApply(f.context, f.confirmation, f.remote);
  await f.site.run(ctx => ctx.db.patch(f.stored.siteReceiptId as any, { expiresAt: 1 }));
  f.remote.retire = async () => {
   if (mismatch === "unavailable") throw new Error("Old target has no retirement endpoint");
   return { receiptId: f.stored.siteReceiptId, digest: f.stored.siteDigest, targetInstanceKey: "aster:live", expiresAt: 1, status: "retired",
    ...(mismatch === "secret" ? { receiptId: "opaque-target-session-secret" } : { [mismatch]: mismatch === "status" ? "ready" : "wrong" }) };
  };
  const recovered = await runApply(f.context, f.confirmation, f.remote);
  expect(recovered.status).toBe("uncertain"); expect(recovered.dispatchCount).toBe(1);
  expect(JSON.stringify(recovered)).not.toContain("opaque-");
  expect(await f.site.run(ctx => ctx.db.query("posts").collect())).toHaveLength(0);
 }
});

test("canonical read budget is an atomic refusal only from the first content dispatch", async () => {
 const f = await applyFixture();
 f.remote.apply = async () => { throw { data: { code: "CANONICAL_READ_BUDGET", message: "private details" } }; };
 const result = await runApply(f.context, f.confirmation, f.remote);
 expect(result.status).toBe("rejected"); expect(result.failureCode).toBe("CANONICAL_READ_BUDGET"); expect(result.dispatchCount).toBe(1);
 const prior = await applyFixture();
 prior.remote.apply = async () => { throw new Error("Unknown acknowledgement"); };
 await runApply(prior.context, prior.confirmation, prior.remote);
 prior.remote.apply = f.remote.apply;
 const retry = await runApply(prior.context, prior.confirmation, prior.remote);
 expect(retry.status).toBe("uncertain"); expect(retry.dispatchCount).toBe(2);
});

test("lost retirement acknowledgement recovers the durable fence and never dispatches content", async () => {
 const f = await canonicalTargetFixture();
 f.remote.apply = async () => { throw new Error("Lost transport"); };
 await runApply(f.context, f.confirmation, f.remote);
 await f.site.run(ctx => ctx.db.patch(f.stored.siteReceiptId as any, { expiresAt: 1 }));
 const retire = f.remote.retire;
 f.remote.retire = async (...args) => { await retire(...args); throw new Error("Lost retirement response"); };
 expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("uncertain");
 const recovered = await runApply(f.context, f.confirmation, f.remote);
 expect(recovered.status).toBe("rejected"); expect(recovered.dispatchCount).toBe(1);
 expect(await f.site.run(ctx => ctx.db.query("posts").collect())).toHaveLength(0);
});

test("a commit winning the retirement race is recovered as applied", async () => {
 const f = await canonicalTargetFixture(); const apply = f.remote.apply;
 f.remote.apply = async () => { throw new Error("Delayed transport"); };
 await runApply(f.context, f.confirmation, f.remote);
 const read = f.remote.status;
 f.remote.status = async (...args) => ({ ...await read(...args) as object, expiresAt: 1 });
 const retire = f.remote.retire;
 f.remote.retire = async (...args) => { await apply(...args); return retire(...args); };
 const recovered = await runApply(f.context, f.confirmation, f.remote);
 expect(recovered.status).toBe("applied"); expect(recovered.dispatchCount).toBe(1);
 expect(await f.site.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
});

test("broker executes canonical target handlers atomically and recovery never duplicates content or outbound work", async () => {
  const f = await canonicalTargetFixture(); const original = f.remote.apply;
  f.remote.apply = async (...args) => { await original(...args); throw new Error("Canonical mutation committed, transport lost"); };
  expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("uncertain");
  const recovered = await runApply(f.context, f.confirmation, f.remote); expect(recovered.status).toBe("applied"); expect(recovered.mappings).toBeNull();
  const snapshot = await f.site.run(async ctx => ({ posts: await ctx.db.query("posts").collect(), users: await ctx.db.query("users").collect(), orders: await ctx.db.query("commerce_orders").collect(), jobs: await ctx.db.system.query("_scheduled_functions").collect(), receipts: await ctx.db.query("contentPromotion_receipts").collect() }));
  expect(snapshot.posts).toHaveLength(1); expect(snapshot.posts[0].title).toBe("Aster"); expect(snapshot.users).toHaveLength(1); expect(snapshot.orders).toHaveLength(0); expect(snapshot.jobs).toHaveLength(0); expect(snapshot.receipts).toHaveLength(1); expect(snapshot.receipts[0].status).toBe("applied");
});

test("canonical target optimistic checks preserve an editorial change made after review", async () => {
  const f = await canonicalTargetFixture(); expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("applied");
  const request = { ...f.request, requestKey: "aster-second-review" };
  const second = await runReview(f.reviewContext, { ...f.args, requestJson: JSON.stringify(request) }, f.reviewRemote);
  const targetPost = await f.site.run(ctx => ctx.db.query("posts").first());
  await f.site.run(ctx => ctx.db.patch(targetPost!._id, { title: "Production editor keeps this", updatedAt: Date.now() }));
  const rejected = await runApply(f.context, { receiptId: second.receiptId, expectedReviewFingerprint: second.reviewFingerprint, confirmLive: true }, f.remote);
  expect(rejected.status).toBe("rejected"); expect(rejected.failureCode).toBe("PROMOTION_CONFLICT");
  expect((await f.site.run(ctx => ctx.db.get(targetPost!._id)))!.title).toBe("Production editor keeps this");
  expect(await f.site.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
});

test("registered apply action uses only normal receipt-status/export/apply APIs with bounded scoped bearer transport", async () => {
  const f = await applyFixture(); const originalFetch = globalThis.fetch; const paths: string[] = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = new URL(String(input)); const body = JSON.parse(init.body); const args = body.args[0]; paths.push(body.path);
    expect(init.redirect).toBe("error"); expect(init.headers.Authorization).toBe(url.hostname.includes("staging") ? "Bearer opaque-source-session-secret" : "Bearer opaque-target-session-secret");
    const value = body.path.endsWith(":receiptStatus") ? { receiptId: f.stored.siteReceiptId, digest: f.stored.siteDigest, status: "ready", targetInstanceKey: "aster:live", expiresAt: Date.now() + 60_000 }
      : body.path.endsWith(":exportManifest") ? { manifest: JSON.parse(f.stored.manifestJson!), downloadUrls: [] }
      : { receiptId: args.receiptId, digest: args.expectedDigest, status: "applied", mappings: [{ key: "page:source-page", kind: "page", targetId: "target-page" }] };
    if (body.path.endsWith(":apply")) { expect(args.receiptId).toBe(f.stored.siteReceiptId); expect(args.expectedDigest).toBe(f.stored.siteDigest); expect(args.confirmLive).toBe(true); }
    return new Response(JSON.stringify({ status: "success", value }), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try { const result = await (execute as any)._handler(f.context, f.confirmation); expect(result.status).toBe("applied"); expect(paths).toEqual(["contentPromotion/operations:receiptStatus", "contentPromotion/operations:exportManifest", "contentPromotion/operations:apply"]); }
  finally { globalThis.fetch = originalFetch; }
});

test("a CP finalization refusal is not misclassified as an atomic target refusal after target success", async () => {
  const f = await applyFixture(); const original = f.context.runMutation; let refused = false;
  f.context.runMutation = async (ref: any, args: any) => {
    if (!refused && getFunctionName(ref).endsWith(":finish") && args.outcome === "applied") { refused = true; throw { data: { code: "FORBIDDEN" } }; }
    return original(ref, args);
  };
  const result = await runApply(f.context, f.confirmation, f.remote);
  expect(f.writes()).toBe(1); expect(result.status).toBe("uncertain");
  expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("applied");
});

test("already verified target media is reused through canonical apply without any upload or file transfer", async () => {
  const f = await canonicalTargetFixture(true);
  expect(f.review.issues).toEqual([]); expect(f.review.failureCode).toBeNull(); expect(f.review.mediaReady).toBe(true); expect(f.review.mediaRequired).toBe(1); expect(f.review.mediaProvided).toBe(1);
  const result = await runApply(f.context, f.confirmation, f.remote); expect(result.status).toBe("applied"); expect(result.mappings).toHaveLength(2);
  const snapshot = await f.site.run(async ctx => ({ media: await ctx.db.query("media").collect(), posts: await ctx.db.query("posts").collect(), storage: await ctx.db.system.query("_storage").collect(), jobs: await ctx.db.system.query("_scheduled_functions").collect() }));
  expect(snapshot.media).toHaveLength(1); expect(snapshot.storage).toHaveLength(1); expect(snapshot.posts).toHaveLength(1); expect(snapshot.jobs).toHaveLength(0);
  expect(String(snapshot.media[0].storageId)).toBe(f.uploadedStorageId); expect(snapshot.posts[0].featuredImageId).toBe(snapshot.media[0]._id);
});

test("deleting a reviewed target blob before apply fails canonical optimistic checks without recreating it", async () => {
  const f = await canonicalTargetFixture(true);
  await f.site.run(async ctx => { const id = ctx.db.system.normalizeId("_storage", f.uploadedStorageId!); if (id) await ctx.storage.delete(id); });
  const result = await runApply(f.context, f.confirmation, f.remote); expect(result.status).toBe("rejected"); expect(result.failureCode).toBe("PROMOTION_CONFLICT");
  const snapshot = await f.site.run(async ctx => ({ media: await ctx.db.query("media").collect(), posts: await ctx.db.query("posts").collect(), storage: await ctx.db.system.query("_storage").collect() }));
  expect(snapshot.media).toHaveLength(0); expect(snapshot.posts).toHaveLength(0); expect(snapshot.storage).toHaveLength(0);
});

test("a source-read retry before any dispatch does not obscure a later definitive target refusal", async () => {
  const f = await applyFixture(); const original = f.remote.export; let interrupted = false;
  f.remote.export = async (...args) => { if (!interrupted) { interrupted = true; throw new Error("Source read interrupted"); } return original(...args); };
  expect((await runApply(f.context, f.confirmation, f.remote)).status).toBe("uncertain");
  f.remote.apply = async () => { throw { data: { code: "PROMOTION_CONFLICT" } }; };
  const result = await runApply(f.context, f.confirmation, f.remote);
  expect(result.dispatchCount).toBe(1); expect(result.attempt).toBe(2); expect(result.status).toBe("rejected");
});

test("authorized review eligibility comes from current receipt and durable apply state", async () => {
  const f = await applyFixture(); const reviewGet = (await import("../records")).get;
  expect((await f.invoke(reviewGet, { receiptId: f.review.receiptId })).canApply).toBe(true);
  const claimed = await f.invoke(applyRecords.claim, { ...f.confirmation, leaseId: "native-ui-lease" });
  const running = await f.invoke(reviewGet, { receiptId: f.review.receiptId });
  expect(running.canApply).toBe(false); expect(running.reviewReady).toBe(false); expect(running.canRecover).toBe(false); expect(running.applyState.status).toBe("checking");
  await f.t.run(ctx => ctx.db.patch(claimed.applyId, { leaseExpiresAt: 1 }));
  expect((await f.invoke(reviewGet, { receiptId: f.review.receiptId })).canRecover).toBe(true);
  await runApply(f.context, f.confirmation, f.remote);
  const applied = await f.invoke(reviewGet, { receiptId: f.review.receiptId });
  expect(applied.canApply).toBe(false); expect(applied.canRecover).toBe(false); expect(applied.reviewReady).toBe(false); expect(applied.applyState.status).toBe("applied");
});

test("authorized eligibility read refuses stale authority, expired receipts, and another operator", async () => {
  const f = await applyFixture(); const reviewGet = (await import("../records")).get;
  await expect(f.invoke(reviewGet, { receiptId: f.review.receiptId }, f.ids.other)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch(f.review.receiptId, { authorityHash: "changed-authority" }));
  const stale = await f.invoke(reviewGet, { receiptId: f.review.receiptId });
  expect(stale.canApply).toBe(false); expect(stale.canRecover).toBe(false); expect(stale.reviewReady).toBe(false); expect(stale.status).toBe("conflict");
  await f.t.run(ctx => ctx.db.patch(f.review.receiptId, { authorityHash: f.stored.authorityHash, expiresAt: 1 }));
  const expired = await f.invoke(reviewGet, { receiptId: f.review.receiptId });
  expect(expired.canApply).toBe(false); expect(expired.canRecover).toBe(false); expect(expired.applyState).toBeNull(); expect(expired.status).toBe("expired");
});
