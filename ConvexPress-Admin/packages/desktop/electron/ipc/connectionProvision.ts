import path from "node:path";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { JsonStore } from "../utils/json-store.js";
import { isDev } from "../utils/platform.js";
import {
  validateConnectionProvisionRequest,
  validateDeploymentAdminKey,
} from "./connectionProvisionValidation.js";
import { isAppRendererSender } from "./setupSender.js";

const { BrowserWindow, ipcMain } = require("electron") as typeof import("electron");

const configStore = new JsonStore({ name: "convexpress-config" });
const createConnection = makeFunctionReference<"action">(
  "connections/actions:create",
);

type CredentialPrompt = {
  webContentsId: number;
  finish: (value: string | null) => void;
};

let activePrompt: CredentialPrompt | null = null;

function getRendererIndexPath(): string {
  return path.join(__dirname, "..", "dist", "index.html");
}

function getCredentialPromptPath(): string {
  return path.join(__dirname, "credential", "index.html");
}

function getCredentialPreloadPath(): string {
  return path.join(__dirname, "credential", "preload.js");
}

function isTrustedAppSender(senderUrl: string): boolean {
  return isAppRendererSender(senderUrl, {
    development: isDev(),
    ...(isDev()
      ? { devRendererUrl: process.env.CONVEXPRESS_DESKTOP_DEV_URL }
      : { rendererIndexPath: getRendererIndexPath() }),
  });
}

export async function requestDeploymentCredential(
  owner: import("electron").BrowserWindow | null,
): Promise<string | null> {
  if (activePrompt) {
    throw new Error("A secure deployment credential prompt is already open.");
  }
  const prompt = new BrowserWindow({
    width: 520,
    height: 390,
    minWidth: 460,
    minHeight: 350,
    show: false,
    modal: owner !== null,
    parent: owner ?? undefined,
    title: "Connect ConvexPress deployment",
    backgroundColor: "#101827",
    autoHideMenuBar: true,
    webPreferences: {
      preload: getCredentialPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      spellcheck: false,
    },
  });
  prompt.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  prompt.webContents.on("will-navigate", (event) => event.preventDefault());

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (activePrompt?.webContentsId === prompt.webContents.id) {
        activePrompt = null;
      }
      resolve(value);
      if (!prompt.isDestroyed()) prompt.close();
    };
    activePrompt = { webContentsId: prompt.webContents.id, finish };
    prompt.once("ready-to-show", () => {
      prompt.show();
      prompt.focus();
    });
    prompt.once("closed", () => finish(null));
    void prompt.loadFile(getCredentialPromptPath()).catch(() => finish(null));
  });
}

function submitCredential(event: Electron.IpcMainEvent, value: unknown): void {
  if (!activePrompt || event.sender.id !== activePrompt.webContentsId) return;
  try {
    activePrompt.finish(validateDeploymentAdminKey(value));
  } catch {
    event.sender.send(
      "connection-credential:error",
      "Enter the complete Convex deployment admin key.",
    );
  }
}

function cancelCredential(event: Electron.IpcMainEvent): void {
  if (!activePrompt || event.sender.id !== activePrompt.webContentsId) return;
  activePrompt.finish(null);
}

export function registerConnectionProvisionHandlers(): void {
  ipcMain.on("connection-credential:submit", submitCredential);
  ipcMain.on("connection-credential:cancel", cancelCredential);
  ipcMain.handle("connections:provision", async (event, rawInput: unknown) => {
    if (!isTrustedAppSender(event.sender.getURL())) {
      throw new Error("Connections can only be provisioned from ConvexPress.");
    }
    const input = validateConnectionProvisionRequest(rawInput);
    const controlPlaneUrl = configStore.get("convexUrl");
    if (typeof controlPlaneUrl !== "string" || !controlPlaneUrl.trim()) {
      throw new Error("The ConvexPress control plane is not configured.");
    }
    const owner = BrowserWindow.fromWebContents(event.sender);
    let deploymentAdminKey: string | null = await requestDeploymentCredential(owner);
    if (!deploymentAdminKey) return { cancelled: true as const };

    try {
      const client = new ConvexHttpClient(controlPlaneUrl.trim());
      client.setAuth(input.authToken);
      const result = (await client.action(createConnection, {
        instanceId: input.instanceId,
        name: input.name,
        ...(input.accountLabel ? { accountLabel: input.accountLabel } : {}),
        deploymentAdminKey,
      })) as {
        connectionId: string;
        status: string;
        credentialVersion: number | null;
      };
      return {
        cancelled: false as const,
        connectionId: result.connectionId,
        status: result.status,
        credentialVersion: result.credentialVersion,
      };
    } catch {
      throw new Error("Connection could not be created or verified.");
    } finally {
      deploymentAdminKey = null;
    }
  });
}

export function unregisterConnectionProvisionHandlers(): void {
  ipcMain.removeListener("connection-credential:submit", submitCredential);
  ipcMain.removeListener("connection-credential:cancel", cancelCredential);
  ipcMain.removeHandler("connections:provision");
  activePrompt?.finish(null);
  activePrompt = null;
}
