/**
 * Security IPC: lets the renderer widen the Content-Security-Policy to the
 * site deployments the control plane assigns it. Only the app renderer may
 * call it, and only exact http(s) origins are accepted.
 */
import {
  listRegisteredDeploymentOrigins,
  registerDeploymentOrigins,
} from "../deploymentOrigins.js";
import { isDev } from "../utils/platform.js";
import path from "node:path";
import { isAppRendererSender, isDevAppRendererSender } from "./setupSender.js";

const { ipcMain } = require("electron") as typeof import("electron");

function assertSender(event: Electron.IpcMainInvokeEvent): void {
  const senderUrl = event.sender.getURL();
  const ok = isDev()
    ? isDevAppRendererSender(senderUrl)
    : isAppRendererSender(senderUrl, {
        rendererIndexPath: path.join(__dirname, "..", "dist", "index.html"),
      });
  if (!ok) throw new Error("Deployment origins can only be registered from the ConvexPress app.");
}

export function registerSecurityHandlers(): void {
  ipcMain.handle("security:register-deployment-origins", (event, origins: unknown) => {
    assertSender(event);
    return registerDeploymentOrigins(origins);
  });
  ipcMain.handle("security:list-deployment-origins", (event) => {
    assertSender(event);
    return listRegisteredDeploymentOrigins();
  });
}

export function unregisterSecurityHandlers(): void {
  ipcMain.removeHandler("security:register-deployment-origins");
  ipcMain.removeHandler("security:list-deployment-origins");
}
