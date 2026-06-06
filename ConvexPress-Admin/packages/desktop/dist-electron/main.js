"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_node_path7 = __toESM(require("path"));
var import_node_fs5 = require("fs");

// electron/ipc/window.ts
var { ipcMain, BrowserWindow } = require("electron");
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

// electron/utils/json-store.ts
var import_node_fs = require("fs");
var import_node_path = __toESM(require("path"));
var { app } = require("electron");
function ensureParentDir(filePath) {
  const dir = import_node_path.default.dirname(filePath);
  if (!(0, import_node_fs.existsSync)(dir)) {
    (0, import_node_fs.mkdirSync)(dir, { recursive: true });
  }
}
var JsonStore = class {
  name;
  defaults;
  constructor(options) {
    this.name = options.name;
    this.defaults = options.defaults ?? {};
  }
  getFilePath() {
    return import_node_path.default.join(app.getPath("userData"), `${this.name}.json`);
  }
  readState() {
    const filePath = this.getFilePath();
    if (!(0, import_node_fs.existsSync)(filePath)) {
      return { ...this.defaults };
    }
    try {
      const raw = (0, import_node_fs.readFileSync)(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return { ...this.defaults, ...parsed };
    } catch {
      return { ...this.defaults };
    }
  }
  writeState(state) {
    const filePath = this.getFilePath();
    ensureParentDir(filePath);
    (0, import_node_fs.writeFileSync)(filePath, JSON.stringify(state, null, 2));
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

// electron/ipc/configValidation.ts
var READABLE_CONFIG_KEYS = /* @__PURE__ */ new Set([
  "mode",
  "convexUrl",
  "convexSiteUrl",
  "siteName",
  "setupComplete",
  "pendingAdminCredentials",
  "pendingLoginCredentials"
]);
var CLEARABLE_CONFIG_KEYS = /* @__PURE__ */ new Set([
  "pendingAdminCredentials",
  "pendingLoginCredentials"
]);
function assertReadableConfigKey(key) {
  if (!READABLE_CONFIG_KEYS.has(key)) {
    throw new Error(`Config key not allowed: ${key}`);
  }
}
function assertRendererConfigClear(key, value) {
  if (!CLEARABLE_CONFIG_KEYS.has(key)) {
    throw new Error(`Config key is read-only: ${key}`);
  }
  if (value !== null) {
    throw new Error(`Config key can only be cleared from the renderer: ${key}`);
  }
}

// electron/ipc/setupValidation.ts
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var CONVEX_CLOUD_URL_RE = /^https:\/\/[a-z0-9-]+\.convex\.cloud$/;
function cleanUrl(value) {
  return value.trim().replace(/\/+$/, "");
}
function requireTrimmed(value, label) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}
function deriveConvexSiteUrl(convexUrl) {
  const cleaned = cleanUrl(convexUrl);
  try {
    const url = new URL(cleaned);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
      return cleanUrl(url.toString());
    }
  } catch {
  }
  return cleaned;
}
function validateSetupMode(mode) {
  if (mode !== "server" && mode !== "client") {
    throw new Error("Setup mode must be either server or client.");
  }
  return mode;
}
function normalizeConvexCloudUrl(value) {
  const cleaned = requireTrimmed(value, "Convex URL").replace(/\/+$/, "");
  if (!CONVEX_CLOUD_URL_RE.test(cleaned)) {
    throw new Error(
      "Convex URL must match https://your-app-123.convex.cloud."
    );
  }
  return cleaned;
}
function resolveConvexSiteUrl(convexUrl, explicitSiteUrl) {
  const derivedSiteUrl = deriveConvexSiteUrl(convexUrl);
  if (!explicitSiteUrl) return derivedSiteUrl;
  const cleanedSiteUrl = cleanUrl(explicitSiteUrl);
  if (cleanedSiteUrl !== derivedSiteUrl) {
    throw new Error("Convex site URL must match the deployment URL.");
  }
  return cleanedSiteUrl;
}
function validateServerAdminCredentials(config) {
  const displayName = requireTrimmed(config.adminName, "Admin name");
  const email = requireTrimmed(config.adminEmail, "Admin email").toLowerCase();
  const password = config.adminPassword;
  if (!EMAIL_RE.test(email)) {
    throw new Error("Admin email must be a valid email address.");
  }
  if (!password || password.length < 8) {
    throw new Error("Admin password must be at least 8 characters.");
  }
  return { displayName, email, password };
}
function validateClientLoginCredentials(config) {
  const identifier = requireTrimmed(
    config.clientIdentifier,
    "Client username or email"
  );
  const password = config.clientPassword;
  if (!password) {
    throw new Error("Client password is required.");
  }
  return { identifier, password };
}
function validateSetupConfig(config) {
  const mode = validateSetupMode(config.mode);
  const convexUrl = normalizeConvexCloudUrl(config.convexUrl);
  const convexSiteUrl = resolveConvexSiteUrl(
    convexUrl,
    config.convexSiteUrl
  );
  return {
    mode,
    convexUrl,
    convexSiteUrl,
    pendingAdminCredentials: mode === "server" ? validateServerAdminCredentials(config) : null,
    pendingLoginCredentials: mode === "client" ? validateClientLoginCredentials(config) : null
  };
}

// electron/ipc/config.ts
var { ipcMain: ipcMain2, net } = require("electron");
var store = new JsonStore({ name: "convexpress-config" });
function registerConfigHandlers() {
  ipcMain2.handle("config:get", (_event, key) => {
    assertReadableConfigKey(key);
    return store.get(key);
  });
  ipcMain2.handle("config:set", (_event, key, value) => {
    assertRendererConfigClear(key, value);
    store.delete(key);
  });
  ipcMain2.handle("config:test-connection", async (_event, url) => {
    let cleanUrl2;
    try {
      cleanUrl2 = normalizeConvexCloudUrl(url);
    } catch (error) {
      return {
        ok: false,
        status: 400,
        error: error instanceof Error ? error.message : "Invalid Convex URL."
      };
    }
    const endpoints = [
      `${cleanUrl2}/.well-known/openid-configuration`,
      `${cleanUrl2}/version`
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

// electron/ipc/auth.ts
var { ipcMain: ipcMain3 } = require("electron");
var authStore = new JsonStore({
  name: "convexpress-auth"
});
var ALLOWED_PREFIXES = ["__convexAuth", "convexAuth"];
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

// electron/ipc/setup.ts
var import_node_child_process = require("child_process");
var import_node_fs2 = require("fs");
var import_node_os = require("os");
var import_node_path2 = __toESM(require("path"));
var import_node_crypto = require("crypto");
var { ipcMain: ipcMain4 } = require("electron");
function deriveDeployment(config) {
  const deployKey = config.adminKey?.trim();
  if (!deployKey) {
    throw new Error("Deploy key is required for server setup.");
  }
  const [deployment] = deployKey.split("|", 1);
  if (!deployment || !deployment.startsWith("prod:")) {
    throw new Error("Deploy key must start with a production deployment reference.");
  }
  const deploymentName = deployment.replace(/^prod:/, "");
  if (!deploymentName) {
    throw new Error("Deploy key is missing the deployment name.");
  }
  return { deployKey, deployment };
}
function resolveBackendRoot() {
  const candidates = [
    import_node_path2.default.resolve(__dirname, "../../backend"),
    import_node_path2.default.resolve(process.cwd(), "../backend"),
    import_node_path2.default.resolve(process.cwd(), "../../packages/backend")
  ];
  for (const candidate of candidates) {
    if ((0, import_node_fs2.existsSync)(import_node_path2.default.join(candidate, "package.json")) && (0, import_node_fs2.existsSync)(import_node_path2.default.join(candidate, "convex"))) {
      return candidate;
    }
  }
  throw new Error(
    "Could not find the Convex backend source. Reinstall from a full ConvexPress checkout and try again."
  );
}
function generateAuthPrivateKey() {
  const { privateKey } = (0, import_node_crypto.generateKeyPairSync)("ec", {
    namedCurve: "P-256"
  });
  return privateKey.export({
    type: "pkcs8",
    format: "pem"
  });
}
function parseEnvFile(filePath) {
  if (!(0, import_node_fs2.existsSync)(filePath)) return {};
  const env = {};
  const raw = (0, import_node_fs2.readFileSync)(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    env[key] = value.replace(/\\n/g, "\n");
  }
  return env;
}
function loadLocalEnv(backendRoot) {
  const candidates = [
    import_node_path2.default.resolve(backendRoot, ".env.local"),
    import_node_path2.default.resolve(backendRoot, "../../.env.local"),
    import_node_path2.default.resolve(backendRoot, "../../apps/web/.env.local"),
    import_node_path2.default.resolve(backendRoot, "../../apps/web/.env")
  ];
  return candidates.reduce(
    (merged, filePath) => ({ ...merged, ...parseEnvFile(filePath) }),
    {}
  );
}
function readEnvValue(name) {
  const value = process.env[name]?.trim();
  return value ? value : void 0;
}
function readSetupEnvValue(name, localEnv) {
  const processValue = readEnvValue(name);
  if (processValue) return processValue;
  const localValue = localEnv[name]?.trim();
  return localValue ? localValue : void 0;
}
function envFileValue(value) {
  return JSON.stringify(value);
}
function inferClerkIssuerDomain(localEnv) {
  const explicit = readSetupEnvValue("CLERK_JWT_ISSUER_DOMAIN", localEnv);
  if (explicit) return explicit;
  const publishableKey = readSetupEnvValue(
    "VITE_CLERK_PUBLISHABLE_KEY",
    localEnv
  );
  if (!publishableKey) return void 0;
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const host = decoded.replace(/\$$/, "").trim();
    if (!host) return void 0;
    return host.startsWith("http") ? host : `https://${host}`;
  } catch {
    return void 0;
  }
}
function createBackendEnvFile(convexSiteUrl, backendRoot) {
  const localEnv = loadLocalEnv(backendRoot);
  const tempDir = (0, import_node_fs2.mkdtempSync)(import_node_path2.default.join((0, import_node_os.tmpdir)(), "convexpress-setup-"));
  const filePath = import_node_path2.default.join(tempDir, "convex-env.local");
  const envVars = {
    AUTH_PRIVATE_KEY: readSetupEnvValue("AUTH_PRIVATE_KEY", localEnv) ?? generateAuthPrivateKey(),
    AUTH_ISSUER_URL: convexSiteUrl,
    AUTH_ALLOWED_ORIGINS: readSetupEnvValue("AUTH_ALLOWED_ORIGINS", localEnv) ?? "http://localhost:4105,http://127.0.0.1:4105",
    AUTH_ALLOW_NULL_ORIGIN: readSetupEnvValue("AUTH_ALLOW_NULL_ORIGIN", localEnv) ?? "true"
  };
  const clerkSecret = readSetupEnvValue("CLERK_SECRET_KEY", localEnv);
  if (clerkSecret) envVars.CLERK_SECRET_KEY = clerkSecret;
  const clerkIssuerDomain = inferClerkIssuerDomain(localEnv);
  if (clerkIssuerDomain) envVars.CLERK_JWT_ISSUER_DOMAIN = clerkIssuerDomain;
  const siteUrl = readSetupEnvValue("SITE_URL", localEnv);
  if (siteUrl) envVars.SITE_URL = siteUrl;
  const contents = Object.entries(envVars).map(([key, value]) => `${key}=${envFileValue(value)}`).join("\n");
  (0, import_node_fs2.writeFileSync)(filePath, `${contents}
`, { mode: 384 });
  return {
    filePath,
    cleanup: () => (0, import_node_fs2.rmSync)(tempDir, { recursive: true, force: true })
  };
}
function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = (0, import_node_child_process.spawn)(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stdout.on("data", (data) => {
      const message = data.toString().trim();
      if (message) options.onOutput?.(message);
    });
    child.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        stderr += `${message}
`;
        options.onOutput?.(message);
      }
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed ${signal ? `with signal ${signal}` : `with exit code ${code}`}${stderr ? `: ${stderr.trim()}` : ""}`
        )
      );
    });
  });
}
async function deployServerBackend(config, convexSiteUrl, sendProgress) {
  const { deployKey, deployment } = deriveDeployment(config);
  const backendRoot = resolveBackendRoot();
  const env = {
    ...process.env,
    CONVEX_DEPLOYMENT: deployment,
    CONVEX_DEPLOY_KEY: deployKey
  };
  sendProgress("environment", "Preparing backend environment.");
  const envFile = createBackendEnvFile(convexSiteUrl, backendRoot);
  try {
    sendProgress("environment", "Syncing required backend environment variables.");
    await runCommand(
      "bunx",
      ["convex", "env", "set", "--from-file", envFile.filePath, "--force"],
      {
        cwd: backendRoot,
        env,
        onOutput: (message) => console.log(`[Setup IPC] Convex env: ${message}`)
      }
    );
  } finally {
    envFile.cleanup();
  }
  sendProgress("codegen", "Regenerating extension schema index.");
  await runCommand("node", ["scripts/generate-extension-index.mjs"], {
    cwd: backendRoot,
    env,
    onOutput: (message) => console.log(`[Setup IPC] Codegen: ${message}`)
  });
  sendProgress("deploy", "Deploying Convex backend code.");
  await runCommand(
    "bunx",
    [
      "convex",
      "deploy",
      "--typecheck",
      "disable",
      "--message",
      "ConvexPress desktop setup wizard"
    ],
    {
      cwd: backendRoot,
      env,
      onOutput: (message) => console.log(`[Setup IPC] Convex deploy: ${message}`)
    }
  );
}
function registerSetupHandlers() {
  ipcMain4.handle(
    "setup:complete",
    async (event, config) => {
      const sendProgress = (phase, message) => {
        event.sender.send("setup:progress", { phase, message });
      };
      try {
        sendProgress("validating", "Validating setup configuration.");
        const validated = validateSetupConfig(config);
        if (validated.mode === "server") {
          await deployServerBackend(
            config,
            validated.convexSiteUrl,
            sendProgress
          );
        }
        sendProgress("saving", "Saving local desktop configuration.");
        store.set("mode", validated.mode);
        store.set("convexUrl", validated.convexUrl);
        store.set("convexSiteUrl", validated.convexSiteUrl);
        store.delete("adminKey");
        if (config.siteName) {
          store.set("siteName", config.siteName);
        }
        if (validated.pendingAdminCredentials) {
          store.set(
            "pendingAdminCredentials",
            validated.pendingAdminCredentials
          );
        } else {
          store.delete("pendingAdminCredentials");
        }
        if (validated.pendingLoginCredentials) {
          store.set(
            "pendingLoginCredentials",
            validated.pendingLoginCredentials
          );
        } else {
          store.delete("pendingLoginCredentials");
        }
        store.set("setupComplete", true);
        sendProgress("complete", "Setup configuration saved.");
        console.log(
          `[Setup IPC] Config saved: mode=${validated.mode}, url=${validated.convexUrl}`
        );
        return { success: true };
      } catch (error) {
        console.error("[Setup IPC] Failed to save config:", error);
        return { success: false, error: String(error) };
      }
    }
  );
}

// electron/app-updater.ts
var import_node_child_process2 = require("child_process");
var import_node_fs4 = require("fs");
var import_node_path4 = require("path");
var import_node_util = require("util");
var import_node_events = require("events");

// electron/version.ts
var import_node_fs3 = require("fs");
var import_node_path3 = require("path");
var import_node_os2 = require("os");
var MANIFEST_FILENAME = ".convexpress-version.json";
function getManifestPath(installPath) {
  return (0, import_node_path3.join)(installPath, MANIFEST_FILENAME);
}
function readManifest(installPath) {
  const manifestPath = getManifestPath(installPath);
  if (!(0, import_node_fs3.existsSync)(manifestPath)) return null;
  try {
    return JSON.parse((0, import_node_fs3.readFileSync)(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}
function writeManifest(installPath, manifest) {
  const targetPath = getManifestPath(installPath);
  const tempPath = (0, import_node_path3.join)(
    (0, import_node_os2.tmpdir)(),
    `convexpress-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  (0, import_node_fs3.writeFileSync)(tempPath, JSON.stringify(manifest, null, 2));
  (0, import_node_fs3.renameSync)(tempPath, targetPath);
}

// electron/app-updater.ts
var { net: net2 } = require("electron");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process2.execFile);
var AppUpdater = class extends import_node_events.EventEmitter {
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
          phase: "regenerating-extensions",
          message: "Regenerating extension index...",
          percent: 50
        });
        try {
          await execFileAsync(
            pm,
            ["run", "--filter", "@convexpress-admin/backend", "codegen:extensions"],
            { cwd: this.installPath, shell: true }
          );
        } catch (extErr) {
          this.emit("update-progress", {
            phase: "regenerating-extensions",
            message: `Extension regen warning: ${extErr instanceof Error ? extErr.message : String(extErr)}`,
            percent: 55
          });
        }
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
    if ((0, import_node_fs4.existsSync)((0, import_node_path4.join)(this.installPath, "bun.lock")) || (0, import_node_fs4.existsSync)((0, import_node_path4.join)(this.installPath, ".bun-version"))) {
      try {
        await execFileAsync("bun", ["--version"], { shell: true });
        return "bun";
      } catch {
      }
    }
    return "npm";
  }
};

// electron/window-manager.ts
var import_node_path5 = __toESM(require("path"));

// electron/utils/app-state.ts
var quitting = false;
function setQuitting(value) {
  quitting = value;
}
function isQuitting() {
  return quitting;
}

// electron/utils/platform.ts
var { app: app2 } = require("electron");
function isDev() {
  return !app2.isPackaged || process.env.CONVEXPRESS_DESKTOP_DEV === "1";
}

// electron/window-manager.ts
var { app: app3, BrowserWindow: BrowserWindow2, shell } = require("electron");
function getPreloadPath() {
  return import_node_path5.default.join(__dirname, "preload.js");
}
function getIconPath() {
  return import_node_path5.default.join(__dirname, "../resources/icon.png");
}
function getRendererIndexPath() {
  return import_node_path5.default.join(__dirname, "..", "dist", "index.html");
}
var WindowManager = class {
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
    if (isDev()) {
      win.loadURL(process.env.CONVEXPRESS_DESKTOP_DEV_URL ?? "http://localhost:4105");
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
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      const isInternal = isDev() ? url.startsWith("http://localhost:") : url.startsWith("file://");
      if (!isInternal) {
        event.preventDefault();
        void shell.openExternal(url);
      }
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
    win.loadFile(import_node_path5.default.join(__dirname, "wizard", "index.html"));
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
var windowManager = new WindowManager();

// electron/ipc/app-updater.ts
var { ipcMain: ipcMain5 } = require("electron");
var updater = null;
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

// electron/ipc/updater.ts
var { ipcMain: ipcMain6 } = require("electron");
var autoUpdater = null;
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

// electron/ipc/index.ts
var { ipcMain: ipcMain7, app: app4 } = require("electron");
function registerAllIpcHandlers() {
  registerWindowHandlers();
  registerConfigHandlers();
  registerAuthHandlers();
  registerSetupHandlers();
  registerAppUpdaterHandlers();
  registerUpdaterHandlers();
  ipcMain7.handle("app:get-version", () => {
    return app4.getVersion();
  });
  ipcMain7.handle("app:get-platform", () => {
    return {
      os: process.platform,
      arch: process.arch,
      electron: process.versions.electron
    };
  });
  ipcMain7.handle("app:quit", () => {
    app4.quit();
  });
}

// electron/tray.ts
var import_node_path6 = __toESM(require("path"));
var { app: app5, Menu, nativeImage, Tray } = require("electron");
var tray = null;
function loadTrayIcon() {
  const iconPath = isDev() ? import_node_path6.default.join(__dirname, "../resources/iconTemplate.png") : import_node_path6.default.join(process.resourcesPath, "iconTemplate.png");
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(false);
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
        app5.quit();
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

// electron/main.ts
var {
  app: app6,
  BrowserWindow: BrowserWindow3,
  ipcMain: ipcMain8,
  nativeTheme,
  session
} = require("electron");
app6.setName("ConvexPress");
if (isDev()) {
  app6.setPath("userData", import_node_path7.default.join(app6.getPath("userData"), "-dev"));
}
var LOG_FILE = import_node_path7.default.join(app6.getPath("userData"), "convexpress-debug.log");
function fileLog(msg) {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`;
  try {
    (0, import_node_fs5.appendFileSync)(LOG_FILE, line);
  } catch {
  }
  safeLog(msg);
}
try {
  (0, import_node_fs5.writeFileSync)(
    LOG_FILE,
    `=== ConvexPress started ${(/* @__PURE__ */ new Date()).toISOString()} ===
`
  );
} catch {
}
var fixPath = require("fix-path");
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
function removeDeprecatedSecretsFromConfig() {
  if (store2.get("adminKey") !== void 0) {
    store2.delete("adminKey");
    fileLog("[Main] Removed deprecated deploy key from desktop config");
  }
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
  if (app6.isPackaged && !isDev()) {
    const installPath = import_node_path7.default.dirname(app6.getAppPath());
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
var gotTheLock = app6.requestSingleInstanceLock();
if (!gotTheLock) {
  app6.quit();
} else {
  app6.on("second-instance", () => {
    const win = windowManager.getMainWindow() ?? windowManager.getWizardWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}
app6.whenReady().then(async () => {
  fileLog("[Main] App ready");
  removeDeprecatedSecretsFromConfig();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev() ? [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://*.convex.cloud https://*.convex.dev https://*.convex.site wss://*.convex.cloud wss://*.convex.dev https://convex.cloud https://convex.dev",
      "img-src 'self' data: blob: http://localhost:* http://127.0.0.1:* https://*.convex.cloud https://*.convex.site https://convex.cloud https://secure.gravatar.com",
      "media-src 'self' data: blob: http://localhost:* http://127.0.0.1:* https://*.convex.cloud https://*.convex.site",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'"
    ].join("; ") : [
      "default-src 'self' file: blob:",
      "script-src 'self' file: 'unsafe-inline'",
      "style-src 'self' file: 'unsafe-inline'",
      "connect-src 'self' https://*.convex.cloud https://*.convex.dev https://*.convex.site wss://*.convex.cloud wss://*.convex.dev https://convex.cloud https://convex.dev",
      "img-src 'self' file: data: blob: https://*.convex.cloud https://*.convex.site https://convex.cloud https://secure.gravatar.com",
      "media-src 'self' file: data: blob: https://*.convex.cloud https://*.convex.site",
      "font-src 'self' file: data:",
      "frame-ancestors 'none'"
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
  if (isSetupComplete()) {
    fileLog("[Main] Setup complete \u2014 launching app");
    launchApp();
  } else {
    fileLog("[Main] Setup not complete \u2014 showing wizard");
    windowManager.createWizardWindow();
  }
});
app6.on("window-all-closed", () => {
});
app6.on("activate", () => {
  if (isSetupComplete()) {
    windowManager.createMainWindow();
  } else {
    windowManager.createWizardWindow();
  }
});
app6.on("before-quit", () => {
  fileLog("[Main] App quitting \u2014 cleaning up");
  setQuitting(true);
});
