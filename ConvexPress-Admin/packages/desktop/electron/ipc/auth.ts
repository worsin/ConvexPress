import path from "node:path";
import { JsonStore } from "../utils/json-store.js";
import { isDev } from "../utils/platform.js";
import {
  isAppRendererSender,
  isDevAppRendererSender,
} from "./setupSender.js";

const { ipcMain } = require("electron") as typeof import("electron");

const authStore = new JsonStore({
  name: "convexpress-auth",
});

const ALLOWED_PREFIXES = ["__convexAuth", "convexAuth"];

function isAllowedKey(key: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function getRendererIndexPath(): string {
  return path.join(__dirname, "..", "dist", "index.html");
}

function isAuthAppSender(senderUrl: string): boolean {
  return isDev()
    ? isDevAppRendererSender(senderUrl)
    : isAppRendererSender(senderUrl, {
        rendererIndexPath: getRendererIndexPath(),
      });
}

export function registerAuthHandlers(): void {
  ipcMain.handle("auth:get", (event, key: string) => {
    if (!isAuthAppSender(event.sender.getURL())) {
      throw new Error("Auth storage can only be read from the ConvexPress app.");
    }
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

  ipcMain.handle("auth:set", (event, key: string, value: string) => {
    if (!isAuthAppSender(event.sender.getURL())) {
      throw new Error("Auth storage can only be changed from the ConvexPress app.");
    }
    if (!isAllowedKey(key)) {
      console.log(`[Auth IPC] set BLOCKED key: ${key}`);
      return;
    }
    if (typeof value !== "string") {
      console.log(`[Auth IPC] set BLOCKED non-string value for key: ${key}`);
      return;
    }
    console.log(
      `[Auth IPC] set "${key}" -> ${value ? value.length + " chars" : "null"}`,
    );
    authStore.set(key, value);
  });

  ipcMain.handle("auth:remove", (event, key: string) => {
    if (!isAuthAppSender(event.sender.getURL())) {
      throw new Error("Auth storage can only be changed from the ConvexPress app.");
    }
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
