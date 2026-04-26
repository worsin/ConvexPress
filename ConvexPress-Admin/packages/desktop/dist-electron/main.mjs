var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// ../../node_modules/.bun/electron@33.4.11/node_modules/electron/index.js
var require_electron = __commonJS({
  "../../node_modules/.bun/electron@33.4.11/node_modules/electron/index.js"(exports, module) {
    "use strict";
    var fs = __require("fs");
    var path5 = __require("path");
    var pathFile = path5.join(__dirname, "path.txt");
    function getElectronPath() {
      let executablePath;
      if (fs.existsSync(pathFile)) {
        executablePath = fs.readFileSync(pathFile, "utf-8");
      }
      if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
        return path5.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || "electron");
      }
      if (executablePath) {
        return path5.join(__dirname, "dist", executablePath);
      } else {
        throw new Error("Electron failed to install correctly, please delete node_modules/electron and try installing again");
      }
    }
    module.exports = getElectronPath();
  }
});

// electron/ipc/window.ts
function registerWindowHandlers() {
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("window:maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
  });
  ipcMain.handle("window:set-always-on-top", (event, value) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setAlwaysOnTop(value);
  });
  ipcMain.handle("window:is-maximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });
}
var ipcMain, BrowserWindow;
var init_window = __esm({
  "electron/ipc/window.ts"() {
    "use strict";
    ({ ipcMain, BrowserWindow } = require_electron());
  }
});

// electron/utils/json-store.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
var app, JsonStore;
var init_json_store = __esm({
  "electron/utils/json-store.ts"() {
    "use strict";
    ({ app } = require_electron());
    JsonStore = class {
      name;
      defaults;
      constructor(options) {
        this.name = options.name;
        this.defaults = options.defaults ?? {};
      }
      getFilePath() {
        return path.join(app.getPath("userData"), `${this.name}.json`);
      }
      readState() {
        const filePath = this.getFilePath();
        if (!existsSync(filePath)) {
          return { ...this.defaults };
        }
        try {
          const raw = readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(raw);
          return { ...this.defaults, ...parsed };
        } catch {
          return { ...this.defaults };
        }
      }
      writeState(state) {
        const filePath = this.getFilePath();
        ensureParentDir(filePath);
        writeFileSync(filePath, JSON.stringify(state, null, 2));
      }
      get(key, defaultValue) {
        const state = this.readState();
        if (Object.prototype.hasOwnProperty.call(state, key)) {
          return state[key];
        }
        return defaultValue;
      }
      set(key, value) {
        const state = this.readState();
        state[key] = value;
        this.writeState(state);
      }
      delete(key) {
        const state = this.readState();
        delete state[key];
        this.writeState(state);
      }
    };
  }
});

// electron/ipc/config.ts
function registerConfigHandlers() {
  ipcMain2.handle("config:get", (_event, key) => {
    return store.get(key);
  });
  ipcMain2.handle("config:set", (_event, key, value) => {
    store.set(key, value);
  });
  ipcMain2.handle("config:test-connection", async (_event, url) => {
    const cleanUrl = url.replace(/\/$/, "");
    const endpoints = [
      `${cleanUrl}/.well-known/openid-configuration`,
      `${cleanUrl}/version`
    ];
    for (const endpoint of endpoints) {
      try {
        const response = await net.fetch(endpoint);
        if (response.ok) {
          return { ok: true, status: response.status };
        }
      } catch {
      }
    }
    try {
      const response = await net.fetch(endpoints[0]);
      return { ok: response.ok, status: response.status };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
}
var ipcMain2, net, store;
var init_config = __esm({
  "electron/ipc/config.ts"() {
    "use strict";
    init_json_store();
    ({ ipcMain: ipcMain2, net } = require_electron());
    store = new JsonStore({ name: "convexpress-config" });
  }
});

// electron/ipc/auth.ts
function isAllowedKey(key) {
  return ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
}
function registerAuthHandlers() {
  ipcMain3.handle("auth:get", (_event, key) => {
    if (!isAllowedKey(key)) {
      console.log(`[Auth IPC] get BLOCKED key: ${key}`);
      return null;
    }
    const val = authStore.get(key, null);
    console.log(
      `[Auth IPC] get "${key}" -> ${val ? "has value (" + String(val).length + " chars)" : "null"}`
    );
    return val;
  });
  ipcMain3.handle("auth:set", (_event, key, value) => {
    if (!isAllowedKey(key)) {
      console.log(`[Auth IPC] set BLOCKED key: ${key}`);
      return;
    }
    console.log(
      `[Auth IPC] set "${key}" -> ${value ? value.length + " chars" : "null"}`
    );
    authStore.set(key, value);
  });
  ipcMain3.handle("auth:remove", (_event, key) => {
    if (!isAllowedKey(key)) {
      console.log(`[Auth IPC] remove BLOCKED key: ${key}`);
      return;
    }
    console.log(`[Auth IPC] remove "${key}"`);
    authStore.delete(key);
  });
}
var ipcMain3, authStore, ALLOWED_PREFIXES;
var init_auth = __esm({
  "electron/ipc/auth.ts"() {
    "use strict";
    init_json_store();
    ({ ipcMain: ipcMain3 } = require_electron());
    authStore = new JsonStore({
      name: "convexpress-auth"
    });
    ALLOWED_PREFIXES = ["__convexAuth", "convexAuth"];
  }
});

// electron/ipc/setup.ts
function registerSetupHandlers() {
  ipcMain4.handle(
    "setup:complete",
    (_event, config) => {
      try {
        store.set("mode", config.mode);
        store.set("convexUrl", config.convexUrl);
        if (config.adminKey) {
          store.set("adminKey", config.adminKey);
        }
        if (config.siteName) {
          store.set("siteName", config.siteName);
        }
        if (config.adminName || config.adminEmail || config.adminPassword) {
          store.set("pendingAdminCredentials", {
            displayName: config.adminName,
            email: config.adminEmail,
            password: config.adminPassword
          });
        }
        store.set("setupComplete", true);
        console.log(
          `[Setup IPC] Config saved: mode=${config.mode}, url=${config.convexUrl}`
        );
        return { success: true };
      } catch (error) {
        console.error("[Setup IPC] Failed to save config:", error);
        return { success: false, error: String(error) };
      }
    }
  );
}
var ipcMain4;
var init_setup = __esm({
  "electron/ipc/setup.ts"() {
    "use strict";
    init_config();
    ({ ipcMain: ipcMain4 } = require_electron());
  }
});

// electron/version.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, renameSync, existsSync as existsSync2 } from "fs";
import { join } from "path";
import { tmpdir } from "os";
function getManifestPath(installPath) {
  return join(installPath, MANIFEST_FILENAME);
}
function readManifest(installPath) {
  const manifestPath = getManifestPath(installPath);
  if (!existsSync2(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync2(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}
function writeManifest(installPath, manifest) {
  const targetPath = getManifestPath(installPath);
  const tempPath = join(
    tmpdir(),
    `convexpress-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  writeFileSync2(tempPath, JSON.stringify(manifest, null, 2));
  renameSync(tempPath, targetPath);
}
var MANIFEST_FILENAME;
var init_version = __esm({
  "electron/version.ts"() {
    "use strict";
    MANIFEST_FILENAME = ".convexpress-version.json";
  }
});

// electron/app-updater.ts
import { execFile } from "child_process";
import { existsSync as existsSync3 } from "fs";
import { join as join2 } from "path";
import { promisify } from "util";
import { EventEmitter } from "events";
var net2, execFileAsync, AppUpdater;
var init_app_updater = __esm({
  "electron/app-updater.ts"() {
    "use strict";
    init_version();
    ({ net: net2 } = require_electron());
    execFileAsync = promisify(execFile);
    AppUpdater = class extends EventEmitter {
      installPath;
      checkIntervalMs;
      intervalHandle = null;
      isChecking = false;
      isUpdating = false;
      constructor(installPath, checkIntervalMs = 4 * 60 * 60 * 1e3) {
        super();
        this.installPath = installPath;
        this.checkIntervalMs = checkIntervalMs;
      }
      startPeriodicCheck() {
        this.stopPeriodicCheck();
        setTimeout(() => this.checkForUpdate(), 1e4);
        this.intervalHandle = setInterval(
          () => this.checkForUpdate(),
          this.checkIntervalMs
        );
      }
      stopPeriodicCheck() {
        if (this.intervalHandle) {
          clearInterval(this.intervalHandle);
          this.intervalHandle = null;
        }
      }
      async checkForUpdate() {
        if (this.isChecking) return null;
        this.isChecking = true;
        try {
          const manifest = readManifest(this.installPath);
          if (!manifest) {
            this.emit(
              "update-check-error",
              new Error("Version manifest not found. App may need reinstalling.")
            );
            return null;
          }
          const remoteSha = await this.getRemoteHeadSha(
            manifest.repo,
            manifest.branch
          );
          const result = {
            updateAvailable: remoteSha !== manifest.commitSha,
            currentSha: manifest.commitSha,
            remoteSha,
            repo: manifest.repo,
            branch: manifest.branch
          };
          if (result.updateAvailable) {
            this.emit("update-available", result);
          }
          return result;
        } catch (err) {
          this.emit("update-check-error", err);
          return null;
        } finally {
          this.isChecking = false;
        }
      }
      async performUpdate() {
        if (this.isUpdating) {
          this.emit(
            "update-check-error",
            new Error("An update is already in progress.")
          );
          return;
        }
        this.isUpdating = true;
        try {
          const manifest = readManifest(this.installPath);
          if (!manifest) throw new Error("No version manifest found");
          const previousSha = await this.getCurrentSha();
          this.emit("update-progress", {
            phase: "pulling",
            message: "Pulling latest changes...",
            percent: 10
          });
          const pm = await this.detectPackageManager();
          try {
            await this.gitPull();
            this.emit("update-progress", {
              phase: "installing-deps",
              message: "Updating dependencies...",
              percent: 40
            });
            await execFileAsync(pm, ["install"], {
              cwd: this.installPath,
              shell: true
            });
            this.emit("update-progress", {
              phase: "building",
              message: "Rebuilding application...",
              percent: 60
            });
            await execFileAsync(pm, ["run", "build"], {
              cwd: this.installPath,
              shell: true
            });
          } catch (err) {
            await this.rollback(previousSha, pm);
            throw new Error(
              `Update failed and was rolled back: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          this.emit("update-progress", {
            phase: "finalizing",
            message: "Finalizing update...",
            percent: 90
          });
          let newSha = "unknown";
          try {
            const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
              cwd: this.installPath,
              shell: true
            });
            newSha = stdout.trim();
          } catch {
          }
          const updatedManifest = {
            ...manifest,
            commitSha: newSha,
            builtAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          writeManifest(this.installPath, updatedManifest);
          this.emit("update-progress", {
            phase: "complete",
            message: "Update complete! Restart to apply.",
            percent: 100
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.emit("update-progress", {
            phase: "error",
            message,
            percent: -1
          });
          throw err;
        } finally {
          this.isUpdating = false;
        }
      }
      async getCurrentSha() {
        const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
          cwd: this.installPath,
          shell: true
        });
        return stdout.trim();
      }
      async rollback(previousSha, pm) {
        this.emit("update-progress", {
          phase: "rolling-back",
          message: "Update failed. Rolling back to previous version...",
          percent: 0
        });
        try {
          await execFileAsync("git", ["reset", "--hard", previousSha], {
            cwd: this.installPath,
            shell: true
          });
          const packageManager = pm ?? await this.detectPackageManager();
          await execFileAsync(packageManager, ["install"], {
            cwd: this.installPath,
            shell: true
          });
        } catch {
        }
      }
      async gitPull() {
        const manifest = readManifest(this.installPath);
        const branch = manifest?.branch ?? "main";
        await execFileAsync("git", ["fetch", "--depth", "1", "origin", branch], {
          cwd: this.installPath,
          shell: true
        });
        await execFileAsync("git", ["reset", "--hard", `origin/${branch}`], {
          cwd: this.installPath,
          shell: true
        });
        const { stdout: currentSha } = await execFileAsync(
          "git",
          ["rev-parse", "HEAD"],
          {
            cwd: this.installPath,
            shell: true
          }
        );
        const { stdout: remoteSha } = await execFileAsync(
          "git",
          ["rev-parse", `origin/${branch}`],
          {
            cwd: this.installPath,
            shell: true
          }
        );
        if (currentSha.trim() !== remoteSha.trim()) {
          throw new Error(
            "Git reset validation failed \u2014 HEAD does not match remote. Update aborted."
          );
        }
      }
      async getRemoteHeadSha(repo, branch) {
        return new Promise((resolve, reject) => {
          const url = `https://api.github.com/repos/${repo}/commits/${branch}`;
          const request = net2.request({
            url,
            method: "GET"
          });
          request.setHeader("Accept", "application/vnd.github.v3+json");
          request.setHeader("User-Agent", "ConvexPress-Updater");
          const timeout = setTimeout(() => {
            request.abort();
            reject(new Error("GitHub API request timed out after 15 seconds"));
          }, 15e3);
          request.on("response", (response) => {
            clearTimeout(timeout);
            const statusCode = response.statusCode;
            if (statusCode !== 200) {
              let errorBody = "";
              response.on("data", (chunk) => {
                errorBody += chunk.toString();
              });
              response.on("end", () => {
                if (statusCode === 404)
                  reject(new Error(`Repository ${repo} not found on GitHub`));
                else if (statusCode === 403)
                  reject(
                    new Error(
                      "GitHub API rate limit exceeded \u2014 try again later"
                    )
                  );
                else reject(new Error(`GitHub API error: HTTP ${statusCode}`));
              });
              return;
            }
            let body = "";
            response.on("data", (chunk) => {
              body += chunk.toString();
            });
            response.on("end", () => {
              try {
                const data = JSON.parse(body);
                if (data.sha) {
                  resolve(data.sha);
                } else {
                  reject(new Error(`No SHA in GitHub response`));
                }
              } catch {
                reject(new Error(`Failed to parse GitHub response`));
              }
            });
          });
          request.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });
          request.end();
        });
      }
      async detectPackageManager() {
        if (existsSync3(join2(this.installPath, "bun.lock")) || existsSync3(join2(this.installPath, ".bun-version"))) {
          try {
            await execFileAsync("bun", ["--version"], { shell: true });
            return "bun";
          } catch {
          }
        }
        return "npm";
      }
    };
  }
});

// electron/utils/app-state.ts
function setQuitting(value) {
  quitting = value;
}
function isQuitting() {
  return quitting;
}
var quitting;
var init_app_state = __esm({
  "electron/utils/app-state.ts"() {
    "use strict";
    quitting = false;
  }
});

// electron/window-manager.ts
import path2 from "path";
function getPreloadPath() {
  return path2.join(__dirname, "preload.cjs");
}
function getIconPath() {
  return path2.join(__dirname, "../resources/icon.png");
}
function getRendererIndexPath() {
  return path2.join(__dirname, "..", "dist", "index.html");
}
var app2, BrowserWindow2, WindowManager, windowManager;
var init_window_manager = __esm({
  "electron/window-manager.ts"() {
    "use strict";
    init_app_state();
    ({ app: app2, BrowserWindow: BrowserWindow2 } = require_electron());
    WindowManager = class {
      mainWindow = null;
      wizardWindow = null;
      createMainWindow() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.show();
          return this.mainWindow;
        }
        const win = new BrowserWindow2({
          width: 1280,
          height: 860,
          minWidth: 1024,
          minHeight: 768,
          frame: false,
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 12, y: 12 },
          icon: getIconPath(),
          show: false,
          // Hardcoded dark background prevents a white flash before CSS loads
          // in dark theme. Electron shows this color immediately while the
          // renderer process initialises, so it must match the app's dark
          // background to avoid a jarring flash.
          backgroundColor: "#0a0a0a",
          webPreferences: {
            preload: getPreloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
          }
        });
        if (!app2.isPackaged) {
          win.loadURL("http://localhost:4105");
        } else {
          const indexPath = getRendererIndexPath();
          console.log(`[WindowManager] Renderer path: ${indexPath}`);
          win.loadFile(indexPath);
        }
        win.once("ready-to-show", () => {
          win.show();
        });
        win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
          const prefix = ["LOG", "WARN", "ERROR"][level] || "LOG";
          console.log(`[Renderer ${prefix}] ${message} (${sourceId}:${line})`);
        });
        win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
          console.error(
            `[Renderer LOAD FAIL] ${errorCode}: ${errorDescription} URL: ${validatedURL}`
          );
        });
        win.webContents.on("render-process-gone", (_event, details) => {
          console.error("[Renderer CRASHED]", details);
        });
        win.on("maximize", () => {
          win.webContents.send("window:maximized", true);
        });
        win.on("unmaximize", () => {
          win.webContents.send("window:maximized", false);
        });
        win.on("close", (e) => {
          if (!isQuitting()) {
            e.preventDefault();
            win.hide();
          }
        });
        win.on("closed", () => {
          this.mainWindow = null;
        });
        this.mainWindow = win;
        return win;
      }
      createWizardWindow() {
        if (this.wizardWindow && !this.wizardWindow.isDestroyed()) {
          this.wizardWindow.show();
          return this.wizardWindow;
        }
        const win = new BrowserWindow2({
          width: 620,
          height: 720,
          frame: false,
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 12, y: 12 },
          resizable: false,
          center: true,
          icon: getIconPath(),
          show: false,
          // Hardcoded dark background prevents a white flash before CSS loads
          // in dark theme. See createMainWindow for the same rationale.
          backgroundColor: "#0a0a0a",
          webPreferences: {
            preload: getPreloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
          }
        });
        win.loadFile(path2.join(__dirname, "wizard", "index.html"));
        win.once("ready-to-show", () => {
          win.show();
        });
        win.on("closed", () => {
          this.wizardWindow = null;
        });
        this.wizardWindow = win;
        return win;
      }
      getMainWindow() {
        return this.mainWindow;
      }
      getWizardWindow() {
        return this.wizardWindow;
      }
      destroyWizard() {
        if (this.wizardWindow && !this.wizardWindow.isDestroyed()) {
          this.wizardWindow.destroy();
        }
        this.wizardWindow = null;
      }
    };
    windowManager = new WindowManager();
  }
});

// electron/ipc/app-updater.ts
function initAppUpdater(installPath) {
  updater = new AppUpdater(installPath);
  updater.on("update-available", (result) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app-update:available", result);
    }
  });
  updater.on("update-check-error", (err) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app-update:check-error", err.message);
    }
  });
  updater.on("update-progress", (progress) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app-update:progress", progress);
    }
  });
  updater.startPeriodicCheck();
}
function registerAppUpdaterHandlers() {
  ipcMain5.handle("app-update:check", async () => {
    if (!updater) return null;
    return updater.checkForUpdate();
  });
  ipcMain5.handle("app-update:install", async () => {
    if (!updater) throw new Error("Updater not initialized");
    await updater.performUpdate();
  });
}
var ipcMain5, updater;
var init_app_updater2 = __esm({
  "electron/ipc/app-updater.ts"() {
    "use strict";
    init_app_updater();
    init_window_manager();
    ({ ipcMain: ipcMain5 } = require_electron());
    updater = null;
  }
});

// electron/utils/safe-log.ts
function safeLog(...args) {
  try {
    console.log(...args);
  } catch {
  }
}
function safeError(...args) {
  try {
    console.error(...args);
  } catch {
  }
}
var init_safe_log = __esm({
  "electron/utils/safe-log.ts"() {
    "use strict";
  }
});

// electron/ipc/updater.ts
async function getAutoUpdater() {
  if (!autoUpdater) {
    try {
      const mod = await import("electron-updater");
      autoUpdater = mod.autoUpdater;
    } catch {
      safeError("[Updater] electron-updater not available");
    }
  }
  return autoUpdater;
}
function registerUpdaterHandlers() {
  ipcMain6.handle("app:check-for-updates", async () => {
    const updater2 = await getAutoUpdater();
    if (updater2) {
      try {
        await updater2.checkForUpdates();
      } catch (error) {
        safeError("[Updater] Check failed:", error);
      }
    }
  });
  ipcMain6.handle("app:install-update", async () => {
    const updater2 = await getAutoUpdater();
    if (updater2) {
      updater2.quitAndInstall();
    }
  });
}
async function initUpdaterEvents() {
  const updater2 = await getAutoUpdater();
  if (!updater2) return;
  updater2.autoDownload = true;
  updater2.autoInstallOnAppQuit = true;
  updater2.on("update-available", (info) => {
    safeLog("[Updater] Update available:", info.version);
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app:update-available", info);
    }
  });
  updater2.on("update-downloaded", (info) => {
    safeLog("[Updater] Update downloaded:", info.version);
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app:update-downloaded", info);
    }
  });
  updater2.on("error", (error) => {
    safeError("[Updater] Error:", error.message);
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app:update-error", error.message);
    }
  });
}
var ipcMain6, autoUpdater;
var init_updater = __esm({
  "electron/ipc/updater.ts"() {
    "use strict";
    init_safe_log();
    init_window_manager();
    ({ ipcMain: ipcMain6 } = require_electron());
    autoUpdater = null;
  }
});

// electron/ipc/index.ts
function registerAllIpcHandlers() {
  registerWindowHandlers();
  registerConfigHandlers();
  registerAuthHandlers();
  registerSetupHandlers();
  registerAppUpdaterHandlers();
  registerUpdaterHandlers();
  ipcMain7.handle("app:get-version", () => {
    return app3.getVersion();
  });
  ipcMain7.handle("app:get-platform", () => {
    return {
      os: process.platform,
      arch: process.arch,
      electron: process.versions.electron
    };
  });
  ipcMain7.handle("app:quit", () => {
    app3.quit();
  });
}
var ipcMain7, app3;
var init_ipc = __esm({
  "electron/ipc/index.ts"() {
    "use strict";
    init_window();
    init_config();
    init_auth();
    init_setup();
    init_app_updater2();
    init_updater();
    ({ ipcMain: ipcMain7, app: app3 } = require_electron());
  }
});

// electron/tray.ts
import path3 from "path";
function loadTrayIcon() {
  const iconPath = app4.isPackaged ? path3.join(process.resourcesPath, "iconTemplate.png") : path3.join(__dirname, "../resources/iconTemplate.png");
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(true);
  return image;
}
function createTray(wm) {
  if (tray) return;
  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("ConvexPress");
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show ConvexPress",
      click: () => {
        const win = wm.getMainWindow();
        if (win) {
          win.show();
          win.focus();
        } else {
          wm.createMainWindow();
        }
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        setQuitting(true);
        app4.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    const win = wm.getMainWindow();
    if (win) {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    } else {
      wm.createMainWindow();
    }
  });
}
var app4, Menu, nativeImage, Tray, tray;
var init_tray = __esm({
  "electron/tray.ts"() {
    "use strict";
    init_app_state();
    ({ app: app4, Menu, nativeImage, Tray } = require_electron());
    tray = null;
  }
});

// electron/main.ts
import path4 from "path";
import { appendFileSync, writeFileSync as writeFileSync3 } from "fs";
var require_main = __commonJS({
  "electron/main.ts"() {
    init_ipc();
    init_app_updater2();
    init_updater();
    init_tray();
    init_json_store();
    init_app_state();
    init_safe_log();
    init_window_manager();
    init_version();
    var {
      app: app5,
      BrowserWindow: BrowserWindow3,
      ipcMain: ipcMain8,
      nativeImage: nativeImage2,
      nativeTheme,
      session
    } = require_electron();
    app5.setName("ConvexPress");
    if (!app5.isPackaged) {
      app5.setPath("userData", path4.join(app5.getPath("userData"), "-dev"));
    }
    var LOG_FILE = path4.join(app5.getPath("userData"), "convexpress-debug.log");
    function fileLog(msg) {
      const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`;
      try {
        appendFileSync(LOG_FILE, line);
      } catch {
      }
      safeLog(msg);
    }
    try {
      writeFileSync3(
        LOG_FILE,
        `=== ConvexPress started ${(/* @__PURE__ */ new Date()).toISOString()} ===
`
      );
    } catch {
    }
    var fixPath = __require("fix-path");
    fixPath();
    if (process.platform === "darwin") {
      const home = process.env.HOME ?? "";
      const ensure = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        `${home}/.bun/bin`,
        `${home}/.volta/bin`,
        `${home}/.local/bin`,
        `${home}/.cargo/bin`
      ];
      const parts = (process.env.PATH ?? "").split(":");
      const missing = ensure.filter((p) => !parts.includes(p));
      if (missing.length) {
        process.env.PATH = [...missing, ...parts].join(":");
      }
    }
    var store2 = new JsonStore({ name: "convexpress-config" });
    process.on("uncaughtException", (error) => {
      safeError("[Main] Uncaught exception:", error);
    });
    process.on("unhandledRejection", (reason) => {
      safeError("[Main] Unhandled rejection:", reason);
    });
    function isSetupComplete() {
      const setupComplete = store2.get("setupComplete");
      const convexUrl = store2.get("convexUrl");
      return !!(setupComplete && convexUrl);
    }
    function launchApp() {
      createTray(windowManager);
      const mainWindow = windowManager.createMainWindow();
      nativeTheme.on("updated", () => {
        const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
        const win = windowManager.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("theme:os-changed", theme);
        }
      });
      if (app5.isPackaged) {
        const installPath = path4.dirname(app5.getAppPath());
        const manifest = readManifest(installPath);
        if (manifest) {
          fileLog(`[Main] App-content updater initialized at ${installPath}`);
          initAppUpdater(installPath);
        } else {
          fileLog("[Main] No version manifest found \u2014 app-content updater skipped");
        }
      }
      initUpdaterEvents().catch((err) => {
        fileLog(`[Main] Shell auto-updater init failed: ${err}`);
      });
    }
    var gotTheLock = app5.requestSingleInstanceLock();
    if (!gotTheLock) {
      app5.quit();
    } else {
      app5.on("second-instance", () => {
        const win = windowManager.getMainWindow();
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
      });
    }
    app5.whenReady().then(async () => {
      fileLog("[Main] App ready");
      if (process.platform === "darwin" && app5.dock && !app5.isPackaged) {
        const iconPath = path4.join(__dirname, "../resources/icon_dock.png");
        try {
          const dockIcon = nativeImage2.createFromPath(iconPath);
          if (!dockIcon.isEmpty()) {
            app5.dock.setIcon(dockIcon);
            fileLog("[Main] Dock icon set");
          }
        } catch (err) {
          safeError("[Main] Failed to set dock icon:", err);
        }
      }
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const csp = app5.isPackaged ? [
          "default-src 'self' file: blob:",
          "script-src 'self' file: 'unsafe-inline'",
          "style-src 'self' file: 'unsafe-inline'",
          "connect-src 'self' https://*.convex.cloud https://*.convex.dev https://*.convex.site wss://*.convex.cloud wss://*.convex.dev https://convex.cloud https://convex.dev",
          "img-src 'self' file: data: blob:",
          "font-src 'self' file: data:",
          "frame-ancestors 'none'"
        ].join("; ") : [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://*.convex.cloud https://*.convex.dev https://*.convex.site wss://*.convex.cloud wss://*.convex.dev https://convex.cloud https://convex.dev",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "frame-ancestors 'none'",
          "base-uri 'self'"
        ].join("; ");
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [csp]
          }
        });
      });
      registerAllIpcHandlers();
      let appLaunched = false;
      ipcMain8.handle("app:reload-from-setup", () => {
        if (appLaunched) return;
        appLaunched = true;
        fileLog("[Main] Setup complete \u2014 launching app");
        for (const win of BrowserWindow3.getAllWindows()) {
          win.destroy();
        }
        launchApp();
      });
      if (!app5.isPackaged) {
        fileLog("[Main] Dev mode \u2014 launching app directly");
        launchApp();
      } else if (isSetupComplete()) {
        fileLog("[Main] Setup complete \u2014 launching app");
        launchApp();
      } else {
        fileLog("[Main] Setup not complete \u2014 showing wizard");
        windowManager.createWizardWindow();
      }
    });
    app5.on("window-all-closed", () => {
    });
    app5.on("activate", () => {
      if (isSetupComplete() || !app5.isPackaged) {
        windowManager.createMainWindow();
      }
    });
    app5.on("before-quit", () => {
      fileLog("[Main] App quitting \u2014 cleaning up");
      setQuitting(true);
    });
  }
});
export default require_main();
