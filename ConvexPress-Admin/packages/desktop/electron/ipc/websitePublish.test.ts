import { expect, test } from "bun:test";
import path from "node:path";
for (const development of [true, false]) test(`actual website publishing IPC validates and maps control-plane origins (${development ? "development" : "packaged"})`, () => {
  const script = `
    import { mock } from "bun:test";
    import assert from "node:assert/strict";
    const handlers = new Map(); const origins = []; const progresses = []; let configured = "http://192.168.1.246:4720"; let artifactFailure = false; let begins = 0; let vercelLoads = 0; let vercelRuns = 0; const inputs = [];
    const development = process.env.CONVEXPRESS_DESKTOP_DEV === "1";
    mock.module("electron", () => ({ app: { isPackaged: !development, getAppPath: () => "/synthetic/ConvexPress-Admin/packages/desktop", getPath: () => "/synthetic" }, ipcMain: { handle: (name, fn) => handlers.set(name, fn), removeHandler() {} } }));
    mock.module("./electron/utils/json-store.ts", () => ({ JsonStore: class { get() { return configured; } } }));
    mock.module("./electron/hosting/artifact.ts", () => ({ loadWebsiteArtifact: (root) => { if (development) assert.equal(root, "/synthetic/ConvexPress-Website/apps/web/dist"); if (artifactFailure) throw Error("private-secret-file-path"); return { hash: "a".repeat(64) }; } }));
    mock.module("./electron/hosting/vercelArtifact.ts", () => ({ loadVercelArtifact: (root) => { vercelLoads++; assert.equal(root, development ? "/synthetic/ConvexPress-Admin/packages/desktop/resources/website-vercel/output" : "/synthetic/resources/website-vercel/output"); return { hash: "a".repeat(64) }; } }));
    mock.module("./electron/hosting/vercelPublish.ts", () => ({ publishVercelWebsite: async () => { vercelRuns++; return { siteOrigin: "https://alpha.vercel.app" }; } }));
    mock.module("./electron/hosting/publish.ts", () => ({ publishWebsite: async () => ({ siteOrigin: "https://alpha.team.workers.dev" }) }));
    mock.module("convex/browser", () => ({ ConvexHttpClient: class { constructor(origin) { origins.push(origin); } setAuth() {} clearAuth() {} async mutation(ref, input) { inputs.push(input); begins++; return { releaseId: "release_alpha", leaseToken: "secret_lease" }; } } }));
    if (!development) Object.defineProperty(process, "resourcesPath", { value: "/synthetic/resources" });
    (await import("./electron/ipc/websitePublish.ts")).registerWebsitePublishHandlers();
    const event = { sender: { id: 1, getURL: () => development ? "http://localhost:4105/" : "convexpress-app://shell/index.html", isDestroyed: () => false, send: (_name, data) => progresses.push(data) } };
    const request = { editorOrigin: "https://untrusted.example", instanceId: "instance_alpha", accountId: "account_alpha", workerName: "alpha", authToken: "a".repeat(110) + ".b.c" };
    const run = () => handlers.get("website-publish:run")(event, request);
    await run(); assert.equal(origins.at(-1), development ? "http://127.0.0.1:14720" : "http://192.168.1.246:4720");
    assert.equal(inputs.at(-1).editorOrigin, development ? "http://localhost:4105" : "convexpress-app://shell");
    for (const value of ["http://public.example", "https://user:private-token@control.example", "https://control.example/path"]) {
      configured = value; const before = begins; await assert.rejects(run(), /CONTROL_PLANE_ORIGIN_INVALID/); assert.equal(begins, before);
    }
    if (development) {
      configured = "http://192.168.1.246:4720";
      process.env.CONVEXPRESS_DEPLOY_ORIGIN_MAP = "http://192.168.1.246:4720=http://public.example";
      await assert.rejects(run(), /CONTROL_PLANE_ORIGIN_INVALID/);
    }
    configured = undefined; await assert.rejects(run(), /CONTROL_PLANE_MISSING/);
    configured = "https://control.example"; artifactFailure = true; await assert.rejects(run(), error => /WEBSITE_ARTIFACT_INVALID/.test(error.message) && !error.message.includes("private-secret-file-path"));
    artifactFailure = false; await run(); assert.equal(origins.at(-1), "https://control.example");
    assert(!JSON.stringify(progresses).includes(request.authToken));
    Object.assign(request, { provider: "vercel", projectName: "alpha", resumeReleaseId: "release_alpha" }); delete request.workerName;
    const vercelResult = await run(); assert.equal(vercelResult.siteOrigin, "https://alpha.vercel.app"); assert.equal(vercelLoads, 1); assert.equal(vercelRuns, 1);
    assert.equal(inputs.at(-1).projectName, "alpha"); assert.equal(inputs.at(-1).resumeReleaseId, "release_alpha"); assert.equal(inputs.at(-1).workerName, undefined);
    request.provider = "unknown"; await assert.rejects(run(), /Unsupported website provider/);
    console.log("website IPC preflight verified");
  `;
  const result = Bun.spawnSync([process.execPath, "-e", script], { cwd: path.resolve(import.meta.dir, "../.."), env: { ...process.env, CONVEXPRESS_DESKTOP_DEV: development ? "1" : "0", CONVEXPRESS_DESKTOP_DEV_URL: "http://localhost:4105", CONVEXPRESS_DEPLOY_ORIGIN_MAP: "http://192.168.1.246:4720=http://127.0.0.1:14720" } });
  expect(result.stderr.toString()).toBe(""); expect(result.exitCode).toBe(0); expect(result.stdout.toString()).toContain("website IPC preflight verified");
});
