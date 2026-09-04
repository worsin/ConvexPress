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
var import_node_path16 = __toESM(require("path"));
var import_node_fs8 = require("fs");
var import_node_url2 = require("url");

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

// electron/ipc/config.ts
var import_node_path3 = __toESM(require("path"));

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

// electron/utils/platform.ts
var { app: app2 } = require("electron");
function isDev() {
  return !app2.isPackaged || process.env.CONVEXPRESS_DESKTOP_DEV === "1";
}

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

// electron/ipc/setupSender.ts
var import_node_url = require("url");

// electron/rendererProtocol.ts
var import_node_path2 = __toESM(require("path"));
var PACKAGED_RENDERER_SCHEME = "convexpress-app";
var PACKAGED_RENDERER_HOST = "shell";
var PACKAGED_RENDERER_ENTRY_URL = `${PACKAGED_RENDERER_SCHEME}://${PACKAGED_RENDERER_HOST}/index.html`;
function resolvePackagedRendererPath(rendererRoot, requestUrl) {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    throw new Error("Malformed packaged renderer URL.");
  }
  if (parsed.protocol !== `${PACKAGED_RENDERER_SCHEME}:` || parsed.hostname !== PACKAGED_RENDERER_HOST || parsed.username !== "" || parsed.password !== "" || parsed.port !== "") {
    throw new Error("Untrusted packaged renderer origin.");
  }
  const originPrefix = `${PACKAGED_RENDERER_SCHEME}://${PACKAGED_RENDERER_HOST}`;
  if (!requestUrl.startsWith(originPrefix)) {
    throw new Error("Untrusted packaged renderer origin.");
  }
  const rawPathname = requestUrl.slice(originPrefix.length).split(/[?#]/, 1)[0] || "/";
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    throw new Error("Malformed packaged renderer path encoding.");
  }
  if (pathname.includes("\0") || pathname.split(/[\\/]/).some((segment) => segment === "..")) {
    throw new Error("Packaged renderer path traversal is not allowed.");
  }
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const resolvedRoot = import_node_path2.default.resolve(rendererRoot);
  const resolvedPath = import_node_path2.default.resolve(resolvedRoot, `.${requestedPath}`);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${import_node_path2.default.sep}`)) {
    throw new Error("Packaged renderer path escaped its root.");
  }
  return resolvedPath;
}

// electron/ipc/setupSender.ts
var DEFAULT_DEV_RENDERER_URL = "http://localhost:4105";
function parseSenderUrl(senderUrl) {
  if (!senderUrl) return null;
  try {
    return new URL(senderUrl);
  } catch {
    return null;
  }
}
function hrefWithoutHash(url) {
  const copy = new URL(url.href);
  copy.hash = "";
  return copy.href;
}
function fileHrefWithoutHash(filePath) {
  const url = (0, import_node_url.pathToFileURL)(filePath);
  url.hash = "";
  return url.href;
}
function getTrustedDevRendererOrigin(devRendererUrl = process.env.CONVEXPRESS_DESKTOP_DEV_URL ?? DEFAULT_DEV_RENDERER_URL) {
  const parsed = parseSenderUrl(devRendererUrl) ?? new URL(DEFAULT_DEV_RENDERER_URL);
  return parsed.origin;
}
function isDevAppRendererSender(senderUrl, devRendererUrl) {
  const url = parseSenderUrl(senderUrl);
  if (!url) return false;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.origin === getTrustedDevRendererOrigin(devRendererUrl);
}
function isPackagedAppRendererSender(senderUrl, _rendererIndexPath) {
  const url = parseSenderUrl(senderUrl);
  return !!(url && url.protocol === `${PACKAGED_RENDERER_SCHEME}:` && url.hostname === PACKAGED_RENDERER_HOST && url.username === "" && url.password === "" && url.port === "" && url.pathname === "/index.html");
}
function isAppRendererSender(senderUrl, options = {}) {
  return isDevAppRendererSender(senderUrl, options.devRendererUrl) || isPackagedAppRendererSender(senderUrl, options.rendererIndexPath);
}
function isWizardSender(senderUrl) {
  const url = parseSenderUrl(senderUrl);
  return !!(url && url.protocol === "file:" && url.pathname.endsWith("/wizard/index.html"));
}
function isExactWizardSender(senderUrl, wizardIndexPath) {
  const url = parseSenderUrl(senderUrl);
  if (!url || url.protocol !== "file:") return false;
  return hrefWithoutHash(url) === fileHrefWithoutHash(wizardIndexPath);
}
function isTrustedDesktopSender(senderUrl, options = {}) {
  return isAppRendererSender(senderUrl, options) || (options.wizardIndexPath ? isExactWizardSender(senderUrl, options.wizardIndexPath) : isWizardSender(senderUrl));
}

// electron/ipc/setupValidation.ts
var import_node_crypto = require("crypto");
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var CONVEX_CLOUD_URL_RE = /^https:\/\/[a-z0-9-]+\.convex\.cloud$/;
var DEPLOYMENT_NAME_RE = /^[a-z0-9-]+$/;
var MAX_CONVEX_URL_LENGTH = 128;
var MAX_DEPLOY_KEY_LENGTH = 4096;
var MAX_EMAIL_LENGTH = 254;
var MAX_DISPLAY_NAME_LENGTH = 128;
var MAX_PASSWORD_LENGTH = 256;
var MAX_IDENTIFIER_LENGTH = 254;
var AUTH_PRIVATE_KEY_ERROR = "AUTH_PRIVATE_KEY must be a PEM-encoded P-256 PKCS8 private key for ES256 local admin auth.";
function cleanUrl(value) {
  return value.trim().replace(/\/+$/, "");
}
function requireTrimmed(value, label, options = {}) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  if (options.maxLength && trimmed.length > options.maxLength) {
    throw new Error(`${label} must be ${options.maxLength} characters or fewer.`);
  }
  return trimmed;
}
function validateStringLength(value, label, maxLength) {
  if (value.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
}
function validateAuthPrivateKey(value) {
  const trimmed = requireTrimmed(value, "AUTH_PRIVATE_KEY");
  try {
    const key = (0, import_node_crypto.createPrivateKey)(trimmed);
    const namedCurve = key.asymmetricKeyDetails?.namedCurve;
    const isP256 = key.asymmetricKeyType === "ec" && (namedCurve === "prime256v1" || namedCurve === "P-256");
    if (!isP256) {
      throw new Error(AUTH_PRIVATE_KEY_ERROR);
    }
    return trimmed;
  } catch (error) {
    if (error instanceof Error && error.message === AUTH_PRIVATE_KEY_ERROR) {
      throw error;
    }
    throw new Error(AUTH_PRIVATE_KEY_ERROR);
  }
}
function deriveConvexSiteUrl(convexUrl) {
  const cleaned = cleanUrl(convexUrl);
  try {
    const url = new URL(cleaned);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
      return cleanUrl(url.toString());
    }
    if (url.port) {
      url.port = String(Number(url.port) + 1);
      return url.origin;
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
function isPrivateHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || !host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}
function classifyDeploymentUrl(value) {
  const cleaned = requireTrimmed(value, "Convex URL", {
    maxLength: MAX_CONVEX_URL_LENGTH
  }).replace(/\/+$/, "");
  if (CONVEX_CLOUD_URL_RE.test(cleaned)) return { url: cleaned, kind: "cloud" };
  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error("Convex URL must be https://your-app-123.convex.cloud or your self-hosted backend origin.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Convex URL must start with http:// or https://.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username) {
    throw new Error("Convex URL must be a bare origin (no path or query).");
  }
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".convex.site")) {
    throw new Error("That is the deployment's HTTP actions host. Enter the https://your-app-123.convex.cloud URL instead.");
  }
  if (host.endsWith(".convex.cloud") || host.includes(".convex.cloud.")) {
    throw new Error("Convex URL must match https://your-app-123.convex.cloud.");
  }
  if (host.startsWith("169.254.") || host === "metadata.google.internal") {
    throw new Error("Convex URL must not point at a link-local address.");
  }
  if (parsed.protocol === "http:" && !isPrivateHost(host)) {
    throw new Error("Plain-http deployments are only accepted on private networks; use https for public hosts.");
  }
  return { url: parsed.origin, kind: "self-hosted" };
}
function normalizeConvexCloudUrl(value) {
  return classifyDeploymentUrl(value).url;
}
function getDeploymentNameFromConvexUrl(convexUrl) {
  const normalizedUrl = normalizeConvexCloudUrl(convexUrl);
  const host = new URL(normalizedUrl).hostname;
  return host.replace(/\.convex\.cloud$/, "");
}
function validateDeploymentCredential(value, convexUrl) {
  const target = classifyDeploymentUrl(convexUrl);
  if (target.kind === "cloud") {
    return { kind: "cloud", ...validateProductionDeployKey(value, target.url) };
  }
  const adminKey = requireTrimmed(value, "Admin key", { maxLength: 16384 });
  if (adminKey.length < 16 || /\s/.test(adminKey)) {
    throw new Error("Enter the deployment admin key (from generate_admin_key.sh) for a self-hosted backend.");
  }
  return { kind: "self-hosted", adminKey, convexUrl: target.url };
}
function validateProductionDeployKey(value, convexUrl) {
  const deployKey = requireTrimmed(value, "Deploy key", {
    maxLength: MAX_DEPLOY_KEY_LENGTH
  });
  const parts = deployKey.split("|");
  if (parts.length !== 2 || !parts[1]?.trim()) {
    throw new Error("Deploy key must include a deployment reference and token.");
  }
  const deployment = parts[0];
  if (!deployment.startsWith("prod:")) {
    throw new Error("Deploy key must start with a production deployment reference.");
  }
  const deploymentName = deployment.replace(/^prod:/, "");
  if (!DEPLOYMENT_NAME_RE.test(deploymentName)) {
    throw new Error("Deploy key is missing a valid deployment name.");
  }
  const expectedDeploymentName = getDeploymentNameFromConvexUrl(convexUrl);
  if (deploymentName !== expectedDeploymentName) {
    throw new Error("Deploy key deployment must match the Convex URL.");
  }
  return { deployKey, deployment };
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
  const displayName = requireTrimmed(config.adminName, "Admin name", {
    maxLength: MAX_DISPLAY_NAME_LENGTH
  });
  const email = requireTrimmed(config.adminEmail, "Admin email", {
    maxLength: MAX_EMAIL_LENGTH
  }).toLowerCase();
  const password = config.adminPassword;
  if (!EMAIL_RE.test(email)) {
    throw new Error("Admin email must be a valid email address.");
  }
  if (!password || password.length < 8) {
    throw new Error("Admin password must be at least 8 characters.");
  }
  validateStringLength(password, "Admin password", MAX_PASSWORD_LENGTH);
  return { displayName, email, password };
}
function validateClientLoginCredentials(config) {
  const identifier = requireTrimmed(
    config.clientIdentifier,
    "Client username or email",
    { maxLength: MAX_IDENTIFIER_LENGTH }
  );
  const password = config.clientPassword;
  if (!password) {
    throw new Error("Client password is required.");
  }
  validateStringLength(password, "Client password", MAX_PASSWORD_LENGTH);
  return { identifier, password };
}
function validateSetupConfig(config) {
  const mode = validateSetupMode(config.mode);
  const convexUrl = normalizeConvexCloudUrl(config.convexUrl);
  const convexSiteUrl = resolveConvexSiteUrl(
    convexUrl,
    config.convexSiteUrl
  );
  if (mode === "server") {
    validateDeploymentCredential(config.adminKey, convexUrl);
  }
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
function getRendererIndexPath() {
  return import_node_path3.default.join(__dirname, "..", "dist", "index.html");
}
function getWizardIndexPath() {
  return import_node_path3.default.join(__dirname, "wizard", "index.html");
}
function isConfigAppSender(senderUrl) {
  return isDev() ? isDevAppRendererSender(senderUrl) : isAppRendererSender(senderUrl, {
    rendererIndexPath: getRendererIndexPath()
  });
}
function isConfigDesktopSender(senderUrl) {
  return isDev() ? isDevAppRendererSender(senderUrl) || isExactWizardSender(senderUrl, getWizardIndexPath()) : isTrustedDesktopSender(senderUrl, {
    rendererIndexPath: getRendererIndexPath(),
    wizardIndexPath: getWizardIndexPath()
  });
}
function registerConfigHandlers() {
  ipcMain2.handle("config:get", (event, key) => {
    if (!isConfigAppSender(event.sender.getURL())) {
      throw new Error("Config can only be read from the ConvexPress app.");
    }
    assertReadableConfigKey(key);
    return store.get(key);
  });
  ipcMain2.handle("config:set", (event, key, value) => {
    if (!isConfigAppSender(event.sender.getURL())) {
      throw new Error("Config can only be changed from the ConvexPress app.");
    }
    assertRendererConfigClear(key, value);
    store.delete(key);
  });
  ipcMain2.handle("config:test-connection", async (event, url) => {
    if (!isConfigDesktopSender(event.sender.getURL())) {
      throw new Error(
        "Connection tests can only run from ConvexPress desktop windows."
      );
    }
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
var import_node_path4 = __toESM(require("path"));
var { ipcMain: ipcMain3, safeStorage } = require("electron");
var authStore = new JsonStore({
  name: "convexpress-auth"
});
var ALLOWED_PREFIXES = ["__convexAuth", "convexAuth"];
var ALLOWED_EXACT_KEYS = /* @__PURE__ */ new Set([
  "better-auth_cookie",
  "better-auth_session_data"
]);
var ENCRYPTED_VALUE_PREFIX = "safe-storage:v1:";
var MAX_AUTH_VALUE_BYTES = 512 * 1024;
function isAllowedKey(key) {
  return ALLOWED_EXACT_KEYS.has(key) || ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
}
function encryptAuthValue(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Protected authentication storage is unavailable.");
  }
  return `${ENCRYPTED_VALUE_PREFIX}${safeStorage.encryptString(value).toString("base64")}`;
}
function decryptAuthValue(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith(ENCRYPTED_VALUE_PREFIX)) return value;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Protected authentication storage is unavailable.");
  }
  return safeStorage.decryptString(
    Buffer.from(value.slice(ENCRYPTED_VALUE_PREFIX.length), "base64")
  );
}
function getRendererIndexPath2() {
  return import_node_path4.default.join(__dirname, "..", "dist", "index.html");
}
function isAuthAppSender(senderUrl) {
  return isDev() ? isDevAppRendererSender(senderUrl) : isAppRendererSender(senderUrl, {
    rendererIndexPath: getRendererIndexPath2()
  });
}
function registerAuthHandlers() {
  ipcMain3.handle("auth:get", (event, key) => {
    if (!isAuthAppSender(event.sender.getURL())) {
      throw new Error("Auth storage can only be read from the ConvexPress app.");
    }
    if (!isAllowedKey(key)) {
      console.log(`[Auth IPC] get BLOCKED key: ${key}`);
      return null;
    }
    const stored = authStore.get(key);
    const val = decryptAuthValue(stored);
    if (val !== null && typeof stored === "string" && !stored.startsWith(ENCRYPTED_VALUE_PREFIX) && safeStorage.isEncryptionAvailable()) {
      authStore.set(key, encryptAuthValue(val));
    }
    console.log(
      `[Auth IPC] get "${key}" -> ${val ? "has value (" + String(val).length + " chars)" : "null"}`
    );
    return val;
  });
  ipcMain3.handle("auth:set", (event, key, value) => {
    if (!isAuthAppSender(event.sender.getURL())) {
      throw new Error("Auth storage can only be changed from the ConvexPress app.");
    }
    if (!isAllowedKey(key)) {
      console.log(`[Auth IPC] set BLOCKED key: ${key}`);
      return;
    }
    if (typeof value !== "string") {
      console.log(`[Auth IPC] set BLOCKED non-string value for key: ${key}`);
      return;
    }
    if (Buffer.byteLength(value, "utf8") > MAX_AUTH_VALUE_BYTES) {
      throw new Error("Authentication storage value is too large.");
    }
    console.log(
      `[Auth IPC] set "${key}" -> ${value ? value.length + " chars" : "null"}`
    );
    authStore.set(key, encryptAuthValue(value));
  });
  ipcMain3.handle("auth:remove", (event, key) => {
    if (!isAuthAppSender(event.sender.getURL())) {
      throw new Error("Auth storage can only be changed from the ConvexPress app.");
    }
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
var import_node_path5 = __toESM(require("path"));
var import_node_crypto2 = require("crypto");

// electron/launchRoute.ts
var FIRST_ADMIN_SETUP_ROUTE = "/setup";
var SETUP_CREDENTIAL_HANDOFF_TTL_MS = 60 * 60 * 1e3;
var EMAIL_RE2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var SETUP_TOKEN_RE = /^[A-Za-z0-9_-]{32,256}$/;
var MAX_EMAIL_LENGTH2 = 254;
var MAX_PASSWORD_LENGTH2 = 256;
function normalizeInitialRoute(route) {
  const trimmed = route?.trim();
  if (!trimmed) return void 0;
  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return withoutHash.startsWith("/") ? withoutHash : `/${withoutHash}`;
}
function getInitialRouteForLaunch(config) {
  return isPendingAdminHandoffUsable(config.pendingAdminCredentials) || isPendingLoginHandoffUsable(config.pendingLoginCredentials) ? FIRST_ADMIN_SETUP_ROUTE : void 0;
}
function addHashRouteToUrl(url, route) {
  const normalizedRoute = normalizeInitialRoute(route);
  if (!normalizedRoute) return url;
  const parsed = new URL(url);
  parsed.hash = normalizedRoute;
  return parsed.toString();
}
function isPendingAdminHandoffUsable(value, now = Date.now()) {
  if (!value || typeof value !== "object") return false;
  const credentials = value;
  if (!hasFreshHandoffWindow(credentials, now)) return false;
  return typeof credentials.email === "string" && credentials.email.trim().length <= MAX_EMAIL_LENGTH2 && EMAIL_RE2.test(credentials.email.trim().toLowerCase()) && typeof credentials.password === "string" && credentials.password.length >= 8 && credentials.password.length <= MAX_PASSWORD_LENGTH2 && typeof credentials.setupToken === "string" && SETUP_TOKEN_RE.test(credentials.setupToken);
}
function isPendingLoginHandoffUsable(value, now = Date.now()) {
  if (!value || typeof value !== "object") return false;
  const credentials = value;
  if (!hasFreshHandoffWindow(credentials, now)) return false;
  return typeof credentials.identifier === "string" && credentials.identifier.trim().length > 0 && credentials.identifier.trim().length <= MAX_EMAIL_LENGTH2 && typeof credentials.password === "string" && credentials.password.length > 0 && credentials.password.length <= MAX_PASSWORD_LENGTH2;
}
function hasFreshHandoffWindow(credentials, now) {
  if (typeof credentials.createdAt !== "number" || !Number.isFinite(credentials.createdAt) || typeof credentials.expiresAt !== "number" || !Number.isFinite(credentials.expiresAt)) {
    return false;
  }
  return credentials.createdAt > 0 && credentials.createdAt <= now && credentials.expiresAt > now && credentials.expiresAt > credentials.createdAt && credentials.expiresAt <= credentials.createdAt + SETUP_CREDENTIAL_HANDOFF_TTL_MS;
}

// electron/ipc/setup.ts
var { ipcMain: ipcMain4 } = require("electron");
function getWizardIndexPath2() {
  return import_node_path5.default.join(__dirname, "wizard", "index.html");
}
function deriveDeployment(config) {
  return validateDeploymentCredential(config.adminKey, config.convexUrl);
}
function listDeploymentEnvNames(backendRoot, env, targetArgs) {
  return new Promise((resolve) => {
    const child = (0, import_node_child_process.spawn)("bunx", ["convex", "env", "list", ...targetArgs], {
      cwd: backendRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    child.stdout.on("data", (data) => stdout += data.toString());
    child.on("error", () => resolve(/* @__PURE__ */ new Set()));
    child.on("exit", () => {
      const names = /* @__PURE__ */ new Set();
      for (const line of stdout.split(/\r?\n/)) {
        const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim());
        if (match) names.add(match[1]);
      }
      resolve(names);
    });
  });
}
function resolveBackendRoot() {
  const candidates = [
    import_node_path5.default.resolve(__dirname, "../../backend"),
    import_node_path5.default.resolve(process.cwd(), "../backend"),
    import_node_path5.default.resolve(process.cwd(), "../../packages/backend")
  ];
  for (const candidate of candidates) {
    if ((0, import_node_fs2.existsSync)(import_node_path5.default.join(candidate, "package.json")) && (0, import_node_fs2.existsSync)(import_node_path5.default.join(candidate, "convex"))) {
      return candidate;
    }
  }
  throw new Error(
    "Could not find the Convex backend source. Reinstall from a full ConvexPress checkout and try again."
  );
}
function generateEncryptionKeyHex() {
  return (0, import_node_crypto2.randomBytes)(32).toString("hex");
}
var AT_REST_ENCRYPTION_KEYS = [
  "SHIPPING_PROVIDER_ENCRYPTION_KEY",
  "WEBHOOK_SECRET_ENCRYPTION_KEY"
];
function generateAuthPrivateKey() {
  const { privateKey } = (0, import_node_crypto2.generateKeyPairSync)("ec", {
    namedCurve: "P-256"
  });
  return privateKey.export({
    type: "pkcs8",
    format: "pem"
  });
}
function generateFirstAdminSetupSecret() {
  return (0, import_node_crypto2.randomBytes)(32).toString("base64url");
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
    import_node_path5.default.resolve(backendRoot, ".env.local"),
    import_node_path5.default.resolve(backendRoot, "../../.env.local"),
    import_node_path5.default.resolve(backendRoot, "../../apps/web/.env.local"),
    import_node_path5.default.resolve(backendRoot, "../../apps/web/.env")
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
function createBackendEnvFile(convexSiteUrl, backendRoot, firstAdminSetupSecret, existingNames = /* @__PURE__ */ new Set()) {
  const localEnv = loadLocalEnv(backendRoot);
  const tempDir = (0, import_node_fs2.mkdtempSync)(import_node_path5.default.join((0, import_node_os.tmpdir)(), "convexpress-setup-"));
  const filePath = import_node_path5.default.join(tempDir, "convex-env.local");
  const configuredAuthPrivateKey = readSetupEnvValue("AUTH_PRIVATE_KEY", localEnv);
  const envVars = {
    AUTH_ISSUER_URL: convexSiteUrl,
    AUTH_ALLOWED_ORIGINS: readSetupEnvValue("AUTH_ALLOWED_ORIGINS", localEnv) ?? "http://localhost:4105,http://127.0.0.1:4105",
    AUTH_ALLOW_NULL_ORIGIN: readSetupEnvValue("AUTH_ALLOW_NULL_ORIGIN", localEnv) ?? "true"
  };
  if (!existingNames.has("AUTH_PRIVATE_KEY")) {
    envVars.AUTH_PRIVATE_KEY = configuredAuthPrivateKey ? validateAuthPrivateKey(configuredAuthPrivateKey) : generateAuthPrivateKey();
  }
  for (const name of AT_REST_ENCRYPTION_KEYS) {
    if (existingNames.has(name)) continue;
    envVars[name] = readSetupEnvValue(name, localEnv) ?? generateEncryptionKeyHex();
  }
  if (firstAdminSetupSecret) {
    envVars.FIRST_ADMIN_SETUP_SECRET = firstAdminSetupSecret;
  }
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
async function deployServerBackend(config, convexSiteUrl, firstAdminSetupSecret, sendProgress) {
  const credential = deriveDeployment(config);
  const backendRoot = resolveBackendRoot();
  const env = { ...process.env };
  const targetArgs = [];
  if (credential.kind === "cloud") {
    env.CONVEX_DEPLOYMENT = credential.deployment;
    env.CONVEX_DEPLOY_KEY = credential.deployKey;
  } else {
    targetArgs.push("--url", credential.convexUrl, "--admin-key", credential.adminKey);
  }
  sendProgress("environment", "Checking the deployment's existing environment.");
  const existingNames = await listDeploymentEnvNames(backendRoot, env, targetArgs);
  sendProgress("environment", "Preparing backend environment.");
  const envFile = createBackendEnvFile(
    convexSiteUrl,
    backendRoot,
    firstAdminSetupSecret,
    existingNames
  );
  try {
    sendProgress("environment", "Syncing required backend environment variables.");
    await runCommand(
      "bunx",
      ["convex", "env", "set", "--from-file", envFile.filePath, "--force", ...targetArgs],
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
  sendProgress("deploy", "Deploying Convex backend code (typechecked).");
  await runCommand(
    "bunx",
    [
      "convex",
      "deploy",
      ...targetArgs,
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
        if (!isExactWizardSender(event.sender.getURL(), getWizardIndexPath2())) {
          throw new Error("Setup configuration can only be saved from the setup wizard.");
        }
        sendProgress("validating", "Validating setup configuration.");
        const validated = validateSetupConfig(config);
        const firstAdminSetupSecret = validated.mode === "server" ? generateFirstAdminSetupSecret() : void 0;
        if (validated.mode === "server") {
          await deployServerBackend(
            config,
            validated.convexSiteUrl,
            firstAdminSetupSecret,
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
        const handoffCreatedAt = Date.now();
        const handoffExpiresAt = handoffCreatedAt + SETUP_CREDENTIAL_HANDOFF_TTL_MS;
        if (validated.pendingAdminCredentials) {
          store.set(
            "pendingAdminCredentials",
            {
              ...validated.pendingAdminCredentials,
              setupToken: firstAdminSetupSecret,
              createdAt: handoffCreatedAt,
              expiresAt: handoffExpiresAt
            }
          );
        } else {
          store.delete("pendingAdminCredentials");
        }
        if (validated.pendingLoginCredentials) {
          store.set(
            "pendingLoginCredentials",
            {
              ...validated.pendingLoginCredentials,
              createdAt: handoffCreatedAt,
              expiresAt: handoffExpiresAt
            }
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

// electron/ipc/handoff.ts
var import_node_path6 = __toESM(require("path"));
var import_promises = require("fs/promises");

// electron/ipc/handoffValidation.ts
var import_node_crypto3 = require("crypto");
var MAX_HANDOFF_BYTES = 2e6;
var SECRET_KEY_FRAGMENTS = [
  "secret",
  "password",
  "passphrase",
  "token",
  "credential",
  "privatekey",
  "adminkey",
  "deploykey",
  "productionkey",
  "authorization",
  "cookie"
];
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}
function assertSecretFree(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertSecretFree(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (SECRET_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
      throw new Error("Handoff package contains a protected credential field");
    }
    assertSecretFree(item);
  }
}
function normalizeFilename(value) {
  const withoutExtension = value.trim().replace(/\.json$/i, "");
  const safe = withoutExtension.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 140);
  return `${safe || "convexpress-handoff"}.json`;
}
function prepareHandoffSaveRequest(input) {
  if (Buffer.byteLength(input.packageJson, "utf8") > MAX_HANDOFF_BYTES) {
    throw new Error("Handoff package is too large");
  }
  let bundle;
  try {
    const parsed = JSON.parse(input.packageJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    bundle = parsed;
  } catch {
    throw new Error("Handoff package is invalid");
  }
  if (bundle.format !== "convexpress-handoff" || bundle.formatVersion !== "1.0.0" || !bundle.manifest || typeof bundle.manifest !== "object" || Array.isArray(bundle.manifest) || typeof bundle.manifestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(bundle.manifestSha256)) {
    throw new Error("Handoff package is invalid");
  }
  const checksum = (0, import_node_crypto3.createHash)("sha256").update(canonicalJson(bundle.manifest)).digest("hex");
  if (checksum !== bundle.manifestSha256) {
    throw new Error("Handoff package checksum is invalid");
  }
  assertSecretFree(bundle.manifest);
  return {
    suggestedFilename: normalizeFilename(input.suggestedFilename),
    packageJson: input.packageJson
  };
}

// electron/ipc/handoff.ts
var { BrowserWindow: BrowserWindow2, dialog, ipcMain: ipcMain5 } = require("electron");
function getRendererIndexPath3() {
  return import_node_path6.default.join(__dirname, "..", "dist", "index.html");
}
function isTrustedAppSender(senderUrl) {
  return isAppRendererSender(senderUrl, {
    ...isDev() ? { devRendererUrl: process.env.CONVEXPRESS_DESKTOP_DEV_URL } : { rendererIndexPath: getRendererIndexPath3() }
  });
}
function registerHandoffHandlers() {
  ipcMain5.handle(
    "handoff:save-package",
    async (event, input) => {
      if (!isTrustedAppSender(event.sender.getURL())) {
        throw new Error("Handoff packages can only be saved from ConvexPress.");
      }
      const request = prepareHandoffSaveRequest(input);
      const owner = BrowserWindow2.fromWebContents(event.sender);
      const options = {
        title: "Save ConvexPress handoff package",
        defaultPath: request.suggestedFilename,
        buttonLabel: "Save handoff",
        filters: [{ name: "ConvexPress handoff", extensions: ["json"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"]
      };
      const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) {
        return { saved: false, filePath: null };
      }
      await (0, import_promises.writeFile)(result.filePath, `${request.packageJson}
`, "utf8");
      return { saved: true, filePath: result.filePath };
    }
  );
}

// electron/ipc/connectionProvision.ts
var import_node_path7 = __toESM(require("path"));
var import_browser = require("convex/browser");
var import_server = require("convex/server");

// electron/ipc/connectionProvisionValidation.ts
var ALLOWED_REQUEST_KEYS = /* @__PURE__ */ new Set([
  "instanceId",
  "name",
  "accountLabel",
  "authToken"
]);
function requiredText(value, label, maximum) {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return cleaned;
}
function validateConnectionProvisionRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Connection request is invalid");
  }
  const input = value;
  if (Object.keys(input).some((key) => !ALLOWED_REQUEST_KEYS.has(key))) {
    throw new Error("Connection request contains unsupported fields");
  }
  const authToken = requiredText(input.authToken, "Operator token", 24e3);
  if (authToken.length < 100 || authToken.split(".").length !== 3) {
    throw new Error("Operator token is invalid");
  }
  const accountLabel = input.accountLabel === void 0 ? void 0 : requiredText(input.accountLabel, "Account label", 160);
  return {
    instanceId: requiredText(input.instanceId, "Environment", 160),
    name: requiredText(input.name, "Connection name", 160),
    ...accountLabel ? { accountLabel } : {},
    authToken
  };
}
function validateDeploymentAdminKey(value) {
  if (typeof value !== "string") {
    throw new Error("Deployment credential is invalid");
  }
  const cleaned = value.trim();
  if (cleaned.length < 16 || cleaned.length > 16384 || /\s/.test(cleaned)) {
    throw new Error("Deployment credential is invalid");
  }
  return cleaned;
}

// electron/ipc/connectionProvision.ts
var { BrowserWindow: BrowserWindow3, ipcMain: ipcMain6 } = require("electron");
var configStore = new JsonStore({ name: "convexpress-config" });
var createConnection = (0, import_server.makeFunctionReference)(
  "connections/actions:create"
);
var activePrompt = null;
function getRendererIndexPath4() {
  return import_node_path7.default.join(__dirname, "..", "dist", "index.html");
}
function getCredentialPromptPath() {
  return import_node_path7.default.join(__dirname, "credential", "index.html");
}
function getCredentialPreloadPath() {
  return import_node_path7.default.join(__dirname, "credential", "preload.js");
}
function isTrustedAppSender2(senderUrl) {
  return isAppRendererSender(senderUrl, {
    ...isDev() ? { devRendererUrl: process.env.CONVEXPRESS_DESKTOP_DEV_URL } : { rendererIndexPath: getRendererIndexPath4() }
  });
}
async function requestDeploymentCredential(owner) {
  if (activePrompt) {
    throw new Error("A secure deployment credential prompt is already open.");
  }
  const prompt = new BrowserWindow3({
    width: 520,
    height: 390,
    minWidth: 460,
    minHeight: 350,
    show: false,
    modal: owner !== null,
    parent: owner ?? void 0,
    title: "Connect ConvexPress deployment",
    backgroundColor: "#101827",
    autoHideMenuBar: true,
    webPreferences: {
      preload: getCredentialPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      spellcheck: false
    }
  });
  prompt.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  prompt.webContents.on("will-navigate", (event) => event.preventDefault());
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (activePrompt?.webContentsId === prompt.webContents.id) {
        activePrompt = null;
      }
      resolve(value);
      if (!prompt.isDestroyed()) prompt.close();
    };
    activePrompt = { webContentsId: prompt.webContents.id, finish };
    prompt.once("ready-to-show", () => {
      prompt.show();
      prompt.focus();
    });
    prompt.once("closed", () => finish(null));
    void prompt.loadFile(getCredentialPromptPath()).catch(() => finish(null));
  });
}
function submitCredential(event, value) {
  if (!activePrompt || event.sender.id !== activePrompt.webContentsId) return;
  try {
    activePrompt.finish(validateDeploymentAdminKey(value));
  } catch {
    event.sender.send(
      "connection-credential:error",
      "Enter the complete Convex deployment admin key."
    );
  }
}
function cancelCredential(event) {
  if (!activePrompt || event.sender.id !== activePrompt.webContentsId) return;
  activePrompt.finish(null);
}
function registerConnectionProvisionHandlers() {
  ipcMain6.on("connection-credential:submit", submitCredential);
  ipcMain6.on("connection-credential:cancel", cancelCredential);
  ipcMain6.handle("connections:provision", async (event, rawInput) => {
    if (!isTrustedAppSender2(event.sender.getURL())) {
      throw new Error("Connections can only be provisioned from ConvexPress.");
    }
    const input = validateConnectionProvisionRequest(rawInput);
    const controlPlaneUrl = configStore.get("convexUrl");
    if (typeof controlPlaneUrl !== "string" || !controlPlaneUrl.trim()) {
      throw new Error("The ConvexPress control plane is not configured.");
    }
    const owner = BrowserWindow3.fromWebContents(event.sender);
    let deploymentAdminKey = await requestDeploymentCredential(owner);
    if (!deploymentAdminKey) return { cancelled: true };
    try {
      const client = new import_browser.ConvexHttpClient(controlPlaneUrl.trim());
      client.setAuth(input.authToken);
      const result = await client.action(createConnection, {
        instanceId: input.instanceId,
        name: input.name,
        ...input.accountLabel ? { accountLabel: input.accountLabel } : {},
        deploymentAdminKey
      });
      return {
        cancelled: false,
        connectionId: result.connectionId,
        status: result.status,
        credentialVersion: result.credentialVersion
      };
    } catch {
      throw new Error("Connection could not be created or verified.");
    } finally {
      deploymentAdminKey = null;
    }
  });
}

// electron/app-updater.ts
var import_node_child_process2 = require("child_process");
var import_node_fs4 = require("fs");
var import_node_path9 = require("path");
var import_node_util = require("util");
var import_node_events = require("events");

// electron/version.ts
var import_node_fs3 = require("fs");
var import_node_path8 = require("path");
var import_node_os2 = require("os");
var MANIFEST_FILENAME = ".convexpress-version.json";
function getManifestPath(installPath) {
  return (0, import_node_path8.join)(installPath, MANIFEST_FILENAME);
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
  const tempPath = (0, import_node_path8.join)(
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
    if ((0, import_node_fs4.existsSync)((0, import_node_path9.join)(this.installPath, "bun.lock")) || (0, import_node_fs4.existsSync)((0, import_node_path9.join)(this.installPath, ".bun-version"))) {
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
var import_node_path10 = __toESM(require("path"));

// electron/utils/app-state.ts
var quitting = false;
function setQuitting(value) {
  quitting = value;
}
function isQuitting() {
  return quitting;
}

// electron/window-manager.ts
var { app: app3, BrowserWindow: BrowserWindow4, shell } = require("electron");
function getPreloadPath() {
  return import_node_path10.default.join(__dirname, "preload.js");
}
function getIconPath() {
  return import_node_path10.default.join(__dirname, "../resources/icon.png");
}
function openExternal(url) {
  void shell.openExternal(url);
}
var WindowManager = class {
  mainWindow = null;
  wizardWindow = null;
  createMainWindow(options = {}) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      return this.mainWindow;
    }
    const win = new BrowserWindow4({
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
      win.loadURL(
        addHashRouteToUrl(
          process.env.CONVEXPRESS_DESKTOP_DEV_URL ?? "http://localhost:4105",
          options.initialRoute
        )
      );
    } else {
      console.log(`[WindowManager] Renderer URL: ${PACKAGED_RENDERER_ENTRY_URL}`);
      const initialRoute = normalizeInitialRoute(options.initialRoute);
      win.loadURL(addHashRouteToUrl(PACKAGED_RENDERER_ENTRY_URL, initialRoute));
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
      openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      const isInternal = isDev() ? isDevAppRendererSender(url) : isAppRendererSender(url);
      if (!isInternal) {
        event.preventDefault();
        openExternal(url);
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
    const win = new BrowserWindow4({
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
    const wizardIndexPath = import_node_path10.default.join(__dirname, "wizard", "index.html");
    win.loadFile(wizardIndexPath);
    win.once("ready-to-show", () => {
      win.show();
    });
    win.on("closed", () => {
      this.wizardWindow = null;
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      if (isExactWizardSender(url, wizardIndexPath)) return;
      event.preventDefault();
      openExternal(url);
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
var { ipcMain: ipcMain7 } = require("electron");
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
  ipcMain7.handle("app-update:check", async () => {
    if (!updater) return null;
    return updater.checkForUpdate();
  });
  ipcMain7.handle("app-update:install", async () => {
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
var { ipcMain: ipcMain8 } = require("electron");
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
  ipcMain8.handle("app:check-for-updates", async () => {
    const updater2 = await getAutoUpdater();
    if (updater2) {
      try {
        await updater2.checkForUpdates();
      } catch (error) {
        safeError("[Updater] Check failed:", error);
      }
    }
  });
  ipcMain8.handle("app:install-update", async () => {
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

// electron/ipc/siteRunner.ts
var import_node_fs6 = require("fs");
var import_node_path12 = __toESM(require("path"));

// electron/siteRunner/manager.ts
var import_node_child_process3 = require("child_process");
var import_node_fs5 = require("fs");
var import_node_http = __toESM(require("http"));
var import_node_path11 = __toESM(require("path"));

// electron/siteRunner/siteRunnerValidation.ts
var SITE_RUNNER_PORT_RANGE = { start: 4200, end: 4399 };
var LOOPBACK_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "[::1]", "::1", "0.0.0.0"]);
function isLoopbackUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
function parseLoopbackPort(value) {
  if (!isLoopbackUrl(value)) return null;
  try {
    const url = new URL(value);
    if (url.port) return Number(url.port);
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}
function deriveConvexSiteUrl2(convexUrl) {
  try {
    const url = new URL(convexUrl);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
      return url.origin;
    }
    if (url.port) {
      url.port = String(Number(url.port) + 1);
      return url.origin;
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function assertHttpUrl(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${field} must use http or https.`);
  }
  return url.origin;
}
function optionalHttpUrl(value, field) {
  if (value === void 0 || value === null || value === "") return void 0;
  return assertHttpUrl(value, field);
}
var INSTANCE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/;
function assertSiteRunnerTarget(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Site runner target must be an object.");
  }
  const raw = input;
  const instanceKey = typeof raw.instanceKey === "string" ? raw.instanceKey.trim() : "";
  if (!INSTANCE_KEY_PATTERN.test(instanceKey)) {
    throw new Error("instanceKey is required and may only contain letters, digits, ':', '.', '_' and '-'.");
  }
  const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 120) : instanceKey;
  const mode = raw.mode === "preview" ? "preview" : "dev";
  const convexUrl = assertHttpUrl(raw.convexUrl, "convexUrl");
  const clerkPublishableKey = typeof raw.clerkPublishableKey === "string" && raw.clerkPublishableKey.trim() ? raw.clerkPublishableKey.trim() : void 0;
  return {
    instanceKey,
    label,
    mode,
    convexUrl,
    convexSiteUrl: optionalHttpUrl(raw.convexSiteUrl, "convexSiteUrl") ?? deriveConvexSiteUrl2(convexUrl),
    siteUrl: optionalHttpUrl(raw.siteUrl, "siteUrl"),
    adminAppUrl: optionalHttpUrl(raw.adminAppUrl, "adminAppUrl"),
    clerkPublishableKey
  };
}
function siteProcessKey(target) {
  return target.mode === "preview" ? `${target.instanceKey}#preview` : target.instanceKey;
}
function choosePort(target, options) {
  const taken = new Set(options.taken);
  if (target.mode !== "preview") {
    const fromAddress = parseLoopbackPort(target.siteUrl);
    if (fromAddress && fromAddress > 0 && fromAddress < 65536) return fromAddress;
  }
  if (options.remembered && !taken.has(options.remembered)) return options.remembered;
  for (let port = SITE_RUNNER_PORT_RANGE.start; port <= SITE_RUNNER_PORT_RANGE.end; port += 1) {
    if (!taken.has(port)) return port;
  }
  throw new Error("No free port left for local storefronts (4200\u20134399).");
}
function localSiteUrl(port) {
  return `http://127.0.0.1:${port}`;
}
function buildStorefrontEnv(target, port, extras) {
  const siteUrl = localSiteUrl(port);
  const convexSiteUrl = target.convexSiteUrl ?? deriveConvexSiteUrl2(target.convexUrl) ?? "";
  const env = {
    PORT: String(port),
    CONVEXPRESS_PORT: String(port),
    CONVEXPRESS_INSTANCE_KEY: target.instanceKey,
    CONVEXPRESS_CONVEX_URL: target.convexUrl,
    CONVEXPRESS_CONVEX_SITE_URL: convexSiteUrl,
    CONVEXPRESS_SITE_URL: siteUrl,
    CONVEXPRESS_VITE_CACHE_DIR: extras.cacheDir,
    // VITE_* mirrors keep the dev server's build-time fallbacks consistent.
    VITE_CONVEX_URL: target.convexUrl,
    VITE_CONVEX_SITE_URL: convexSiteUrl,
    VITE_APP_URL: siteUrl
  };
  const adminAppUrl = target.adminAppUrl ?? extras.adminAppUrl;
  if (adminAppUrl) {
    env.CONVEXPRESS_ADMIN_APP_URL = adminAppUrl;
    env.VITE_ADMIN_APP_URL = adminAppUrl;
  }
  if (target.clerkPublishableKey) {
    env.CONVEXPRESS_CLERK_PUBLISHABLE_KEY = target.clerkPublishableKey;
    env.VITE_CLERK_PUBLISHABLE_KEY = target.clerkPublishableKey;
  }
  return env;
}
function cacheDirName(key) {
  return key.replace(/[^A-Za-z0-9._-]+/g, "_");
}
function assertProcessKey(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 240) {
    throw new Error("Process key is required.");
  }
  return input;
}
function assertWebsiteRepoPathInput(input) {
  if (input === null || input === void 0 || input === "") return null;
  if (typeof input !== "string" || input.length > 4096) {
    throw new Error("websiteRepoPath must be a path string.");
  }
  return input.trim();
}

// electron/siteRunner/manager.ts
var LOG_LINES = 300;
var READY_TIMEOUT_MS = 18e4;
var READY_POLL_MS = 500;
var STOP_GRACE_MS = 6e3;
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(11, 19);
}
function isAlive(child) {
  return !!child && child.exitCode === null && child.signalCode === null;
}
function signalTree(child, signal) {
  if (!child.pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error.code !== "ESRCH") {
      }
    }
  }
  if (isAlive(child)) child.kill(signal);
}
function probe(url) {
  return new Promise((resolve) => {
    const request = import_node_http.default.get(url, { timeout: 4e3 }, (response) => {
      response.resume();
      resolve((response.statusCode ?? 500) < 500);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var SiteRunnerManager = class {
  constructor(options) {
    this.options = options;
  }
  processes = /* @__PURE__ */ new Map();
  list() {
    return [...this.processes.values()].map((entry) => ({ ...entry.state }));
  }
  get(key) {
    const entry = this.processes.get(key);
    return entry ? { ...entry.state } : null;
  }
  logs(key) {
    return [...this.processes.get(key)?.logs ?? []];
  }
  takenPorts(exceptKey) {
    return [...this.processes.values()].filter((entry) => entry.state.key !== exceptKey && entry.state.status !== "stopped" && entry.state.status !== "failed").map((entry) => entry.state.port);
  }
  emit(entry) {
    this.options.onChange({ ...entry.state });
  }
  appendLog(entry, chunk) {
    const lines = chunk.split(/\r?\n/).map((line) => line.replace(/\[[0-9;]*m/g, "").trimEnd()).filter(Boolean);
    if (!lines.length) return;
    for (const line of lines) {
      entry.logs.push(`${nowIso()} ${line}`);
    }
    if (entry.logs.length > LOG_LINES) {
      entry.logs.splice(0, entry.logs.length - LOG_LINES);
    }
    entry.state.lastLogLine = lines[lines.length - 1] ?? entry.state.lastLogLine;
    this.emit(entry);
  }
  /**
   * Start (or return) the process for a target and resolve once it answers
   * HTTP. Rejects when the checkout is missing or the process dies early.
   */
  async ensureRunning(target) {
    const key = siteProcessKey(target);
    const existing = this.processes.get(key);
    if (existing && (existing.state.status === "running" || existing.state.status === "starting")) {
      if (existing.readyPromise) await existing.readyPromise;
      return { ...existing.state };
    }
    const repo = this.options.websiteRepoPath();
    if (!repo) {
      throw new Error(
        "The ConvexPress-Website checkout is not configured. Choose it under Local storefronts."
      );
    }
    const appDir = import_node_path11.default.join(repo, "apps", "web");
    if (!(0, import_node_fs5.existsSync)(import_node_path11.default.join(appDir, "package.json"))) {
      throw new Error(`No storefront app found at ${appDir}.`);
    }
    const port = choosePort(target, {
      remembered: this.options.rememberedPort(key),
      taken: this.takenPorts(key)
    });
    const cacheDir = import_node_path11.default.join(this.options.cacheRoot(), cacheDirName(key));
    (0, import_node_fs5.mkdirSync)(cacheDir, { recursive: true });
    const entry = {
      state: {
        key,
        instanceKey: target.instanceKey,
        label: target.label,
        mode: target.mode ?? "dev",
        status: "starting",
        port,
        url: localSiteUrl(port),
        convexUrl: target.convexUrl,
        pid: null,
        startedAt: Date.now(),
        exitCode: null,
        error: null,
        lastLogLine: null
      },
      child: null,
      logs: [],
      readyPromise: null
    };
    this.processes.set(key, entry);
    this.options.rememberPort(key, port);
    const env = {
      ...process.env,
      ...buildStorefrontEnv(target, port, {
        cacheDir,
        adminAppUrl: this.options.adminAppUrl()
      }),
      FORCE_COLOR: "0",
      CI: "1"
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const command = process.platform === "win32" ? "bun.exe" : "bun";
    const args = ["run", "dev", "--host", "127.0.0.1", "--port", String(port)];
    this.options.log(`[SiteRunner] start ${key} \u2192 ${entry.state.url} (${target.convexUrl})`);
    this.appendLog(entry, `$ ${command} ${args.join(" ")}`);
    let child;
    try {
      child = (0, import_node_child_process3.spawn)(command, args, {
        cwd: appDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true
      });
    } catch (error) {
      entry.state.status = "failed";
      entry.state.error = error instanceof Error ? error.message : String(error);
      this.emit(entry);
      throw error;
    }
    entry.child = child;
    entry.state.pid = child.pid ?? null;
    this.emit(entry);
    child.stdout?.on("data", (data) => this.appendLog(entry, data.toString()));
    child.stderr?.on("data", (data) => this.appendLog(entry, data.toString()));
    child.on("error", (error) => {
      entry.state.status = "failed";
      entry.state.error = error.message;
      this.appendLog(entry, `process error: ${error.message}`);
    });
    child.on("exit", (code, signal) => {
      const stopping = entry.state.status === "stopping";
      const wasReady = entry.state.status === "running";
      entry.state.exitCode = code;
      entry.state.pid = null;
      entry.state.status = stopping || wasReady && code === 0 ? "stopped" : "failed";
      if (!stopping && !(wasReady && code === 0)) {
        const tail = entry.logs.slice(-3).map((line) => line.replace(/^\d\d:\d\d:\d\d /, "")).join(" \xB7 ");
        entry.state.error = `Storefront exited with ${signal ?? `code ${code}`}${wasReady ? "" : " before it was ready"}.${tail ? ` Last output: ${tail}` : ""}`;
      }
      this.options.log(`[SiteRunner] exit ${key} code=${code} signal=${signal}`);
      this.emit(entry);
    });
    entry.readyPromise = this.waitUntilReady(entry);
    await entry.readyPromise;
    return { ...entry.state };
  }
  async waitUntilReady(entry) {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!isAlive(entry.child)) {
        throw new Error(entry.state.error ?? "Storefront process stopped before it was ready.");
      }
      if (await probe(entry.state.url)) {
        entry.state.status = "running";
        entry.state.error = null;
        this.emit(entry);
        return;
      }
      await sleep(READY_POLL_MS);
    }
    entry.state.status = "failed";
    entry.state.error = "Storefront did not answer within three minutes.";
    this.emit(entry);
    signalTree(entry.child, "SIGTERM");
    throw new Error(entry.state.error);
  }
  async stop(key) {
    const entry = this.processes.get(key);
    if (!entry) return null;
    const child = entry.child;
    if (!isAlive(child)) {
      entry.state.status = "stopped";
      this.emit(entry);
      return { ...entry.state };
    }
    entry.state.status = "stopping";
    this.emit(entry);
    signalTree(child, "SIGTERM");
    const deadline = Date.now() + STOP_GRACE_MS;
    while (Date.now() < deadline && isAlive(child)) {
      await sleep(50);
    }
    if (isAlive(child)) {
      signalTree(child, "SIGKILL");
      await sleep(200);
    }
    entry.state.status = "stopped";
    entry.state.pid = null;
    this.emit(entry);
    return { ...entry.state };
  }
  async stopAll() {
    await Promise.all([...this.processes.keys()].map((key) => this.stop(key).catch(() => null)));
  }
  /** Synchronous best-effort shutdown for `before-quit`. */
  killAllSync() {
    for (const entry of this.processes.values()) {
      if (isAlive(entry.child)) {
        entry.state.status = "stopping";
        signalTree(entry.child, "SIGTERM");
      }
    }
  }
  forget(key) {
    const entry = this.processes.get(key);
    if (!entry || isAlive(entry.child)) return;
    this.processes.delete(key);
  }
};

// electron/ipc/siteRunner.ts
var { app: app4, BrowserWindow: BrowserWindow5, dialog: dialog2, ipcMain: ipcMain9, shell: shell2 } = require("electron");
var store2 = new JsonStore({
  name: "convexpress-sites",
  defaults: { websiteRepoPath: null, ports: {} }
});
function getRendererIndexPath5() {
  return import_node_path12.default.join(__dirname, "..", "dist", "index.html");
}
function isRunnerAppSender(senderUrl) {
  return isDev() ? isDevAppRendererSender(senderUrl) : isAppRendererSender(senderUrl, { rendererIndexPath: getRendererIndexPath5() });
}
function assertSender(event) {
  if (!isRunnerAppSender(event.sender.getURL())) {
    throw new Error("Local storefronts can only be controlled from the ConvexPress app.");
  }
}
function looksLikeWebsiteRepo(candidate) {
  return (0, import_node_fs6.existsSync)(import_node_path12.default.join(candidate, "apps", "web", "package.json"));
}
function defaultRepoCandidates() {
  const appPath = app4.getAppPath();
  return [
    process.env.CONVEXPRESS_WEBSITE_REPO ?? "",
    import_node_path12.default.resolve(appPath, "..", "..", "..", "ConvexPress-Website"),
    import_node_path12.default.resolve(appPath, "..", "..", "ConvexPress-Website"),
    import_node_path12.default.resolve(process.cwd(), "..", "..", "..", "ConvexPress-Website"),
    import_node_path12.default.resolve(process.cwd(), "..", "ConvexPress-Website")
  ].filter(Boolean);
}
function resolveWebsiteRepoPath() {
  const configured = store2.get("websiteRepoPath");
  if (configured && looksLikeWebsiteRepo(configured)) return { path: configured, source: "config" };
  const fromEnv = process.env.CONVEXPRESS_WEBSITE_REPO;
  if (fromEnv && looksLikeWebsiteRepo(fromEnv)) return { path: fromEnv, source: "env" };
  for (const candidate of defaultRepoCandidates()) {
    if (looksLikeWebsiteRepo(candidate)) return { path: candidate, source: "sibling" };
  }
  return { path: null, source: "none" };
}
function broadcast(state) {
  for (const win of BrowserWindow5.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("site-runner:changed", state);
  }
}
var manager = null;
var logSink = () => {
};
function mapDevelopmentOrigins(target) {
  const raw = process.env.CONVEXPRESS_SITE_ORIGIN_MAP;
  if (!raw) return target;
  let map;
  try {
    map = JSON.parse(raw);
  } catch {
    return target;
  }
  const rewrite = (origin) => {
    if (!origin) return origin;
    const replacement = map[origin] ?? map[origin.replace(/\/$/, "")];
    return typeof replacement === "string" && /^https?:\/\//.test(replacement) ? replacement : origin;
  };
  const mapped = { ...target, convexUrl: rewrite(target.convexUrl), convexSiteUrl: rewrite(target.convexSiteUrl) };
  if (mapped.convexUrl !== target.convexUrl) {
    logSink(`[SiteRunner] origin map ${target.convexUrl} \u2192 ${mapped.convexUrl}`);
  }
  return mapped;
}
function getSiteRunnerManager() {
  manager ??= new SiteRunnerManager({
    websiteRepoPath: () => resolveWebsiteRepoPath().path,
    cacheRoot: () => import_node_path12.default.join(app4.getPath("userData"), "storefront-cache"),
    adminAppUrl: () => isDev() ? getTrustedDevRendererOrigin() : store2.get("adminAppUrl"),
    rememberedPort: (key) => {
      const ports = store2.get("ports") ?? {};
      return typeof ports[key] === "number" ? ports[key] : null;
    },
    rememberPort: (key, port) => {
      const ports = { ...store2.get("ports") ?? {} };
      ports[key] = port;
      store2.set("ports", ports);
    },
    onChange: broadcast,
    log: (line) => logSink(line)
  });
  return manager;
}
function setSiteRunnerLogger(sink) {
  logSink = sink;
}
function registerSiteRunnerHandlers() {
  ipcMain9.handle("site-runner:list", (event) => {
    assertSender(event);
    return getSiteRunnerManager().list();
  });
  ipcMain9.handle("site-runner:get-config", (event) => {
    assertSender(event);
    const resolved = resolveWebsiteRepoPath();
    return {
      websiteRepoPath: resolved.path,
      source: resolved.source,
      configuredPath: store2.get("websiteRepoPath") ?? null,
      ports: store2.get("ports") ?? {}
    };
  });
  ipcMain9.handle("site-runner:set-config", (event, input) => {
    assertSender(event);
    const raw = input && typeof input === "object" ? input : {};
    if ("websiteRepoPath" in raw) {
      const value = assertWebsiteRepoPathInput(raw.websiteRepoPath);
      if (value && !looksLikeWebsiteRepo(value)) {
        throw new Error("That folder does not contain a ConvexPress-Website checkout (apps/web/package.json).");
      }
      store2.set("websiteRepoPath", value);
    }
    return resolveWebsiteRepoPath();
  });
  ipcMain9.handle("site-runner:pick-repo", async (event) => {
    assertSender(event);
    const win = BrowserWindow5.fromWebContents(event.sender);
    const dialogOptions = {
      title: "Choose the ConvexPress-Website checkout",
      properties: ["openDirectory"]
    };
    const result = win ? await dialog2.showOpenDialog(win, dialogOptions) : await dialog2.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths[0]) return { cancelled: true };
    const chosen = result.filePaths[0];
    if (!looksLikeWebsiteRepo(chosen)) {
      throw new Error("That folder does not contain a ConvexPress-Website checkout (apps/web/package.json).");
    }
    store2.set("websiteRepoPath", chosen);
    return { cancelled: false, path: chosen };
  });
  ipcMain9.handle("site-runner:start", async (event, input) => {
    assertSender(event);
    const target = mapDevelopmentOrigins(assertSiteRunnerTarget(input));
    return await getSiteRunnerManager().ensureRunning(target);
  });
  ipcMain9.handle("site-runner:stop", async (event, key) => {
    assertSender(event);
    return await getSiteRunnerManager().stop(assertProcessKey(key));
  });
  ipcMain9.handle("site-runner:restart", async (event, input) => {
    assertSender(event);
    const target = mapDevelopmentOrigins(assertSiteRunnerTarget(input));
    const runner = getSiteRunnerManager();
    await runner.stop(siteProcessKey(target));
    return await runner.ensureRunning(target);
  });
  ipcMain9.handle("site-runner:forget", (event, key) => {
    assertSender(event);
    getSiteRunnerManager().forget(assertProcessKey(key));
    return getSiteRunnerManager().list();
  });
  ipcMain9.handle("site-runner:logs", (event, key) => {
    assertSender(event);
    return getSiteRunnerManager().logs(assertProcessKey(key));
  });
  ipcMain9.handle("site-runner:open", async (event, input) => {
    assertSender(event);
    const target = mapDevelopmentOrigins(assertSiteRunnerTarget(input));
    if (target.mode !== "preview" && !isLoopbackUrl(target.siteUrl)) {
      const url = target.siteUrl;
      if (!url) throw new Error("This environment has no site address yet.");
      await shell2.openExternal(url);
      return { launched: false, url };
    }
    const state = await getSiteRunnerManager().ensureRunning(target);
    await shell2.openExternal(state.url);
    return { launched: true, url: state.url, state };
  });
  ipcMain9.handle("site-runner:open-url", async (event, url) => {
    assertSender(event);
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
      throw new Error("Only http(s) URLs can be opened.");
    }
    await shell2.openExternal(url);
  });
}
function shutdownSiteRunner() {
  manager?.killAllSync();
}

// electron/deploymentOrigins.ts
var MAX_ORIGINS = 200;
var store3 = new JsonStore({
  name: "convexpress-deployment-origins",
  defaults: { origins: [] }
});
function normalizeDeploymentOrigin(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}
function readOrigins() {
  const raw = store3.get("origins");
  return Array.isArray(raw) ? raw.filter((entry) => typeof entry === "string") : [];
}
function listRegisteredDeploymentOrigins() {
  return readOrigins();
}
function registerDeploymentOrigins(candidates) {
  if (!Array.isArray(candidates)) throw new Error("origins must be an array");
  const current = new Set(readOrigins());
  const added = [];
  for (const candidate of candidates.slice(0, 50)) {
    const origin = normalizeDeploymentOrigin(candidate);
    if (!origin || current.has(origin)) continue;
    current.add(origin);
    added.push(origin);
  }
  if (added.length) {
    const next = [...current].slice(-MAX_ORIGINS);
    store3.set("origins", next);
  }
  return { added, origins: [...current] };
}

// electron/ipc/security.ts
var import_node_path13 = __toESM(require("path"));
var { ipcMain: ipcMain10 } = require("electron");
function assertSender2(event) {
  const senderUrl = event.sender.getURL();
  const ok = isDev() ? isDevAppRendererSender(senderUrl) : isAppRendererSender(senderUrl, {
    rendererIndexPath: import_node_path13.default.join(__dirname, "..", "dist", "index.html")
  });
  if (!ok) throw new Error("Deployment origins can only be registered from the ConvexPress app.");
}
function registerSecurityHandlers() {
  ipcMain10.handle("security:register-deployment-origins", (event, origins) => {
    assertSender2(event);
    return registerDeploymentOrigins(origins);
  });
  ipcMain10.handle("security:list-deployment-origins", (event) => {
    assertSender2(event);
    return listRegisteredDeploymentOrigins();
  });
}

// electron/ipc/siteDeploy.ts
var import_node_child_process4 = require("child_process");
var import_node_fs7 = require("fs");
var import_node_os3 = require("os");
var import_node_path14 = __toESM(require("path"));

// electron/ipc/siteDeployValidation.ts
var ENV_NAMES = /* @__PURE__ */ new Set([
  "CLERK_JWT_ISSUER_DOMAIN",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "CLERK_PUBLISHABLE_KEY",
  "SITE_URL"
]);
var CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function cleanText(value, label, max) {
  if (typeof value !== "string") throw new Error(`Missing ${label}`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || CONTROL_CHARS.test(trimmed)) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
}
function parseDeploymentOrigin(value) {
  const text = cleanText(value, "deployment origin", 300);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("Invalid deployment origin");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid deployment origin");
  if (url.protocol === "http:") {
    const host = url.hostname;
    const privateHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || !host.includes(".") || // single-label intranet names (docker / LAN aliases)
    host.endsWith(".local") || host.endsWith(".internal") || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (!privateHost) throw new Error("Plain-http deployments must be on a private network");
  }
  return url.origin;
}
function assertSiteDeployRequest(raw) {
  if (!isRecord(raw)) throw new Error("Invalid deploy request");
  const label = cleanText(raw.label, "label", 160);
  if (!isRecord(raw.credential)) throw new Error("Missing deployment credential");
  let credential;
  if (raw.credential.kind === "admin-key") {
    credential = {
      kind: "admin-key",
      deploymentOrigin: parseDeploymentOrigin(raw.credential.deploymentOrigin),
      adminKey: cleanText(raw.credential.adminKey, "admin key", 16384)
    };
    if (credential.adminKey.length < 16) throw new Error("Invalid admin key");
  } else if (raw.credential.kind === "bundled") {
    credential = { kind: "bundled", convexUrl: parseDeploymentOrigin(raw.credential.convexUrl) };
  } else if (raw.credential.kind === "prompt") {
    credential = { kind: "prompt", deploymentOrigin: parseDeploymentOrigin(raw.credential.deploymentOrigin) };
  } else if (raw.credential.kind === "control-plane") {
    const authToken = cleanText(raw.credential.authToken, "operator token", 24e3);
    if (authToken.length < 100 || authToken.split(".").length !== 3) throw new Error("Operator token is invalid");
    credential = {
      kind: "control-plane",
      connectionId: cleanText(raw.credential.connectionId, "connection", 160),
      authToken
    };
  } else if (raw.credential.kind === "deploy-key") {
    credential = {
      kind: "deploy-key",
      deployKey: cleanText(raw.credential.deployKey, "deploy key", 4096),
      deployment: cleanText(raw.credential.deployment, "deployment name", 200)
    };
  } else {
    throw new Error("Unknown deployment credential kind");
  }
  const rawChanges = Array.isArray(raw.envChanges) ? raw.envChanges : [];
  if (rawChanges.length > 8) throw new Error("Too many environment changes");
  const seen = /* @__PURE__ */ new Set();
  const envChanges = rawChanges.map((change) => {
    if (!isRecord(change)) throw new Error("Invalid environment change");
    const name = cleanText(change.name, "variable name", 64);
    if (!ENV_NAMES.has(name)) throw new Error(`${name} is not a site auth variable`);
    if (seen.has(name)) throw new Error(`${name} is listed twice`);
    seen.add(name);
    if (change.value === null) return { name, value: null };
    return { name, value: cleanText(change.value, name, 8192) };
  });
  const envOnly = raw.envOnly === true;
  if (envOnly && envChanges.length === 0) throw new Error("Nothing to apply");
  return { label, credential, envChanges, envOnly };
}
function redactDeployLog(line, secrets) {
  let out = line;
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue;
    out = out.split(secret).join("\u2022\u2022\u2022\u2022");
    for (const fragment of secret.split(/\r?\n/)) {
      const piece = fragment.trim();
      if (piece.length >= 16) out = out.split(piece).join("\u2022\u2022\u2022\u2022");
    }
  }
  return out.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[private key redacted]").replace(/-----(?:BEGIN|END) [A-Z ]*PRIVATE KEY-----/g, "[private key redacted]").replace(/(sk_(?:test|live)_)[A-Za-z0-9]+/g, "$1\u2022\u2022\u2022\u2022").replace(/(whsec_)[A-Za-z0-9+/=_-]+/g, "$1\u2022\u2022\u2022\u2022");
}
var ENVIRONMENT_KINDS = /* @__PURE__ */ new Set([
  "live",
  "staging",
  "beta",
  "preview",
  "development",
  "local",
  "custom"
]);
var PORTABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
function assertSiteInitializeRequest(raw) {
  if (!isRecord(raw)) throw new Error("Invalid initialize request");
  const websiteKey = cleanText(raw.websiteKey, "website key", 128);
  const instanceKey = cleanText(raw.instanceKey, "environment key", 128);
  if (!PORTABLE_KEY.test(websiteKey) || !PORTABLE_KEY.test(instanceKey)) {
    throw new Error("Website and environment keys must be portable keys (8-128 chars: letters, digits, . _ : -)");
  }
  const environmentKind = String(raw.environmentKind ?? "");
  if (!ENVIRONMENT_KINDS.has(environmentKind)) throw new Error("Unknown environment kind");
  const authToken = cleanText(raw.authToken, "operator token", 24e3);
  if (authToken.length < 100 || authToken.split(".").length !== 3) throw new Error("Operator token is invalid");
  const adminOrigins = Array.isArray(raw.adminOrigins) ? raw.adminOrigins.map((origin) => parseDeploymentOrigin(origin)) : [];
  if (adminOrigins.length > 8) throw new Error("Too many admin origins");
  return {
    instanceId: cleanText(raw.instanceId, "environment", 160),
    websiteKey,
    instanceKey,
    environmentKind,
    deploymentOrigin: parseDeploymentOrigin(raw.deploymentOrigin),
    managementOrigin: parseDeploymentOrigin(raw.managementOrigin),
    siteOrigin: parseDeploymentOrigin(raw.siteOrigin),
    siteTitle: cleanText(raw.siteTitle, "site title", 160),
    connectionName: cleanText(raw.connectionName, "connection name", 160),
    ...typeof raw.accountLabel === "string" && raw.accountLabel.trim() ? { accountLabel: cleanText(raw.accountLabel, "account label", 160) } : {},
    authToken,
    adminOrigins
  };
}

// electron/ipc/siteDeploy.ts
var { BrowserWindow: BrowserWindow6, ipcMain: ipcMain11 } = require("electron");
var configStore2 = new JsonStore({ name: "convexpress-config" });
var activeRun = null;
var lastRun = null;
function getRendererIndexPath6() {
  return import_node_path14.default.join(__dirname, "..", "dist", "index.html");
}
function assertSender3(event) {
  const url = event.sender.getURL();
  const ok = isDev() ? isDevAppRendererSender(url) : isAppRendererSender(url, { rendererIndexPath: getRendererIndexPath6() });
  if (!ok) throw new Error("Site deploys can only be started from the ConvexPress app.");
}
function broadcast2(event) {
  for (const win of BrowserWindow6.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("site-deploy:progress", event);
  }
}
async function setDeploymentEnv(name, value, targetArgs, options) {
  const dir = (0, import_node_fs7.mkdtempSync)(import_node_path14.default.join((0, import_node_os3.tmpdir)(), "convexpress-env-"));
  const file = import_node_path14.default.join(dir, "convex-env.local");
  (0, import_node_fs7.writeFileSync)(file, `${name}=${JSON.stringify(value)}
`, { mode: 384 });
  try {
    await runCommand2("bunx", ["convex", "env", "set", "--from-file", file, "--force", ...targetArgs], {
      ...options,
      onLine: () => {
      }
    });
  } finally {
    try {
      (0, import_node_fs7.rmSync)(dir, { recursive: true, force: true });
    } catch {
    }
  }
}
function describeFailure(error) {
  const data = error?.data;
  if (data && typeof data === "object" && typeof data.message === "string") {
    return data.message;
  }
  if (typeof data === "string" && data.trim()) return data.trim();
  const message = describeFailure(error);
  const uncaught = /Uncaught (?:Convex)?Error: ([^\n]+)/u.exec(message);
  return (uncaught?.[1] ?? message).trim();
}
function runCommand2(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = (0, import_node_child_process4.spawn)(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    const forward = (chunk, isErr) => {
      const text = chunk.toString();
      if (isErr) stderr += text;
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.includes("ExperimentalWarning") && !trimmed.includes("--trace-warnings")) {
          options.onLine(trimmed);
        }
      }
    };
    child.stdout.on("data", (chunk) => forward(chunk, false));
    child.stderr.on("data", (chunk) => forward(chunk, true));
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) return resolve();
      const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(
        (line) => line && !line.includes("ExperimentalWarning") && !line.includes("--trace-warnings") && !/^- Deploying to /.test(line)
      );
      const failures = lines.filter((line) => line.startsWith("\u2716") || /error/i.test(line));
      const tail = (failures.length > 0 ? failures : lines).slice(-4).join("\n");
      reject(
        new Error(
          `${command} ${args[0] ?? ""} ${args[1] ?? ""} failed ${signal ? `with signal ${signal}` : `with exit code ${code}`}${tail ? `: ${tail}` : ""}`
        )
      );
    });
  });
}
function readBundledDeployCredential() {
  try {
    const backendRoot = resolveBackendRoot();
    const envPath = import_node_path14.default.join(backendRoot, ".env.local");
    if (!(0, import_node_fs7.existsSync)(envPath)) return null;
    const env = {};
    for (const line of (0, import_node_fs7.readFileSync)(envPath, "utf8").split(/\r?\n/)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match) continue;
      env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
    if (!env.CONVEX_DEPLOY_KEY || !env.CONVEX_DEPLOYMENT || !env.CONVEX_URL) return null;
    return {
      deployKey: env.CONVEX_DEPLOY_KEY,
      deployment: env.CONVEX_DEPLOYMENT,
      convexUrl: env.CONVEX_URL
    };
  } catch {
    return null;
  }
}
function mapDeploymentOrigin(origin) {
  if (!isDev()) return origin;
  const raw = process.env.CONVEXPRESS_DEPLOY_ORIGIN_MAP;
  if (!raw) return origin;
  for (const pair of raw.split(",")) {
    const [from, to] = pair.split("=").map((part) => part.trim().replace(/\/+$/, ""));
    if (from && to && from === origin.replace(/\/+$/, "")) return to;
  }
  return origin;
}
async function execute(request, run, promptedKey) {
  const backendRoot = resolveBackendRoot();
  const secrets = [];
  const env = { ...process.env };
  const targetArgs = [];
  if (request.credential.kind === "prompt") {
    if (!promptedKey) throw new Error("No deployment key was entered.");
    secrets.push(promptedKey);
    targetArgs.push("--url", mapDeploymentOrigin(request.credential.deploymentOrigin), "--admin-key", promptedKey);
  } else if (request.credential.kind === "control-plane") {
    const controlPlaneUrl = configStore2.get("convexUrl");
    if (typeof controlPlaneUrl !== "string" || !controlPlaneUrl.trim()) {
      throw new Error("The ConvexPress control plane is not configured.");
    }
    const { ConvexHttpClient: ConvexHttpClient2 } = await import("convex/browser");
    const { makeFunctionReference: makeFunctionReference2 } = await import("convex/server");
    const client = new ConvexHttpClient2(mapDeploymentOrigin(controlPlaneUrl.trim()));
    client.setAuth(request.credential.authToken);
    const issued = await client.action(
      makeFunctionReference2("connections/siteAuth:issueDeploymentCredential"),
      { connectionId: request.credential.connectionId }
    );
    secrets.push(issued.deploymentAdminKey, request.credential.authToken);
    targetArgs.push("--url", mapDeploymentOrigin(issued.deploymentOrigin), "--admin-key", issued.deploymentAdminKey);
  } else if (request.credential.kind === "bundled") {
    const bundled = readBundledDeployCredential();
    if (!bundled) throw new Error("This install has no bundled deploy key; connect the site through the control plane instead.");
    if (bundled.convexUrl.replace(/\/+$/, "") !== request.credential.convexUrl) {
      throw new Error("The bundled deploy key belongs to a different deployment.");
    }
    secrets.push(bundled.deployKey);
    env.CONVEX_DEPLOYMENT = bundled.deployment;
    env.CONVEX_DEPLOY_KEY = bundled.deployKey;
  } else if (request.credential.kind === "admin-key") {
    secrets.push(request.credential.adminKey);
    targetArgs.push(
      "--url",
      mapDeploymentOrigin(request.credential.deploymentOrigin),
      "--admin-key",
      request.credential.adminKey
    );
  } else {
    secrets.push(request.credential.deployKey);
    env.CONVEX_DEPLOYMENT = request.credential.deployment;
    env.CONVEX_DEPLOY_KEY = request.credential.deployKey;
  }
  for (const change of request.envChanges) if (change.value) secrets.push(change.value);
  const report = (phase, message) => {
    const safe = redactDeployLog(message, secrets);
    run.phase = phase;
    run.log.push(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${phase}: ${safe}`);
    if (run.log.length > 400) run.log.splice(0, run.log.length - 400);
    console.log(`[Site deploy] ${run.label} \xB7 ${phase}: ${safe}`);
    broadcast2({ runId: run.runId, phase, message: safe, at: Date.now() });
  };
  if (request.envChanges.length > 0) {
    report("environment", `Writing ${request.envChanges.length} environment variable(s).`);
    for (const change of request.envChanges) {
      const onLine = (line) => report("environment", line);
      if (change.value === null) {
        await runCommand2("bunx", ["convex", "env", "remove", change.name, ...targetArgs], {
          cwd: backendRoot,
          env,
          onLine
        });
      } else {
        await setDeploymentEnv(change.name, change.value, targetArgs, { cwd: backendRoot, env, onLine });
      }
      report("environment", `${change.name} ${change.value === null ? "removed" : "set"}.`);
    }
  }
  if (request.envOnly) {
    report("complete", "Environment applied.");
    return;
  }
  report("codegen", "Regenerating extension index.");
  await runCommand2("node", ["scripts/generate-extension-index.mjs"], {
    cwd: backendRoot,
    env,
    onLine: (line) => report("codegen", line)
  });
  report("deploy", "Deploying the ConvexPress backend (this can take a minute).");
  await runCommand2(
    "bunx",
    ["convex", "deploy", ...targetArgs, "--message", `ConvexPress: ${request.label}`],
    { cwd: backendRoot, env, onLine: (line) => report("deploy", line) }
  );
  report("complete", "Deployed. The site now trusts the configured sign-in provider.");
}
var MANAGEMENT_CAPABILITIES = [
  "health.read",
  "compatibility.read",
  "site.register",
  "site.attach",
  "site.deploy",
  "site.select",
  "session.exchange",
  "backup.create",
  "site.clone",
  "site.promote",
  "site.restore",
  "credential.rotate",
  "authority.grant",
  "authority.revoke",
  "operation.resume",
  "handoff.export"
];
function runCapture(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = (0, import_node_child_process4.spawn)(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout += chunk.toString());
    child.stderr.on("data", (chunk) => stderr += chunk.toString());
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
async function fetchJson(url, init = {}, timeoutMs = 15e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}
async function initializeSite(request, adminKey, controlPlaneUrl, run) {
  const backendRoot = resolveBackendRoot();
  const deployOrigin = mapDeploymentOrigin(request.deploymentOrigin);
  const secrets = [adminKey, request.authToken];
  const env = { ...process.env };
  const targetArgs = ["--url", deployOrigin, "--admin-key", adminKey];
  const report = (phase, message) => {
    const safe = redactDeployLog(message, secrets);
    run.phase = phase;
    run.log.push(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${phase}: ${safe}`);
    if (run.log.length > 400) run.log.splice(0, run.log.length - 400);
    console.log(`[Site init] ${run.label} \xB7 ${phase}: ${safe}`);
    broadcast2({ runId: run.runId, phase, message: safe, at: Date.now() });
  };
  report("environment", `Checking the deployment at ${deployOrigin}.`);
  const existing = await runCapture("bunx", ["convex", "env", "list", ...targetArgs], { cwd: backendRoot, env });
  if (existing.code !== 0) {
    const tail = existing.stderr.trim().split("\n").slice(-4).join(" ");
    throw new Error(`The deployment rejected the admin key or is unreachable: ${tail}`);
  }
  const presentNames = new Set(
    existing.stdout.split(/\r?\n/).map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line.trim())?.[1]).filter((name) => Boolean(name))
  );
  const adminOrigins = Array.from(/* @__PURE__ */ new Set(["http://localhost:4105", "http://127.0.0.1:4105", ...request.adminOrigins]));
  const wanted = [
    ["AUTH_ISSUER_URL", request.managementOrigin],
    ["AUTH_ALLOWED_ORIGINS", adminOrigins.join(",")],
    ["AUTH_ALLOW_NULL_ORIGIN", "true"],
    ["SITE_URL", request.siteOrigin]
  ];
  if (!presentNames.has("AUTH_PRIVATE_KEY")) wanted.unshift(["AUTH_PRIVATE_KEY", generateAuthPrivateKey()]);
  for (const name of AT_REST_ENCRYPTION_KEYS) {
    if (!presentNames.has(name)) wanted.push([name, generateEncryptionKeyHex()]);
  }
  for (const [name, value] of wanted) {
    if (presentNames.has(name) && name !== "SITE_URL" && name !== "AUTH_ISSUER_URL") {
      report("environment", `${name} already set, keeping it.`);
      continue;
    }
    if (name === "AUTH_PRIVATE_KEY" || AT_REST_ENCRYPTION_KEYS.includes(name)) secrets.push(value);
    await setDeploymentEnv(name, value, targetArgs, {
      cwd: backendRoot,
      env,
      onLine: (line) => report("environment", line)
    });
    report("environment", `${name} set.`);
  }
  report("codegen", "Regenerating extension index.");
  await runCommand2("node", ["scripts/generate-extension-index.mjs"], { cwd: backendRoot, env, onLine: (line) => report("codegen", line) });
  report("deploy", "Deploying the ConvexPress backend (this can take a minute).");
  await runCommand2("bunx", ["convex", "deploy", ...targetArgs, "--message", `ConvexPress: initialize ${request.websiteKey}/${request.instanceKey}`], {
    cwd: backendRoot,
    env,
    onLine: (line) => report("deploy", line)
  });
  report("identity", "Writing the site identity and seeding roles.");
  const identity = {
    websiteKey: request.websiteKey,
    instanceKey: request.instanceKey,
    environmentKind: request.environmentKind,
    deploymentOrigin: request.deploymentOrigin,
    managementOrigin: request.managementOrigin,
    siteOrigin: request.siteOrigin,
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
    managementCapabilities: MANAGEMENT_CAPABILITIES
  };
  await runCommand2("bunx", ["convex", "run", "management/bootstrap:configureIdentity", JSON.stringify(identity), ...targetArgs], {
    cwd: backendRoot,
    env,
    onLine: (line) => report("identity", line)
  });
  await runCommand2("bunx", ["convex", "run", "roles/internals:seedRoles", "{}", ...targetArgs], {
    cwd: backendRoot,
    env,
    onLine: (line) => report("identity", line)
  });
  const healthOrigin = mapDeploymentOrigin(request.managementOrigin);
  const health = await fetchJson(`${healthOrigin}/api/convexpress/management/health`);
  if (!health.ok || health.json?.websiteKey !== request.websiteKey || health.json?.instanceKey !== request.instanceKey) {
    throw new Error(`The site answered its health check with an unexpected identity (HTTP ${health.status}).`);
  }
  report("identity", "Site identity confirmed by the health endpoint.");
  report("connect", "Enrolling the controller connection.");
  const { ConvexHttpClient: ConvexHttpClient2 } = await import("convex/browser");
  const { makeFunctionReference: makeFunctionReference2 } = await import("convex/server");
  const client = new ConvexHttpClient2(mapDeploymentOrigin(controlPlaneUrl));
  client.setAuth(request.authToken);
  const created = await client.action(makeFunctionReference2("connections/actions:create"), {
    instanceId: request.instanceId,
    name: request.connectionName,
    ...request.accountLabel ? { accountLabel: request.accountLabel } : {},
    deploymentAdminKey: adminKey
  });
  report("complete", `Connected (${created.status}). The site is ready.`);
  return String(created.connectionId);
}
function registerSiteDeployHandlers() {
  ipcMain11.handle("site-deploy:status", (event) => {
    assertSender3(event);
    const run = activeRun ?? lastRun;
    return run ? { ...run, log: run.log.slice(-60) } : null;
  });
  ipcMain11.handle("site-deploy:run", async (event, rawInput) => {
    assertSender3(event);
    if (activeRun) throw new Error(`A deploy is already running (${activeRun.label}).`);
    const request = assertSiteDeployRequest(rawInput);
    let promptedKey = null;
    if (request.credential.kind === "prompt") {
      promptedKey = await requestDeploymentCredential(BrowserWindow6.fromWebContents(event.sender));
      if (!promptedKey) return { runId: null, ok: false, cancelled: true, error: null, log: [] };
    }
    const run = {
      runId: `deploy_${Date.now().toString(36)}`,
      label: request.label,
      startedAt: Date.now(),
      finishedAt: null,
      phase: "environment",
      ok: null,
      error: null,
      log: []
    };
    activeRun = run;
    try {
      await execute(request, run, promptedKey);
      run.ok = true;
    } catch (error) {
      run.ok = false;
      run.phase = "failed";
      run.error = redactDeployLog(describeFailure(error), [
        request.credential.kind === "admin-key" ? request.credential.adminKey : request.credential.kind === "deploy-key" ? request.credential.deployKey : request.credential.kind === "prompt" ? promptedKey ?? "" : request.credential.kind === "control-plane" ? request.credential.authToken : readBundledDeployCredential()?.deployKey ?? "",
        ...request.envChanges.map((change) => change.value ?? "")
      ]);
      broadcast2({ runId: run.runId, phase: "failed", message: run.error, at: Date.now() });
    } finally {
      run.finishedAt = Date.now();
      lastRun = run;
      activeRun = null;
      promptedKey = null;
    }
    return { runId: run.runId, ok: run.ok === true, cancelled: false, error: run.error, log: run.log.slice(-60) };
  });
  ipcMain11.handle("site-deploy:initialize", async (event, rawInput) => {
    assertSender3(event);
    if (activeRun) throw new Error(`A deploy is already running (${activeRun.label}).`);
    const request = assertSiteInitializeRequest(rawInput);
    const controlPlaneUrl = configStore2.get("convexUrl");
    if (typeof controlPlaneUrl !== "string" || !controlPlaneUrl.trim()) {
      throw new Error("The ConvexPress control plane is not configured.");
    }
    let adminKey = await requestDeploymentCredential(BrowserWindow6.fromWebContents(event.sender));
    if (!adminKey) return { runId: null, ok: false, cancelled: true, error: null, log: [], connectionId: null };
    const run = {
      runId: `init_${Date.now().toString(36)}`,
      label: `Initialize ${request.siteTitle}`,
      startedAt: Date.now(),
      finishedAt: null,
      phase: "environment",
      ok: null,
      error: null,
      log: []
    };
    activeRun = run;
    let connectionId = null;
    try {
      connectionId = await initializeSite(request, adminKey, controlPlaneUrl.trim(), run);
      run.ok = true;
    } catch (error) {
      run.ok = false;
      run.phase = "failed";
      run.error = redactDeployLog(describeFailure(error), [adminKey]);
      broadcast2({ runId: run.runId, phase: "failed", message: run.error, at: Date.now() });
    } finally {
      run.finishedAt = Date.now();
      lastRun = run;
      activeRun = null;
      adminKey = null;
    }
    return { runId: run.runId, ok: run.ok === true, cancelled: false, error: run.error, log: run.log.slice(-60), connectionId };
  });
  ipcMain11.handle("site-deploy:bundled-credential", (event) => {
    assertSender3(event);
    const bundled = readBundledDeployCredential();
    return bundled ? { available: true, convexUrl: bundled.convexUrl, deployment: bundled.deployment } : { available: false };
  });
}

// electron/ipc/index.ts
var { ipcMain: ipcMain12, app: app5 } = require("electron");
function registerAllIpcHandlers() {
  registerWindowHandlers();
  registerConfigHandlers();
  registerAuthHandlers();
  registerSetupHandlers();
  registerHandoffHandlers();
  registerConnectionProvisionHandlers();
  registerAppUpdaterHandlers();
  registerUpdaterHandlers();
  registerSiteRunnerHandlers();
  registerSecurityHandlers();
  registerSiteDeployHandlers();
  ipcMain12.handle("app:get-version", () => {
    return app5.getVersion();
  });
  ipcMain12.handle("app:get-platform", () => {
    return {
      os: process.platform,
      arch: process.arch,
      electron: process.versions.electron
    };
  });
  ipcMain12.handle("app:quit", () => {
    app5.quit();
  });
}

// electron/cspPolicy.ts
var CLOUD_CONNECT_SOURCES = [
  "https://*.convex.cloud",
  "https://*.convex.dev",
  "https://*.convex.site",
  "wss://*.convex.cloud",
  "wss://*.convex.dev",
  "https://convex.cloud",
  "https://convex.dev"
];
var LOOPBACK_CONNECT_SOURCES = [
  "http://localhost:*",
  "ws://localhost:*",
  "http://127.0.0.1:*",
  "ws://127.0.0.1:*"
];
var LOOPBACK_MEDIA_SOURCES = [
  "http://localhost:*",
  "http://127.0.0.1:*"
];
function isLoopbackUrl2(value) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      parsed.hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}
function exactNetworkOrigins(value) {
  if (typeof value !== "string") return [];
  try {
    const parsed = new URL(value);
    if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      return [];
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const websocketProtocol = parsed.protocol === "http:" ? "ws:" : "wss:";
      return [parsed.origin, `${websocketProtocol}//${parsed.host}`];
    }
    return [parsed.origin];
  } catch {
    return [];
  }
}
function controllerConfigUsesLoopback(convexUrl, convexSiteUrl) {
  return isLoopbackUrl2(convexUrl) || isLoopbackUrl2(convexSiteUrl);
}
function exactHttpOrigins(values) {
  return [
    ...new Set(
      values.flatMap(exactNetworkOrigins).filter((origin) => origin.startsWith("http:") || origin.startsWith("https:"))
    )
  ];
}
function buildDesktopContentSecurityPolicy({
  development,
  allowLoopback,
  additionalConnectOrigins = []
}) {
  const permitsLoopback = development || allowLoopback;
  const connectSources = [
    "'self'",
    ...permitsLoopback ? LOOPBACK_CONNECT_SOURCES : [],
    ...new Set(
      additionalConnectOrigins.flatMap(exactNetworkOrigins)
    ),
    ...CLOUD_CONNECT_SOURCES
  ];
  const deploymentHttpOrigins = exactHttpOrigins(additionalConnectOrigins);
  const imageSources = [
    "'self'",
    ...development ? [] : ["file:"],
    "data:",
    "blob:",
    ...permitsLoopback ? LOOPBACK_MEDIA_SOURCES : [],
    ...deploymentHttpOrigins,
    "https://*.convex.cloud",
    "https://*.convex.site",
    "https://convex.cloud",
    "https://secure.gravatar.com"
  ];
  const mediaSources = [
    "'self'",
    ...development ? [] : ["file:"],
    "data:",
    "blob:",
    ...permitsLoopback ? LOOPBACK_MEDIA_SOURCES : [],
    ...deploymentHttpOrigins,
    "https://*.convex.cloud",
    "https://*.convex.site"
  ];
  const frameSources = ["'self'", ...permitsLoopback ? LOOPBACK_MEDIA_SOURCES : [], ...deploymentHttpOrigins];
  return [
    development ? "default-src 'self'" : "default-src 'self' file: blob:",
    development ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' file: 'unsafe-inline'",
    development ? "style-src 'self' 'unsafe-inline'" : "style-src 'self' file: 'unsafe-inline'",
    `connect-src ${connectSources.join(" ")}`,
    `img-src ${imageSources.join(" ")}`,
    `media-src ${mediaSources.join(" ")}`,
    `frame-src ${frameSources.join(" ")}`,
    development ? "font-src 'self' data:" : "font-src 'self' file: data:",
    "frame-ancestors 'none'",
    "base-uri 'self'"
  ].join("; ");
}

// electron/tray.ts
var import_node_path15 = __toESM(require("path"));
var { app: app6, Menu, nativeImage, Tray } = require("electron");
var tray = null;
function loadTrayIcon() {
  const iconPath = isDev() ? import_node_path15.default.join(__dirname, "../resources/iconTemplate.png") : import_node_path15.default.join(process.resourcesPath, "iconTemplate.png");
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
        app6.quit();
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
  app: app7,
  BrowserWindow: BrowserWindow7,
  ipcMain: ipcMain13,
  nativeTheme,
  net: net3,
  protocol,
  session
} = require("electron");
protocol.registerSchemesAsPrivileged([
  {
    scheme: PACKAGED_RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);
app7.setName("ConvexPress");
if (isDev()) {
  app7.setPath("userData", import_node_path16.default.join(app7.getPath("userData"), "-dev"));
}
var LOG_FILE = import_node_path16.default.join(app7.getPath("userData"), "convexpress-debug.log");
function fileLog(msg) {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`;
  try {
    (0, import_node_fs8.appendFileSync)(LOG_FILE, line);
  } catch {
  }
  safeLog(msg);
}
try {
  (0, import_node_fs8.writeFileSync)(
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
var store4 = new JsonStore({ name: "convexpress-config" });
process.on("uncaughtException", (error) => {
  safeError("[Main] Uncaught exception:", error);
});
process.on("unhandledRejection", (reason) => {
  safeError("[Main] Unhandled rejection:", reason);
});
function isSetupComplete() {
  const setupComplete = store4.get("setupComplete");
  const convexUrl = store4.get("convexUrl");
  return !!(setupComplete && convexUrl);
}
function removeDeprecatedSecretsFromConfig() {
  if (store4.get("adminKey") !== void 0) {
    store4.delete("adminKey");
    fileLog("[Main] Removed deprecated deploy key from desktop config");
  }
}
function getInitialRouteForCurrentLaunch() {
  const pendingAdminCredentials = store4.get("pendingAdminCredentials");
  const pendingLoginCredentials = store4.get("pendingLoginCredentials");
  if (pendingAdminCredentials != null && !isPendingAdminHandoffUsable(pendingAdminCredentials)) {
    store4.delete("pendingAdminCredentials");
    fileLog("[Main] Cleared expired first-admin setup handoff");
  }
  if (pendingLoginCredentials != null && !isPendingLoginHandoffUsable(pendingLoginCredentials)) {
    store4.delete("pendingLoginCredentials");
    fileLog("[Main] Cleared expired setup login handoff");
  }
  return getInitialRouteForLaunch({
    pendingAdminCredentials: store4.get("pendingAdminCredentials"),
    pendingLoginCredentials: store4.get("pendingLoginCredentials")
  });
}
function getWizardIndexPath3() {
  return import_node_path16.default.join(__dirname, "wizard", "index.html");
}
function launchApp() {
  createTray(windowManager);
  const mainWindow = windowManager.createMainWindow({
    initialRoute: getInitialRouteForCurrentLaunch()
  });
  nativeTheme.on("updated", () => {
    const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("theme:os-changed", theme);
    }
  });
  if (app7.isPackaged && !isDev()) {
    const installPath = import_node_path16.default.dirname(app7.getAppPath());
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
var gotTheLock = app7.requestSingleInstanceLock();
if (!gotTheLock) {
  app7.quit();
} else {
  app7.on("second-instance", () => {
    const win = windowManager.getMainWindow() ?? windowManager.getWizardWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}
app7.whenReady().then(async () => {
  fileLog("[Main] App ready");
  removeDeprecatedSecretsFromConfig();
  const packagedRendererRoot = import_node_path16.default.join(__dirname, "..", "dist");
  protocol.handle(PACKAGED_RENDERER_SCHEME, (request) => {
    try {
      const rendererPath = resolvePackagedRendererPath(
        packagedRendererRoot,
        request.url
      );
      return net3.fetch((0, import_node_url2.pathToFileURL)(rendererPath).href);
    } catch (error) {
      fileLog(`[Main] Rejected packaged renderer request: ${String(error)}`);
      return new Response("Not found", { status: 404 });
    }
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== "mainFrame") {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const csp = buildDesktopContentSecurityPolicy({
      development: isDev(),
      allowLoopback: controllerConfigUsesLoopback(
        store4.get("convexUrl"),
        store4.get("convexSiteUrl")
      ),
      additionalConnectOrigins: [
        store4.get("convexUrl"),
        store4.get("convexSiteUrl"),
        process.env.CONVEXPRESS_ACCEPTANCE_CONTROL_ORIGIN,
        process.env.CONVEXPRESS_ACCEPTANCE_CONTROL_SITE_ORIGIN,
        process.env.CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_ORIGIN,
        process.env.CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_SITE_ORIGIN,
        process.env.CONVEXPRESS_ACCEPTANCE_SITE_BETA_ORIGIN,
        process.env.CONVEXPRESS_ACCEPTANCE_SITE_BETA_SITE_ORIGIN,
        process.env.CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_ORIGIN,
        process.env.CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_SITE_ORIGIN,
        process.env.CONVEXPRESS_ACCEPTANCE_SECONDARY_CONTROL_ORIGIN,
        process.env.CONVEXPRESS_ACCEPTANCE_SECONDARY_CONTROL_SITE_ORIGIN,
        // Site deployments the renderer has connected to (control plane assigns them).
        ...listRegisteredDeploymentOrigins()
      ]
    });
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp]
      }
    });
  });
  registerAllIpcHandlers();
  setSiteRunnerLogger(fileLog);
  let appLaunched = false;
  ipcMain13.handle("app:reload-from-setup", (event) => {
    if (!isExactWizardSender(event.sender.getURL(), getWizardIndexPath3())) {
      throw new Error("Setup launch can only be requested from the setup wizard.");
    }
    if (appLaunched) return;
    appLaunched = true;
    fileLog("[Main] Setup complete \u2014 launching app");
    for (const win of BrowserWindow7.getAllWindows()) {
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
app7.on("window-all-closed", () => {
});
app7.on("activate", () => {
  if (isSetupComplete()) {
    windowManager.createMainWindow({
      initialRoute: getInitialRouteForCurrentLaunch()
    });
  } else {
    windowManager.createWizardWindow();
  }
});
app7.on("before-quit", () => {
  fileLog("[Main] App quitting \u2014 cleaning up");
  setQuitting(true);
  shutdownSiteRunner();
});
