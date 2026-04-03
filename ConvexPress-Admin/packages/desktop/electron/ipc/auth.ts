import { ipcMain } from "electron";
import Store from "electron-store";

const authStore = new Store({
  name: "convexpress-auth",
  encryptionKey: "convexpress-auth-v1",
});

const ALLOWED_PREFIXES = ["__convexAuth", "convexAuth"];

function isAllowedKey(key: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function registerAuthHandlers(): void {
  ipcMain.handle("auth:get", (_event, key: string) => {
    if (!isAllowedKey(key)) {
      console.log(`[Auth IPC] get BLOCKED key: ${key}`);
      return null;
    }
    const val = authStore.get(key, null);
    console.log(
      `[Auth IPC] get "${key}" -> ${val ? "has value (" + String(val).length + " chars)" : "null"}`,
    );
    return val;
  });

  ipcMain.handle("auth:set", (_event, key: string, value: string) => {
    if (!isAllowedKey(key)) {
      console.log(`[Auth IPC] set BLOCKED key: ${key}`);
      return;
    }
    console.log(
      `[Auth IPC] set "${key}" -> ${value ? value.length + " chars" : "null"}`,
    );
    authStore.set(key, value);
  });

  ipcMain.handle("auth:remove", (_event, key: string) => {
    if (!isAllowedKey(key)) {
      console.log(`[Auth IPC] remove BLOCKED key: ${key}`);
      return;
    }
    console.log(`[Auth IPC] remove "${key}"`);
    authStore.delete(key);
  });
}

export function unregisterAuthHandlers(): void {
  ipcMain.removeHandler("auth:get");
  ipcMain.removeHandler("auth:set");
  ipcMain.removeHandler("auth:remove");
}
