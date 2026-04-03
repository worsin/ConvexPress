import { ipcMain, net } from "electron";
import { configStore } from "./config.js";
import { windowManager } from "../window-manager.js";

interface SetupConfig {
  mode: "server" | "client";
  convexUrl: string;
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
}

export function registerSetupHandlers(): void {
  ipcMain.handle("setup:test-connection", async (_event, url: string) => {
    const cleanUrl = url.replace(/\/$/, "");
    try {
      const response = await net.fetch(
        `${cleanUrl}/.well-known/openid-configuration`,
      );
      return { ok: response.ok, status: response.status };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle("setup:save-config", (_event, config: SetupConfig) => {
    configStore.set("mode", config.mode);
    configStore.set("convexUrl", config.convexUrl);

    if (config.adminName || config.adminEmail || config.adminPassword) {
      configStore.set("pendingAdminCredentials", {
        name: config.adminName,
        email: config.adminEmail,
        password: config.adminPassword,
      });
    }

    configStore.set("setupComplete", true);
    console.log(
      `[Setup IPC] Config saved: mode=${config.mode}, url=${config.convexUrl}`,
    );
  });

  ipcMain.handle("setup:launch-app", () => {
    // Close the wizard and open the main window
    console.log("[Setup IPC] Launching main app from setup wizard");
    windowManager.destroyWizard();
    windowManager.createMainWindow();
  });
}

export function unregisterSetupHandlers(): void {
  ipcMain.removeHandler("setup:test-connection");
  ipcMain.removeHandler("setup:save-config");
  ipcMain.removeHandler("setup:launch-app");
}
