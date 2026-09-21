import { expect, test } from "bun:test";
import path from "node:path";
test("Cloudflare OAuth IPC enforces sender, configured authority, callback binding and safe error output", () => {
  const script = `
    import { mock } from "bun:test";
    import assert from "node:assert/strict";
    const handlers=new Map(); const opened=[]; const calls=[]; let closes=0; let wrongUrl=false; let failComplete=false;
    const redirectUri="http://localhost:47123/hosting/cloudflare/callback", state="a".repeat(43);
    mock.module("electron",()=>({app:{isPackaged:false,getPath:()=>"/synthetic"},ipcMain:{handle:(n,f)=>handlers.set(n,f),removeHandler(){}},shell:{openExternal:async url=>opened.push(url)}}));
    mock.module("./electron/utils/json-store.ts",()=>({JsonStore:class {get(){return "http://192.168.1.246:4720";}}}));
    mock.module("./electron/hosting/cloudflareLoopback.ts",()=>({CLOUDFLARE_REDIRECT_URI:redirectUri,startCloudflareLoopback:async()=>({redirectUri,expectState:s=>assert.equal(s,state),result:Promise.resolve({state,code:"private-code"}),close:()=>closes++})}));
    mock.module("convex/browser",()=>({ConvexHttpClient:class {constructor(origin){assert.equal(origin,"http://127.0.0.1:14720")}setAuth(){}clearAuth(){}async action(ref,args){calls.push(args);if(args.code){if(failComplete)throw Error("private-code private-token");return {accountId:"account",provider:"cloudflare",externalAccountId:"a".repeat(32),label:"Test",revision:1};}return {state,redirectUri,authorizationUrl:(wrongUrl?"https://attacker.example":"https://dash.cloudflare.com")+"/oauth2/auth?"+new URLSearchParams({redirect_uri:redirectUri,state,response_type:"code",code_challenge_method:"S256"})};}}}));
    const mod=await import("./electron/ipc/cloudflareOAuth.ts");mod.registerCloudflareOAuthHandlers();
    const event={sender:{id:1,getURL:()=>"http://localhost:4105/",once(){},removeListener(){}}};
    const request={organizationId:"org",externalAccountId:"a".repeat(32),expectedRevision:0,authToken:"a".repeat(110)+".b.c"};
    assert.throws(()=>mod.parseCloudflareOAuthRequest({...request,expectedRevision:-1}));
    assert.throws(()=>mod.parseCloudflareOAuthRequest({...request,externalAccountId:"not-an-account"}));
    await assert.rejects(handlers.get("hosting:cloudflare-oauth")({...event,sender:{...event.sender,getURL:()=>"https://attacker.example"}},request),/only available/);
    assert.equal(calls.length,0);
    const run=()=>handlers.get("hosting:cloudflare-oauth")(event,request);
    assert.equal((await run()).revision,1);assert.equal(opened.length,1);assert.equal(closes,1);
    assert(!JSON.stringify(calls).includes(request.authToken));
    wrongUrl=true;await assert.rejects(run(),/not completed/);assert.equal(opened.length,1);assert.equal(closes,2);
    wrongUrl=false;failComplete=true;await assert.rejects(run(),e=>!e.message.includes("private-")&&e.message.includes("not completed"));assert.equal(closes,3);
    console.log("Cloudflare OAuth IPC verified");
  `;
  const result = Bun.spawnSync([process.execPath,"-e",script],{cwd:path.resolve(import.meta.dir,"../.."),env:{...process.env,CONVEXPRESS_DESKTOP_DEV:"1",CONVEXPRESS_DESKTOP_DEV_URL:"http://localhost:4105",CONVEXPRESS_DEPLOY_ORIGIN_MAP:"http://192.168.1.246:4720=http://127.0.0.1:14720"}});
  expect(result.stderr.toString()).toBe("");expect(result.exitCode).toBe(0);expect(result.stdout.toString()).toContain("Cloudflare OAuth IPC verified");
});
