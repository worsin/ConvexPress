import { JsonStore } from "../utils/json-store.js";

const { ipcMain, net } = require("electron") as typeof import("electron");

const store = new JsonStore({ name: "convexpress-config" });
const ALLOWED_CONFIG_KEYS = new Set([
  "mode",
  "convexUrl",
  "convexSiteUrl",
  "siteName",
  "setupComplete",
  "pendingAdminCredentials",
  "pendingLoginCredentials",
]);

function assertAllowedConfigKey(key: string): void {
  if (!ALLOWED_CONFIG_KEYS.has(key)) {
    throw new Error(`Config key not allowed: ${key}`);
  }
}

export function registerConfigHandlers(): void {
  ipcMain.handle("config:get", (_event, key: string) => {
    assertAllowedConfigKey(key);
    return store.get(key);
  });

  ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
    assertAllowedConfigKey(key);
    store.set(key, value);
  });

  ipcMain.handle("config:test-connection", async (_event, url: string) => {
    const cleanUrl = url.replace(/\/$/, "");

    // Try the Convex well-known endpoint first, then fall back to /version
    const endpoints = [
      `${cleanUrl}/.well-known/openid-configuration`,
      `${cleanUrl}/version`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await net.fetch(endpoint);
        if (response.ok) {
          return { ok: true, status: response.status };
        }
      } catch {
        // Try next endpoint
      }
    }

    // All endpoints failed
    try {
      const response = await net.fetch(endpoints[0]);
      return { ok: response.ok, status: response.status };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
}

export function unregisterConfigHandlers(): void {
  ipcMain.removeHandler("config:get");
  ipcMain.removeHandler("config:set");
  ipcMain.removeHandler("config:test-connection");
}

export { store as configStore };
