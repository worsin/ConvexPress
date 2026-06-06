import { JsonStore } from "../utils/json-store.js";
import { normalizeConvexCloudUrl } from "./setupValidation.js";

const { ipcMain, net } = require("electron") as typeof import("electron");

const store = new JsonStore({ name: "convexpress-config" });
const READABLE_CONFIG_KEYS = new Set([
  "mode",
  "convexUrl",
  "convexSiteUrl",
  "siteName",
  "setupComplete",
  "pendingAdminCredentials",
  "pendingLoginCredentials",
]);
const WRITABLE_CONFIG_KEYS = new Set([
  "pendingAdminCredentials",
  "pendingLoginCredentials",
]);

function assertReadableConfigKey(key: string): void {
  if (!READABLE_CONFIG_KEYS.has(key)) {
    throw new Error(`Config key not allowed: ${key}`);
  }
}

function assertWritableConfigKey(key: string): void {
  if (!WRITABLE_CONFIG_KEYS.has(key)) {
    throw new Error(`Config key is read-only: ${key}`);
  }
}

export function registerConfigHandlers(): void {
  ipcMain.handle("config:get", (_event, key: string) => {
    assertReadableConfigKey(key);
    return store.get(key);
  });

  ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
    assertWritableConfigKey(key);
    store.set(key, value);
  });

  ipcMain.handle("config:test-connection", async (_event, url: string) => {
    let cleanUrl: string;
    try {
      cleanUrl = normalizeConvexCloudUrl(url);
    } catch (error) {
      return {
        ok: false,
        status: 400,
        error: error instanceof Error ? error.message : "Invalid Convex URL.",
      };
    }

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
