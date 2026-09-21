import { expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import { credential, confirm, releaseTags } from "../websitePublish";
import { encryptCredentialPayload } from "../../connections/crypto";
import { hostingCredentialAad } from "../policy";
async function harness(options: { editorOrigin?: string; wrongEditor?: boolean; foreign?: boolean; revoked?: boolean; enabled?: boolean; uploaded?: boolean; wrongRuntime?: boolean; rotated?: boolean; runtimeStatus?: number; wrongResponseRelease?: boolean; wrongOrigin?: boolean }, run: (invoke: (fn: typeof credential | typeof confirm) => Promise<any>, commits: string[]) => Promise<void>) {
  const saved = process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS, previousFetch = globalThis.fetch;
  const key = Buffer.alloc(32, 7); process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = JSON.stringify({ "1": key.toString("base64") });
  const target = { organizationId: "org_alpha", businessId: "business_alpha", accountId: "account_alpha", externalAccountId: "a".repeat(32), workerName: "alpha", artifactHash: "b".repeat(64), instanceKey: "instance_alpha", siteOrigin: "https://alpha.team.workers.dev", deploymentOrigin: "https://alpha.convex.cloud", clerkPublishableKey: "", editorOrigin: options.editorOrigin ?? "", state: "uploading" };
  const credentials = encryptCredentialPayload({ payload: { token: "synthetic-secret-token" }, key, keyVersion: 1, aad: hostingCredentialAad({ ...target, organizationId: target.organizationId as never, businessId: target.businessId as never, provider: "cloudflare" }) });
  const commits: string[] = []; let reads = 0;
  globalThis.fetch = async (input, init) => {
    if (new URL(String(input)).hostname.endsWith(".workers.dev")) {
      expect(init?.redirect).toBe("error");
      return new Response("<!doctype html><html><body>Actual page</body></html>", { status: options.runtimeStatus ?? 200, headers: { "content-type": "text/html", "x-convexpress-instance": target.instanceKey, "x-convexpress-release": options.wrongResponseRelease ? "old_release" : "release_alpha", "x-convexpress-artifact": target.artifactHash } });
    }
    const url = new URL(String(input)); let result: unknown = { id: target.externalAccountId, name: "Synthetic team" };
    if (url.pathname.endsWith("/workers/subdomain")) result = { subdomain: options.wrongOrigin ? "different" : "team" };
    else if (url.pathname.endsWith("/settings")) result = { tags: options.foreign ? ["convexpress-instance:foreign"] : options.uploaded === false ? ["convexpress-instance:instance_alpha"] : releaseTags(target.instanceKey, "release_alpha", target.artifactHash), bindings: Object.entries({ CONVEXPRESS_INSTANCE_KEY: options.wrongRuntime ? "other_instance" : target.instanceKey, CONVEXPRESS_CONVEX_URL: target.deploymentOrigin, CONVEXPRESS_SITE_URL: target.siteOrigin, CONVEXPRESS_RELEASE_ID: "release_alpha", CONVEXPRESS_ARTIFACT_HASH: target.artifactHash, ...(target.editorOrigin ? { CONVEXPRESS_ADMIN_APP_URL: options.wrongEditor ? "https://other.example" : target.editorOrigin } : {}) }).map(([name, text]) => ({ name, text, type: "plain_text" })) };
    else if (url.pathname.endsWith("/subdomain")) result = { enabled: options.enabled !== false };
    return new Response(JSON.stringify({ success: true, result }));
  };
  const account = { ...target, provider: "cloudflare", revision: 1, credentialGeneration: 0, credentialState: "ready", credentials };
  const ctx = {
    runQuery: async (ref: any) => {
      reads++; if (options.revoked && reads > 1) throw Error("Account revoked");
      return { ...account, credentialGeneration: options.rotated && getFunctionName(ref) === "hosting/websiteReleases:prepare" && reads > 1 ? 1 : 0 };
    },
    runMutation: async (ref: any, args: any) => {
      if (getFunctionName(ref) === "hosting/cloudflareOAuthRecords:claimRefresh") return { ...account, disposition: "use" };
      if (getFunctionName(ref) !== "hosting/websiteReleases:complete") throw Error("Unexpected internal mutation");
      commits.push(args.verification.result === "verified" ? "complete" : "failed"); return null;
    },
  };
  try { await run((fn) => (fn as any)._handler(ctx, { releaseId: "release_alpha", leaseToken: "synthetic-lease" }), commits); }
  finally { globalThis.fetch = previousFetch; if (saved === undefined) delete process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS; else process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = saved; }
}
test("credential release fails closed for foreign Workers and concurrent revocation", async () => {
  await harness({ foreign: true }, async (invoke) => { await expect(invoke(credential)).rejects.toThrow("another deployment"); });
  await harness({ revoked: true }, async (invoke) => { await expect(invoke(credential)).rejects.toThrow("revoked"); });
});
test("confirmed Worker tags reconcile upload, completion verifies tags and enabled address", async () => {
  await harness({}, async (invoke, commits) => { expect((await invoke(credential)).alreadyUploaded).toBe(true); await invoke(confirm); expect(commits).toEqual(["complete"]); });
  await harness({ uploaded: false }, async (invoke, commits) => { await expect(invoke(confirm)).rejects.toThrow("not confirmed"); expect(commits.length).toBe(0); });
  await harness({ enabled: false }, async (invoke, commits) => { await expect(invoke(confirm)).rejects.toThrow("not enabled"); expect(commits.length).toBe(0); });
});

test("matching release tags cannot hide external changes to runtime bindings", async () => {
  await harness({ wrongRuntime: true }, async (invoke, commits) => {
    await expect(invoke(credential)).rejects.toThrow("runtime no longer matches");
    await expect(invoke(confirm)).rejects.toThrow("runtime no longer matches");
    expect(commits.length).toBe(0);
  });
});

test("credential rotation during provider reads cannot release a superseded token or complete the release", async () => {
  await harness({ rotated: true }, async (invoke, commits) => {
    await expect(invoke(credential)).rejects.toThrow("credential changed");
    await expect(invoke(confirm)).rejects.toThrow("credential changed");
    expect(commits).toHaveLength(0);
  });
});

test("actual confirmation refuses runtime errors and wrong response release even when Cloudflare tags match", async () => {
  for (const options of [{ runtimeStatus: 500 }, { wrongResponseRelease: true }]) await harness(options, async (invoke, commits) => {
    await expect(invoke(confirm)).rejects.toThrow("public pages failed runtime verification");
    expect(commits).toEqual(["failed"]);
  });
  await harness({ wrongOrigin: true }, async (invoke, commits) => { await expect(invoke(confirm)).rejects.toThrow("account subdomain"); expect(commits).toEqual([]); });
});


test("Worker confirmation verifies the durable editor origin before recording success", async () => {
  await harness({ editorOrigin: "http://127.0.0.1:4105" }, async (invoke, commits) => { await invoke(confirm); expect(commits).toEqual(["complete"]); });
  await harness({ editorOrigin: "http://127.0.0.1:4105", wrongEditor: true }, async (invoke, commits) => { await expect(invoke(confirm)).rejects.toThrow("editor origin"); expect(commits).toEqual([]); });
});
