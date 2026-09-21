import { expect, test } from "bun:test";
import path from "node:path";

// Subprocess isolation keeps Electron boundary mocks out of other suites.
for (const development of [false, true])
  test(`${development ? "development" : "packaged"} IPC and navigation enforce the renderer boundary`, () => {
    const script = `
    import { mock } from "bun:test";
    const handlers = new Map();
    let navigation;
    class FakeWindow {
      static getAllWindows() { return []; }
      static fromWebContents() { return null; }
      constructor() { this.webContents = { on: (name, handler) => { if (name === "will-navigate") navigation = handler; }, setWindowOpenHandler() {} }; }
      loadURL() {} once() {} on() {}
    }
    const development = process.env.CONVEXPRESS_DESKTOP_DEV === "1";
    mock.module("electron", () => ({
      app: { isPackaged: true, getPath: () => "/synthetic", getAppPath: () => "/synthetic", getVersion: () => "test" },
      ipcMain: { handle: (name, handler) => handlers.set(name, handler), removeHandler() {}, on() {} },
      safeStorage: { isEncryptionAvailable: () => true },
      BrowserWindow: FakeWindow,
      net: {}, shell: { openExternal: async () => {} }, dialog: {},
    }));
    mock.module("./electron/utils/json-store.ts", () => ({ JsonStore: class { get() {} set() {} delete() {} } }));
    const registrations = [
      ["auth", "registerAuthHandlers"], ["config", "registerConfigHandlers"],
      ["handoff", "registerHandoffHandlers"], ["connectionProvision", "registerConnectionProvisionHandlers"],
      ["security", "registerSecurityHandlers"], ["siteRunner", "registerSiteRunnerHandlers"],
      ["siteDeploy", "registerSiteDeployHandlers"], ["websitePublish", "registerWebsitePublishHandlers"],
      ["cloudflareOAuth", "registerCloudflareOAuthHandlers"],
      ["app-updater", "registerAppUpdaterHandlers"], ["updater", "registerUpdaterHandlers"],
    ];
    for (const [name, method] of registrations) (await import("./electron/ipc/" + name + ".ts"))[method]();
    const failures = [];
    const trusted = development ? "http://localhost:4105/" : "convexpress-app://shell/index.html";
    const rejected = development ? ["https://remote.example/"] : ["http://localhost:4105/untrusted.html", "https://remote.example/"];
    await handlers.get("auth:get")({ sender: { getURL: () => trusted } }, "better-auth_cookie");
    (await import("./electron/window-manager.ts")).windowManager.createMainWindow();
    for (const url of rejected) {
      let blocked = false;
      navigation({ preventDefault: () => { blocked = true; } }, url);
      if (!blocked) failures.push("navigation accepted " + url);
    }
    let blocked = false;
    navigation({ preventDefault: () => { blocked = true; } }, trusted);
    if (blocked) failures.push("navigation rejected the legitimate renderer");
    for (const [name, handler] of handlers) {
      if (name.startsWith("connections:credential-")) continue;
      for (const url of rejected) {
        try {
          await handler({ sender: { getURL: () => url } }, "better-auth_cookie", "synthetic");
          failures.push(name + " accepted " + url);
        } catch (error) {
          if (!/only|unauthorized|trusted/i.test(String(error))) failures.push(name + " missed sender guard: " + error);
        }
      }
    }
    if (failures.length) throw new Error(failures.join("\\n"));
    console.log("Guarded " + handlers.size + " IPC channels");
  `;
    const result = Bun.spawnSync([process.execPath, "-e", script], {
      cwd: path.resolve(import.meta.dir, "../.."),
      env: {
        ...process.env,
        CONVEXPRESS_DESKTOP_DEV: development ? "1" : "0",
        CONVEXPRESS_DESKTOP_DEV_URL: "http://localhost:4105",
      },
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("Guarded");
  });
