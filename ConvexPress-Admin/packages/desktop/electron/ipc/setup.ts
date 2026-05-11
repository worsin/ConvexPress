import { configStore } from "./config.js";

const { ipcMain } = require("electron") as typeof import("electron");

interface SetupConfig {
  mode: "server" | "client";
  convexUrl: string;
  adminKey?: string;
  siteName?: string;
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
}

export function registerSetupHandlers(): void {
  // Channel: "setup:complete" -- called by the wizard via preload's
  // convexpressSetup.saveConfig(). Saves config and marks setup as done.
  ipcMain.handle(
    "setup:complete",
    (_event, config: SetupConfig): { success: boolean; error?: string } => {
      try {
        configStore.set("mode", config.mode);
        configStore.set("convexUrl", config.convexUrl);

        if (config.adminKey) {
          configStore.set("adminKey", config.adminKey);
        }
        if (config.siteName) {
          configStore.set("siteName", config.siteName);
        }

        if (config.adminName || config.adminEmail || config.adminPassword) {
          configStore.set("pendingAdminCredentials", {
            displayName: config.adminName,
            email: config.adminEmail,
            password: config.adminPassword,
          });
        }

        configStore.set("setupComplete", true);
        console.log(
          `[Setup IPC] Config saved: mode=${config.mode}, url=${config.convexUrl}`,
        );
        return { success: true };
      } catch (error) {
        console.error("[Setup IPC] Failed to save config:", error);
        return { success: false, error: String(error) };
      }
    },
  );
}

export function unregisterSetupHandlers(): void {
  ipcMain.removeHandler("setup:complete");
}
