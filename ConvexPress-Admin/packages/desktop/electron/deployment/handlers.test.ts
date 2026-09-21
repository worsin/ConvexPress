import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("actual IPC handlers isolate target locks, redact failures, retry and reconcile enrollment", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "convexpress-deploy-handlers-"));
  try {
    const script = `
      import { mock } from "bun:test";
      import assert from "node:assert/strict";
      import { getFunctionName } from "convex/server";
      import { readFileSync } from "node:fs";
      const handlers = new Map(); const progress = [];
      const key = "synthetic-deployment-secret";
      const token = "a".repeat(110) + ".b.c";
      let fail = true; let hold = null; let createCalls = 0; let testCalls = 0; let denyVerification = false; let existingStatus = "connected"; let credentialPrompts = 0; let cloudResult = null;
      const writes = []; let epoch = null; let epochClaim = null; let indexCalls = 0; let blockIndex = false;
      mock.module("electron", () => ({ app: {isPackaged: true, getPath: () => process.env.JOURNAL_DIR}, ipcMain: {handle: (k,v) => handlers.set(k,v), removeHandler() {}}, BrowserWindow: {fromWebContents: () => null, getAllWindows: () => [{isDestroyed: () => false, webContents: {send: (_, value) => progress.push(value)}}]} }));
      mock.module("./electron/utils/json-store.ts", () => ({JsonStore: class {get() {return "https://control.convex.cloud"}}}));
      mock.module("./electron/ipc/connectionProvision.ts", () => ({requestDeploymentCredential: async () => { credentialPrompts++; return key; }}));
      mock.module("./electron/ipc/setup.ts", () => ({resolveBackendRoot: () => process.cwd(), AT_REST_ENCRYPTION_KEYS: ["CONNECTIONS_ENCRYPTION_KEY"], generateAuthPrivateKey: () => {throw Error("must preserve signing key")}, generateEncryptionKeyHex: () => {throw Error("must preserve encryption key")}}));
      mock.module("./electron/deployment/process.ts", () => ({runDeploymentProcess: async (command,args,options) => {
        assert.equal(options.env.CONVEX_DEPLOY_KEY, undefined);
        if (args.includes("media/epochAuthority:coordinate")) {
          const input = JSON.parse(args[args.indexOf("media/epochAuthority:coordinate")+1]); let dispatch = false;
          if (input.phase === "prepare") { if (epoch) return {code:0,stdout:JSON.stringify({claim:null,epoch,dispatch:false}),stderr:""}; epochClaim ??= {...input,phase:"claimed"}; }
          if (input.phase === "dispatch" && epochClaim.phase === "claimed") { epochClaim.phase = "dispatched"; dispatch = true; }
          if (input.phase === "verify") { assert.equal(epoch, epochClaim.next); epochClaim.phase = "verified"; }
          return {code:0,stdout:JSON.stringify({claim:epochClaim,epoch,dispatch}),stderr:""};
        }
        if (args.includes("list")) return {code:0, stdout:"AUTH_PRIVATE_KEY=existing\\nCONNECTIONS_ENCRYPTION_KEY=existing\\nAUTH_ALLOWED_ORIGINS=existing\\nAUTH_ALLOW_NULL_ORIGIN=true" + (epoch ? "\\nMEDIA_REFERENCE_INDEX_EPOCH=" + epoch : ""), stderr:""};
        if (args.includes("--from-file")) { const content = readFileSync(args[args.indexOf("--from-file")+1], "utf8"); writes.push(content); if (content.startsWith("MEDIA_REFERENCE_INDEX_EPOCH=")) epoch = content.split("=")[1].trim(); }
        if (hold && args.includes("deploy")) await new Promise((resolve,reject) => { hold.started(); hold.release = resolve; options.signal.addEventListener("abort", () => reject(Error("cancelled")), {once:true}); });
        if (fail && args.includes("deploy")) { fail=false; return {code:1,stdout:"",stderr:"ordinary failure " + key}; }
        return {code:0,stdout:"",stderr:""};
      }}));
      mock.module("convex/browser", () => ({ConvexHttpClient: class {setAuth() {} clearAuth() {} async query() {return [{connectionId:"existing_connection", isActive:true, status:existingStatus, hasCredentials:true}]} async action(ref) {if (getFunctionName(ref) === "siteBroker/mediaIndex:maintain") { indexCalls++; return {status:blockIndex ? "blocked" : "ready",generation:epoch+":media-version",sequence:30,owner:blockIndex ? "posts" : null,completedOwners:blockIndex ? 1 : 26,totalOwners:26,pages:30,documents:61}; } if (getFunctionName(ref) === "hosting/deploy:credential") return cloudResult; if (getFunctionName(ref) === "connections/actions:test") {testCalls++; if (denyVerification) throw Error("signed verification failed " + (cloudResult?.deploymentAdminKey ?? key)); return {connectionId:"existing_connection",status:"healthy"};} createCalls++; throw Error("must reuse connection")} }}));
      globalThis.fetch = async () => new Response(JSON.stringify({websiteKey:"website_alpha",instanceKey:"instance_alpha"}), {status:200});
      const deploy = await import("./electron/ipc/siteDeploy.ts");
      assert.equal(deploy.describeFailure(new Error("ordinary failure")), "ordinary failure");
      deploy.registerSiteDeployHandlers();
      const event = {sender:{getURL: () => "convexpress-app://shell/index.html"}};
      const request = {label:"Synthetic",credential:{kind:"admin-key",deploymentOrigin:"https://alpha.convex.cloud",adminKey:key},envChanges:[]};
      const first = await handlers.get("site-deploy:run")(event,request);
      assert.equal(first.ok,false); assert(!first.error.includes(key));
      const second = await handlers.get("site-deploy:run")(event,request);
      assert.equal(second.ok,true); assert.equal(second.runId,first.runId);
      assert.equal(handlers.get("site-deploy:status")(event,{deploymentOrigin:request.credential.deploymentOrigin}).attempt,2);
      let started; const startedPromise = new Promise(resolve => started=resolve); hold={started};
      const pending = handlers.get("site-deploy:run")(event,request); await startedPromise;
      await assert.rejects(handlers.get("site-deploy:run")(event,request), /running/);
      const sibling = await handlers.get("site-deploy:run")(event,{...request,envOnly:true,envChanges:[{name:"SITE_URL",value:"https://beta.example"}],credential:{...request.credential,deploymentOrigin:"https://beta.convex.cloud"}});
      assert.equal(sibling.ok,true);
      const active = handlers.get("site-deploy:status")(event,{deploymentOrigin:request.credential.deploymentOrigin});
      assert.equal(handlers.get("site-deploy:cancel")(event,active.runId).cancelled,true);
      assert.equal((await pending).ok,false); hold=null;
      const initialized = await handlers.get("site-deploy:initialize")(event,{instanceId:"outer_instance",websiteKey:"website_alpha",instanceKey:"instance_alpha",environmentKind:"live",deploymentOrigin:"https://fresh.convex.cloud",managementOrigin:"https://fresh.convex.site",siteOrigin:"https://fresh.example",siteTitle:"Fresh",connectionName:"Controller",authToken:token,adminOrigins:[]});
      assert.equal(initialized.ok,true); assert.equal(initialized.connectionId,"existing_connection"); assert.equal(createCalls,0); assert.equal(testCalls,1);
      assert.equal(credentialPrompts,1);
      cloudResult = {websiteKey:"website_alpha",instanceKey:"instance_alpha",environmentKind:"live",deploymentOrigin:"https://fresh.convex.cloud",managementOrigin:"https://fresh.convex.site",siteOrigin:"https://fresh.example",deploymentAdminKey:"prod:fresh|synthetic-cloud-deployment-key"};
      const cloudInit = await handlers.get("site-deploy:initialize")(event,{instanceId:"outer_instance",...cloudResult,siteTitle:"Fresh",connectionName:"Controller",authToken:token,adminOrigins:[]});
      assert.equal(cloudInit.ok,true); assert.equal(credentialPrompts,1);
      assert(!JSON.stringify(cloudInit).includes(cloudResult.deploymentAdminKey));
      assert.equal(testCalls,2); assert.equal(indexCalls,2);
      assert.equal(writes.filter(value => value.startsWith("MEDIA_REFERENCE_INDEX_EPOCH=")).length,1);
      assert.equal(handlers.get("site-deploy:status")(event,{deploymentOrigin:"https://fresh.convex.cloud"}).mediaIndex.status,"ready");
      denyVerification = true;
      const denied = await handlers.get("site-deploy:initialize")(event,{instanceId:"outer_instance",...cloudResult,siteTitle:"Fresh",connectionName:"Controller",authToken:token,adminOrigins:[]});
      assert.equal(denied.ok,false); assert(!denied.error.includes(cloudResult.deploymentAdminKey)); assert.equal(createCalls,0);
      denyVerification = false; existingStatus = "error";
      const recovered = await handlers.get("site-deploy:initialize")(event,{instanceId:"outer_instance",...cloudResult,siteTitle:"Fresh",connectionName:"Controller",authToken:token,adminOrigins:[]});
      assert.equal(recovered.ok,true); assert.equal(createCalls,0); assert.equal(testCalls,4);
      blockIndex = true;
      const paused = await handlers.get("site-deploy:initialize")(event,{instanceId:"outer_instance",...cloudResult,siteTitle:"Fresh",connectionName:"Controller",authToken:token,adminOrigins:[]});
      assert.equal(paused.ok,false); assert.match(paused.error,/indexing paused/);
      assert.equal(handlers.get("site-deploy:status")(event,{deploymentOrigin:"https://fresh.convex.cloud"}).mediaIndex.status,"blocked");
      blockIndex = false;
      const resumed = await handlers.get("site-deploy:initialize")(event,{instanceId:"outer_instance",...cloudResult,siteTitle:"Fresh",connectionName:"Controller",authToken:token,adminOrigins:[]});
      assert.equal(resumed.ok,true); assert.equal(resumed.runId,paused.runId);
      assert.equal(writes.filter(value => value.startsWith("MEDIA_REFERENCE_INDEX_EPOCH=")).length,1);
      cloudResult = {...cloudResult, instanceKey:"wrong_instance"};
      await assert.rejects(handlers.get("site-deploy:initialize")(event,{instanceId:"outer_instance",...cloudResult,instanceKey:"instance_alpha",siteTitle:"Fresh",connectionName:"Controller",authToken:token,adminOrigins:[]}), /target changed/);
      assert.equal(credentialPrompts,1);
      assert(writes.every(value => !value.startsWith("AUTH_PRIVATE_KEY=") && !value.startsWith("CONNECTIONS_ENCRYPTION_KEY=")));
      assert(progress.every(entry => entry.targetOrigin));
      const persisted = readFileSync(process.env.JOURNAL_DIR + "/convexpress-deployments.json", "utf8");
      assert(!persisted.includes(key)); assert(!persisted.includes(token)); assert(!persisted.includes("ordinary failure"));
      console.log("lifecycle verified");
    `;
    const result = Bun.spawnSync([process.execPath, "-e", script], {
      cwd: path.resolve(import.meta.dir, "../.."),
      env: {
        ...process.env,
        JOURNAL_DIR: dir,
        CONVEXPRESS_DESKTOP_DEV: "0",
        CONVEX_DEPLOY_KEY: "inherited-wrong-target",
      },
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("lifecycle verified");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
