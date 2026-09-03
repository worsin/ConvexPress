import path from "node:path";
import { JsonStore } from "../utils/json-store.js";
import { isDev } from "../utils/platform.js";
import {
  isAppRendererSender,
  isDevAppRendererSender,
} from "./setupSender.js";

const { ipcMain, safeStorage } = require("electron") as typeof import("electron");

const authStore = new JsonStore({
  name: "convexpress-auth",
});

const ALLOWED_PREFIXES = ["__convexAuth", "convexAuth"];
const ALLOWED_EXACT_KEYS = new Set([
  "better-auth_cookie",
  "better-auth_session_data",
]);
const ENCRYPTED_VALUE_PREFIX = "safe-storage:v1:";
const MAX_AUTH_VALUE_BYTES = 512 * 1024;

function isAllowedKey(key: string): boolean {
  return (
    ALLOWED_EXACT_KEYS.has(key) ||
    ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function encryptAuthValue(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Protected authentication storage is unavailable.");
  }
  return `${ENCRYPTED_VALUE_PREFIX}${safeStorage
    .encryptString(value)
    .toString("base64")}`;
}

function decryptAuthValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith(ENCRYPTED_VALUE_PREFIX)) return value;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Protected authentication storage is unavailable.");
  }
  return safeStorage.decryptString(
    Buffer.from(value.slice(ENCRYPTED_VALUE_PREFIX.length), "base64"),
  );
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
    const stored = authStore.get(key);
    const val = decryptAuthValue(stored);
    if (
      val !== null &&
      typeof stored === "string" &&
      !stored.startsWith(ENCRYPTED_VALUE_PREFIX) &&
      safeStorage.isEncryptionAvailable()
    ) {
      authStore.set(key, encryptAuthValue(val));
    }
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
    if (Buffer.byteLength(value, "utf8") > MAX_AUTH_VALUE_BYTES) {
      throw new Error("Authentication storage value is too large.");
    }
    console.log(
      `[Auth IPC] set "${key}" -> ${value ? value.length + " chars" : "null"}`,
    );
    authStore.set(key, encryptAuthValue(value));
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
