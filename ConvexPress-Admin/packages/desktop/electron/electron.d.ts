/**
 * TypeScript declarations for the ConvexPress Electron preload bridges.
 *
 * These types describe the APIs exposed on `window` by the preload script
 * via `contextBridge.exposeInMainWorld`.
 */

export interface ConvexPressAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;

  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    setAlwaysOnTop: (value: boolean) => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };

  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<{
      os: string;
      arch: string;
      electron: string;
    }>;
    quit: () => Promise<void>;
    checkForUpdates: () => Promise<void>;
    installUpdate: () => Promise<void>;
  };

  config: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    testConnection: (url: string) => Promise<{
      ok: boolean;
      status?: number;
      error?: string;
    }>;
  };
}

export interface ElectronAuthAPI {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export interface ConvexPressSetupAPI {
  testConnection: (url: string) => Promise<{
    ok: boolean;
    status?: number;
    error?: string;
  }>;
  saveConfig: (options: {
    convexUrl: string;
    mode: "server" | "client";
    adminKey?: string;
    siteName?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  getPlatform: () => Promise<{
    os: string;
    arch: string;
    electron: string;
  }>;
  launchApp: () => Promise<void>;
  quit: () => Promise<void>;
}

declare global {
  interface Window {
    convexpress: ConvexPressAPI;
    electronAuth: ElectronAuthAPI;
    convexpressSetup: ConvexPressSetupAPI;
  }
}
