import { contextBridge, ipcRenderer } from "electron";

// ---------- Channel Allowlists ----------

const ALLOWED_INVOKE_CHANNELS = new Set([
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
  "app:reload-from-setup",
]);

const ALLOWED_ON_CHANNELS = new Set([
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
  "app:checking-for-updates",
]);

// ---------- Allowed Auth Keys ----------

const AUTH_KEY_PREFIXES = ["__convexAuth", "convexAuth"];

function isAllowedAuthKey(key: string): boolean {
  return AUTH_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// ---------- Main Bridge ----------

contextBridge.exposeInMainWorld("convexpress", {
  /**
   * Invoke an IPC channel with arguments. Only allowlisted channels are permitted.
   */
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Listen to an IPC channel. Returns an unsubscribe function.
   * Only allowlisted channels are permitted.
   */
  on: (
    channel: string,
    callback: (...args: unknown[]) => void
  ): (() => void) => {
    if (!ALLOWED_ON_CHANNELS.has(channel)) {
      console.warn(`IPC listen channel not allowed: ${channel}`);
      return () => {};
    }
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // ---------- Convenience Methods ----------

  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    setAlwaysOnTop: (value: boolean) =>
      ipcRenderer.invoke("window:set-always-on-top", value),
    isMaximized: () =>
      ipcRenderer.invoke("window:is-maximized") as Promise<boolean>,
  },

  app: {
    getVersion: () =>
      ipcRenderer.invoke("app:get-version") as Promise<string>,
    getPlatform: () =>
      ipcRenderer.invoke("app:get-platform") as Promise<{
        os: string;
        arch: string;
        electron: string;
      }>,
    quit: () => ipcRenderer.invoke("app:quit"),
    checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
    installUpdate: () => ipcRenderer.invoke("app:install-update"),
  },

  config: {
    get: (key: string) => ipcRenderer.invoke("config:get", key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke("config:set", key, value),
    testConnection: (url: string) =>
      ipcRenderer.invoke("config:test-connection", url) as Promise<{
        ok: boolean;
        status?: number;
        error?: string;
      }>,
  },
});

// ---------- Auth Bridge ----------
// Provides localStorage-compatible API for Convex Auth token persistence.
// Only keys starting with "__convexAuth" or "convexAuth" are permitted.

contextBridge.exposeInMainWorld("electronAuth", {
  getItem: (key: string): Promise<string | null> => {
    if (!isAllowedAuthKey(key)) {
      return Promise.reject(
        new Error(`Auth key not allowed: ${key}`)
      );
    }
    return ipcRenderer.invoke("auth:get", key) as Promise<string | null>;
  },

  setItem: (key: string, value: string): Promise<void> => {
    if (!isAllowedAuthKey(key)) {
      return Promise.reject(
        new Error(`Auth key not allowed: ${key}`)
      );
    }
    return ipcRenderer.invoke("auth:set", key, value) as Promise<void>;
  },

  removeItem: (key: string): Promise<void> => {
    if (!isAllowedAuthKey(key)) {
      return Promise.reject(
        new Error(`Auth key not allowed: ${key}`)
      );
    }
    return ipcRenderer.invoke("auth:remove", key) as Promise<void>;
  },
});

// ---------- Setup Wizard Bridge ----------
// Exposed separately so the wizard window can configure the app
// before the main SPA is loaded.

contextBridge.exposeInMainWorld("convexpressSetup", {
  /**
   * Test whether a Convex deployment URL is reachable.
   */
  testConnection: (url: string) =>
    ipcRenderer.invoke("config:test-connection", url) as Promise<{
      ok: boolean;
      status?: number;
      error?: string;
    }>,

  /**
   * Save setup configuration and mark setup as complete.
   */
  saveConfig: (options: {
    convexUrl: string;
    mode: "server" | "client";
    adminKey?: string;
    siteName?: string;
  }) =>
    ipcRenderer.invoke("setup:complete", options) as Promise<{
      success: boolean;
      error?: string;
    }>,

  /**
   * Get platform info for the wizard UI.
   */
  getPlatform: () =>
    ipcRenderer.invoke("app:get-platform") as Promise<{
      os: string;
      arch: string;
      electron: string;
    }>,

  /**
   * Signal that setup is complete and the main app should launch.
   */
  launchApp: () => ipcRenderer.invoke("app:reload-from-setup"),

  /**
   * Quit the application from the wizard.
   */
  quit: () => ipcRenderer.invoke("app:quit"),
});
