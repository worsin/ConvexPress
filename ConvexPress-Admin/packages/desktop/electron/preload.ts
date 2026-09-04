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
  // Portable website handoff
  "handoff:save-package",
  // Secure connection provisioning; the credential is collected elsewhere.
  "connections:provision",
  // Local storefront processes (one ConvexPress-Website checkout, many sites)
  "site-runner:list",
  "site-runner:get-config",
  "site-runner:set-config",
  "site-runner:pick-repo",
  "site-runner:start",
  "site-runner:stop",
  "site-runner:restart",
  "site-runner:forget",
  "site-runner:logs",
  "site-runner:open",
  "site-runner:open-url",
  "security:register-deployment-origins",
  "security:list-deployment-origins",
  // Apply site auth environment + redeploy a site's Convex backend
  "site-deploy:run",
  "site-deploy:status",
  "site-deploy:bundled-credential",
]);

const ALLOWED_ON_CHANNELS = new Set([
  // Window events
  "window:maximized",
  // Setup wizard
  "setup:progress",
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
  // Local storefront process state
  "site-runner:changed",
  // Site deploy progress
  "site-deploy:progress",
]);

// ---------- Allowed Auth Keys ----------

const AUTH_KEY_PREFIXES = ["__convexAuth", "convexAuth"];
const AUTH_EXACT_KEYS = new Set([
  "better-auth_cookie",
  "better-auth_session_data",
]);

function isAllowedAuthKey(key: string): boolean {
  return (
    AUTH_EXACT_KEYS.has(key) ||
    AUTH_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
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

  files: {
    saveHandoffPackage: (input: {
      suggestedFilename: string;
      packageJson: string;
    }) =>
      ipcRenderer.invoke("handoff:save-package", input) as Promise<{
        saved: boolean;
        filePath: string | null;
      }>,
  },

  siteRunner: {
    list: () => ipcRenderer.invoke("site-runner:list"),
    getConfig: () => ipcRenderer.invoke("site-runner:get-config"),
    setConfig: (input: { websiteRepoPath?: string | null }) =>
      ipcRenderer.invoke("site-runner:set-config", input),
    pickRepo: () => ipcRenderer.invoke("site-runner:pick-repo"),
    start: (target: unknown) => ipcRenderer.invoke("site-runner:start", target),
    stop: (key: string) => ipcRenderer.invoke("site-runner:stop", key),
    restart: (target: unknown) => ipcRenderer.invoke("site-runner:restart", target),
    forget: (key: string) => ipcRenderer.invoke("site-runner:forget", key),
    logs: (key: string) => ipcRenderer.invoke("site-runner:logs", key),
    open: (target: unknown) => ipcRenderer.invoke("site-runner:open", target),
    openUrl: (url: string) => ipcRenderer.invoke("site-runner:open-url", url),
    onChanged: (callback: (state: unknown) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
        callback(payload);
      ipcRenderer.on("site-runner:changed", handler);
      return () => ipcRenderer.removeListener("site-runner:changed", handler);
    },
  },

  security: {
    /** Allow the renderer to reach a site deployment; `added` lists origins new to the policy. */
    registerDeploymentOrigins: (origins: string[]) =>
      ipcRenderer.invoke("security:register-deployment-origins", origins) as Promise<{
        added: string[];
        origins: string[];
      }>,
    listDeploymentOrigins: () =>
      ipcRenderer.invoke("security:list-deployment-origins") as Promise<string[]>,
  },

  siteDeploy: {
    run: (input: unknown) => ipcRenderer.invoke("site-deploy:run", input),
    status: () => ipcRenderer.invoke("site-deploy:status"),
    bundledCredential: () => ipcRenderer.invoke("site-deploy:bundled-credential"),
    onProgress: (callback: (event: unknown) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
        callback(payload);
      ipcRenderer.on("site-deploy:progress", handler);
      return () => ipcRenderer.removeListener("site-deploy:progress", handler);
    },
  },

  connections: {
    provision: (input: {
      instanceId: string;
      name: string;
      accountLabel?: string;
      authToken: string;
    }) =>
      ipcRenderer.invoke("connections:provision", input) as Promise<
        | { cancelled: true }
        | {
            cancelled: false;
            connectionId: string;
            status: string;
            credentialVersion: number | null;
          }
      >,
  },
});

// ---------- Auth Bridge ----------
// Provides localStorage-compatible API for Convex Auth token persistence.
// Only the exact Better Auth keys and legacy Convex auth prefixes are permitted.

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
    convexSiteUrl?: string;
    mode: "server" | "client";
    adminKey?: string;
    siteName?: string;
    adminName?: string;
    adminEmail?: string;
    adminPassword?: string;
    clientIdentifier?: string;
    clientPassword?: string;
  }) =>
    ipcRenderer.invoke("setup:complete", options) as Promise<{
      success: boolean;
      error?: string;
    }>,

  /**
   * Listen for setup deployment progress.
   */
  onProgress: (
    callback: (event: { phase: string; message: string }) => void
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      callback(payload as { phase: string; message: string });
    };
    ipcRenderer.on("setup:progress", handler);
    return () => ipcRenderer.removeListener("setup:progress", handler);
  },

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
