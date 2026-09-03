import { getElectronAuth, isElectron } from "@/lib/electron";

const AUTH_STORAGE_KEYS = [
  "better-auth_cookie",
  "better-auth_session_data",
] as const;

type AuthStorageKey = (typeof AUTH_STORAGE_KEYS)[number];
const cache: Partial<Record<AuthStorageKey, string>> = {};
let initialized = false;
let writeQueue = Promise.resolve();

function requireKey(value: string): AuthStorageKey {
  if (!AUTH_STORAGE_KEYS.includes(value as AuthStorageKey)) {
    throw new Error("CONTROL_AUTH_STORAGE_KEY_INVALID");
  }
  return value as AuthStorageKey;
}

function browserStorage() {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export async function initializeControlAuthStorage(): Promise<void> {
  if (initialized) return;
  if (isElectron()) {
    const bridge = getElectronAuth();
    if (!bridge) throw new Error("CONTROL_AUTH_STORAGE_BRIDGE_UNAVAILABLE");
    for (const key of AUTH_STORAGE_KEYS) {
      const value = await bridge.getItem(key);
      if (value !== null) cache[key] = value;
    }
  } else {
    const storage = browserStorage();
    for (const key of AUTH_STORAGE_KEYS) {
      const value = storage?.getItem(key);
      if (value !== null && value !== undefined) cache[key] = value;
    }
  }
  initialized = true;
}

export const controlAuthStorage = {
  getItem(keyValue: string): string | null {
    if (!initialized) throw new Error("CONTROL_AUTH_STORAGE_NOT_INITIALIZED");
    return cache[requireKey(keyValue)] ?? null;
  },

  setItem(keyValue: string, value: string): void {
    if (!initialized) throw new Error("CONTROL_AUTH_STORAGE_NOT_INITIALIZED");
    const key = requireKey(keyValue);
    cache[key] = value;
    if (isElectron()) {
      const bridge = getElectronAuth();
      if (!bridge) throw new Error("CONTROL_AUTH_STORAGE_BRIDGE_UNAVAILABLE");
      writeQueue = writeQueue.then(() => bridge.setItem(key, value));
    } else {
      browserStorage()?.setItem(key, value);
    }
  },

  removeItem(keyValue: string): void {
    if (!initialized) throw new Error("CONTROL_AUTH_STORAGE_NOT_INITIALIZED");
    const key = requireKey(keyValue);
    delete cache[key];
    if (isElectron()) {
      const bridge = getElectronAuth();
      if (!bridge) throw new Error("CONTROL_AUTH_STORAGE_BRIDGE_UNAVAILABLE");
      writeQueue = writeQueue.then(() => bridge.removeItem(key));
    } else {
      browserStorage()?.removeItem(key);
    }
  },
};

export async function flushControlAuthStorage(): Promise<void> {
  await writeQueue;
}
