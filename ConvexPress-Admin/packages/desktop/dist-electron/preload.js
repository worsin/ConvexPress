"use strict";

// electron/preload.ts
var import_electron = require("electron");
var ALLOWED_INVOKE_CHANNELS = /* @__PURE__ */ new Set([
  // Window management
  "window:minimize",
  "window:maximize",
  "window:close",
  "window:set-always-on-top",
  "window:is-maximized",
  // Auth storage (Convex Auth token persistence)
  "auth:get",
  "auth:set",
  "auth:remove",
  // Config
  "config:get",
  "config:set",
  "config:test-connection",
  // App
  "app:get-version",
  "app:get-platform",
  "app:quit",
  // App-content updater (git-based)
  "app-update:check",
  "app-update:install",
  // Shell updater (electron-updater)
  "app:check-for-updates",
  "app:install-update",
  // Setup wizard
  "setup:complete",
  "app:reload-from-setup"
]);
var ALLOWED_ON_CHANNELS = /* @__PURE__ */ new Set([
  // Window events
  "window:maximized",
  // Theme events
  "theme:os-changed",
  // Navigation (main process can push routes)
  "navigate",
  // App-content updater events (git-based)
  "app-update:available",
  "app-update:progress",
  "app-update:check-error",
  // Shell updater events (electron-updater)
  "app:update-available",
  "app:update-downloaded",
  "app:update-error",
  "app:checking-for-updates"
]);
var AUTH_KEY_PREFIXES = ["__convexAuth", "convexAuth"];
function isAllowedAuthKey(key) {
  return AUTH_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}
import_electron.contextBridge.exposeInMainWorld("convexpress", {
  /**
   * Invoke an IPC channel with arguments. Only allowlisted channels are permitted.
   */
  invoke: (channel, ...args) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return import_electron.ipcRenderer.invoke(channel, ...args);
  },
  /**
   * Listen to an IPC channel. Returns an unsubscribe function.
   * Only allowlisted channels are permitted.
   */
  on: (channel, callback) => {
    if (!ALLOWED_ON_CHANNELS.has(channel)) {
      console.warn(`IPC listen channel not allowed: ${channel}`);
      return () => {
      };
    }
    const handler = (_event, ...args) => callback(...args);
    import_electron.ipcRenderer.on(channel, handler);
    return () => import_electron.ipcRenderer.removeListener(channel, handler);
  },
  // ---------- Convenience Methods ----------
  window: {
    minimize: () => import_electron.ipcRenderer.invoke("window:minimize"),
    maximize: () => import_electron.ipcRenderer.invoke("window:maximize"),
    close: () => import_electron.ipcRenderer.invoke("window:close"),
    setAlwaysOnTop: (value) => import_electron.ipcRenderer.invoke("window:set-always-on-top", value),
    isMaximized: () => import_electron.ipcRenderer.invoke("window:is-maximized")
  },
  app: {
    getVersion: () => import_electron.ipcRenderer.invoke("app:get-version"),
    getPlatform: () => import_electron.ipcRenderer.invoke("app:get-platform"),
    quit: () => import_electron.ipcRenderer.invoke("app:quit"),
    checkForUpdates: () => import_electron.ipcRenderer.invoke("app:check-for-updates"),
    installUpdate: () => import_electron.ipcRenderer.invoke("app:install-update")
  },
  config: {
    get: (key) => import_electron.ipcRenderer.invoke("config:get", key),
    set: (key, value) => import_electron.ipcRenderer.invoke("config:set", key, value),
    testConnection: (url) => import_electron.ipcRenderer.invoke("config:test-connection", url)
  }
});
import_electron.contextBridge.exposeInMainWorld("electronAuth", {
  getItem: (key) => {
    if (!isAllowedAuthKey(key)) {
      return Promise.reject(
        new Error(`Auth key not allowed: ${key}`)
      );
    }
    return import_electron.ipcRenderer.invoke("auth:get", key);
  },
  setItem: (key, value) => {
    if (!isAllowedAuthKey(key)) {
      return Promise.reject(
        new Error(`Auth key not allowed: ${key}`)
      );
    }
    return import_electron.ipcRenderer.invoke("auth:set", key, value);
  },
  removeItem: (key) => {
    if (!isAllowedAuthKey(key)) {
      return Promise.reject(
        new Error(`Auth key not allowed: ${key}`)
      );
    }
    return import_electron.ipcRenderer.invoke("auth:remove", key);
  }
});
import_electron.contextBridge.exposeInMainWorld("convexpressSetup", {
  /**
   * Test whether a Convex deployment URL is reachable.
   */
  testConnection: (url) => import_electron.ipcRenderer.invoke("config:test-connection", url),
  /**
   * Save setup configuration and mark setup as complete.
   */
  saveConfig: (options) => import_electron.ipcRenderer.invoke("setup:complete", options),
  /**
   * Get platform info for the wizard UI.
   */
  getPlatform: () => import_electron.ipcRenderer.invoke("app:get-platform"),
  /**
   * Signal that setup is complete and the main app should launch.
   */
  launchApp: () => import_electron.ipcRenderer.invoke("app:reload-from-setup"),
  /**
   * Quit the application from the wizard.
   */
  quit: () => import_electron.ipcRenderer.invoke("app:quit")
});
