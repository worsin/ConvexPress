import { getElectronAuth, isElectron } from "@/lib/electron";

const AUTH_STORAGE_KEYS = ["better-auth_cookie", "better-auth_session_data"] as const;

type AuthStorageKey = (typeof AUTH_STORAGE_KEYS)[number];
const cache: Partial<Record<AuthStorageKey, string>> = {};
let initialized = false;
let writeQueue = Promise.resolve();
let writeErrors: unknown[] = [];

function enqueueWrite(write: () => Promise<void>): void {
  // The sequencing tail always settles successfully so a transient failure
  // cannot prevent a later logout from deleting the persisted session.
  writeQueue = writeQueue.then(write).catch((error: unknown) => {
    writeErrors.push(error);
  });
}

function requireKey(value: string): AuthStorageKey {
  if (!AUTH_STORAGE_KEYS.includes(value as AuthStorageKey)) {
    throw new Error("CONTROL_AUTH_STORAGE_KEY_INVALID");
  }
  return value as AuthStorageKey;
}

// Browser builds keep the operator session across tab and browser restarts,
// matching Better Auth's own cross-domain default (localStorage). Electron
// never reaches this path: it stores the session in OS-encrypted safeStorage.
function browserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
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
      enqueueWrite(() => bridge.setItem(key, value));
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
      enqueueWrite(() => bridge.removeItem(key));
    } else {
      browserStorage()?.removeItem(key);
    }
  },
};

export async function flushControlAuthStorage(): Promise<void> {
  await writeQueue;
  const errors = writeErrors;
  writeErrors = [];
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Authentication storage writes failed");
}
