import path from "node:path";
import { JsonStore } from "../utils/json-store.js";
import { isDev } from "../utils/platform.js";
import {
  assertReadableConfigKey,
  assertRendererConfigClear,
} from "./configValidation.js";
import {
  isDevAppRendererSender,
  isAppRendererSender,
  isExactWizardSender,
  isTrustedDesktopSender,
} from "./setupSender.js";
import { normalizeConvexCloudUrl } from "./setupValidation.js";

const { ipcMain, net } = require("electron") as typeof import("electron");

const store = new JsonStore({ name: "convexpress-config" });

function getRendererIndexPath(): string {
  return path.join(__dirname, "..", "dist", "index.html");
}

function getWizardIndexPath(): string {
  return path.join(__dirname, "wizard", "index.html");
}

function isConfigAppSender(senderUrl: string): boolean {
  return isDev()
    ? isDevAppRendererSender(senderUrl)
    : isAppRendererSender(senderUrl, {
        rendererIndexPath: getRendererIndexPath(),
      });
}

function isConfigDesktopSender(senderUrl: string): boolean {
  return isDev()
    ? isDevAppRendererSender(senderUrl) ||
        isExactWizardSender(senderUrl, getWizardIndexPath())
    : isTrustedDesktopSender(senderUrl, {
        rendererIndexPath: getRendererIndexPath(),
        wizardIndexPath: getWizardIndexPath(),
      });
}

export function registerConfigHandlers(): void {
  ipcMain.handle("config:get", (event, key: string) => {
    if (!isConfigAppSender(event.sender.getURL())) {
      throw new Error("Config can only be read from the ConvexPress app.");
    }
    assertReadableConfigKey(key);
    return store.get(key);
  });

  ipcMain.handle("config:set", (event, key: string, value: unknown) => {
    if (!isConfigAppSender(event.sender.getURL())) {
      throw new Error("Config can only be changed from the ConvexPress app.");
    }
    assertRendererConfigClear(key, value);
    store.delete(key);
  });

  ipcMain.handle("config:test-connection", async (event, url: string) => {
    if (!isConfigDesktopSender(event.sender.getURL())) {
      throw new Error(
        "Connection tests can only run from ConvexPress desktop windows.",
      );
    }

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
