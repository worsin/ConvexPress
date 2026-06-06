/**
 * Electron environment detection and bridge utilities.
 *
 * The preload script exposes `window.convexpress` and `window.electronAuth`
 * when running inside Electron. These helpers provide typed access to those
 * bridges and a simple detection function used throughout the app.
 */

// ---- Type definitions for the preload bridge ----

type RendererClearableConfigKey =
  | "pendingAdminCredentials"
  | "pendingLoginCredentials";

export interface ConvexpressConfig {
  get: (key: string) => Promise<unknown>;
  set: (key: RendererClearableConfigKey, value: null) => Promise<void>;
  testConnection: (url: string) => Promise<{
    ok: boolean;
    status?: number;
    error?: string;
  }>;
}

export interface ConvexpressWindow {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  isMaximized: () => Promise<boolean>;
}

export interface ConvexpressApp {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{ os: string; arch: string; electron: string }>;
  quit: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

export interface ConvexpressUpdate {
  /** Check for app-content updates (git-based) */
  checkForAppUpdate: () => Promise<unknown>;
  /** Install app-content update (git pull + build) */
  installAppUpdate: () => Promise<void>;
  /** Check for shell updates (electron-updater) */
  checkForShellUpdate: () => Promise<void>;
  /** Install shell update (quit and install) */
  installShellUpdate: () => Promise<void>;
}

export interface ConvexpressBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  window: ConvexpressWindow;
  app: ConvexpressApp;
  config: ConvexpressConfig;
}

export interface ElectronAuthStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

// ---- Augment the Window type ----

declare global {
  interface Window {
    convexpress?: ConvexpressBridge;
    electronAuth?: ElectronAuthStorage;
  }
}

// ---- Public helpers ----

/** Check if the app is running inside Electron. */
export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.convexpress;
}

/** Check if running inside Electron on macOS (traffic-light buttons sit at top-left). */
export function isMacElectron(): boolean {
  if (!isElectron()) return false;
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  return /Mac OS X|Macintosh/i.test(ua);
}

/**
 * Get the typed ConvexPress Electron bridge.
 * Returns null when running in a regular browser.
 */
export function getElectronBridge(): ConvexpressBridge | null {
  if (!isElectron()) return null;
  return window.convexpress!;
}

/**
 * Get the Electron auth storage bridge.
 * Returns null when running in a regular browser.
 */
export function getElectronAuth(): ElectronAuthStorage | null {
  if (!isElectron()) return null;
  return window.electronAuth ?? null;
}
