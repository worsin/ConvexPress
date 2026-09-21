import path from "node:path";
import { writeFile } from "node:fs/promises";

import { isDev } from "../utils/platform.js";
import { isAppRendererSender } from "./setupSender.js";
import { prepareHandoffSaveRequest } from "./handoffValidation.js";

const { BrowserWindow, dialog, ipcMain } = require("electron") as typeof import("electron");

function getRendererIndexPath(): string {
  return path.join(__dirname, "..", "dist", "index.html");
}

function isTrustedAppSender(senderUrl: string): boolean {
  return isAppRendererSender(senderUrl, {
    development: isDev(),
    ...(isDev()
      ? { devRendererUrl: process.env.CONVEXPRESS_DESKTOP_DEV_URL }
      : { rendererIndexPath: getRendererIndexPath() }),
  });
}

export function registerHandoffHandlers(): void {
  ipcMain.handle(
    "handoff:save-package",
    async (
      event,
      input: { suggestedFilename: string; packageJson: string },
    ) => {
      if (!isTrustedAppSender(event.sender.getURL())) {
        throw new Error("Handoff packages can only be saved from ConvexPress.");
      }
      const request = prepareHandoffSaveRequest(input);
      const owner = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: "Save ConvexPress handoff package",
        defaultPath: request.suggestedFilename,
        buttonLabel: "Save handoff",
        filters: [{ name: "ConvexPress handoff", extensions: ["json"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"] as (
          | "createDirectory"
          | "showOverwriteConfirmation"
        )[],
      };
      const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) {
        return { saved: false as const, filePath: null };
      }
      await writeFile(result.filePath, `${request.packageJson}\n`, "utf8");
      return { saved: true as const, filePath: result.filePath };
    },
  );
}

export function unregisterHandoffHandlers(): void {
  ipcMain.removeHandler("handoff:save-package");
}
