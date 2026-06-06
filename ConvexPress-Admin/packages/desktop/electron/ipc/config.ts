import { JsonStore } from "../utils/json-store.js";
import {
  assertReadableConfigKey,
  assertRendererConfigClear,
} from "./configValidation.js";
import { normalizeConvexCloudUrl } from "./setupValidation.js";

const { ipcMain, net } = require("electron") as typeof import("electron");

const store = new JsonStore({ name: "convexpress-config" });

export function registerConfigHandlers(): void {
  ipcMain.handle("config:get", (_event, key: string) => {
    assertReadableConfigKey(key);
    return store.get(key);
  });

  ipcMain.handle("config:set", (_event, key: string, value: unknown) => {
    assertRendererConfigClear(key, value);
    store.delete(key);
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
