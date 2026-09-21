import { registerWebsitePublishHandlers, unregisterWebsitePublishHandlers } from "./websitePublish.js";
import { registerWebsiteEditingHandlers, unregisterWebsiteEditingHandlers } from "./websiteEditing.js";
import { registerCloudflareOAuthHandlers, unregisterCloudflareOAuthHandlers } from "./cloudflareOAuth.js";
import { registerWindowHandlers, unregisterWindowHandlers } from "./window.js";
import { registerConfigHandlers, unregisterConfigHandlers } from "./config.js";
import { registerAuthHandlers, unregisterAuthHandlers } from "./auth.js";
import { registerSetupHandlers, unregisterSetupHandlers } from "./setup.js";
import { registerHandoffHandlers, unregisterHandoffHandlers } from "./handoff.js";
import {
  registerConnectionProvisionHandlers,
  unregisterConnectionProvisionHandlers,
} from "./connectionProvision.js";
import {
  registerAppUpdaterHandlers,
  unregisterAppUpdaterHandlers,
} from "./app-updater.js";
import {
  registerUpdaterHandlers,
  unregisterUpdaterHandlers,
} from "./updater.js";
import {
  registerSiteRunnerHandlers,
  unregisterSiteRunnerHandlers,
} from "./siteRunner.js";
import {
  registerSecurityHandlers,
  unregisterSecurityHandlers,
} from "./security.js";
import {
  registerSiteDeployHandlers,
  unregisterSiteDeployHandlers,
} from "./siteDeploy.js";

const { ipcMain, app } = require("electron") as typeof import("electron");

export function registerAllIpcHandlers(): void {
  registerWindowHandlers();
  registerConfigHandlers();
  registerAuthHandlers();
  registerSetupHandlers();
  registerHandoffHandlers();
  registerConnectionProvisionHandlers();
  registerAppUpdaterHandlers();
  registerUpdaterHandlers();
  registerSiteRunnerHandlers();
  registerSecurityHandlers();
  registerSiteDeployHandlers();
  registerWebsitePublishHandlers();
  registerWebsiteEditingHandlers();
  registerCloudflareOAuthHandlers();

  ipcMain.handle("app:get-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:get-platform", () => {
    return {
      os: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
    };
  });

  ipcMain.handle("app:quit", () => {
    app.quit();
  });
}

export function unregisterAllIpcHandlers(): void {
  unregisterWindowHandlers();
  unregisterConfigHandlers();
  unregisterAuthHandlers();
  unregisterSetupHandlers();
  unregisterHandoffHandlers();
  unregisterConnectionProvisionHandlers();
  unregisterAppUpdaterHandlers();
  unregisterUpdaterHandlers();
  unregisterSiteRunnerHandlers();
  unregisterSecurityHandlers();
  unregisterSiteDeployHandlers();
  unregisterWebsitePublishHandlers();
  unregisterWebsiteEditingHandlers();
  unregisterCloudflareOAuthHandlers();

  ipcMain.removeHandler("app:get-version");
  ipcMain.removeHandler("app:get-platform");
  ipcMain.removeHandler("app:quit");
}
