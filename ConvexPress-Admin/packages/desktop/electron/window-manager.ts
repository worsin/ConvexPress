import path from "node:path";
import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import {
  isDevAppRendererSender,
  isAppRendererSender,
  isExactWizardSender,
} from "./ipc/setupSender.js";
import { addHashRouteToUrl, normalizeInitialRoute } from "./launchRoute.js";
import { isQuitting } from "./utils/app-state.js";
import { isDev } from "./utils/platform.js";

const { app, BrowserWindow, shell } = require("electron") as typeof import("electron");

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getIconPath(): string {
  return path.join(__dirname, "../resources/icon.png");
}

/**
 * Resolve the path to the renderer's index.html.
 * In dev mode: Vite dev server URL (http://localhost:4105 by default).
 * In packaged mode: load from the bundled web app dist.
 */
function getRendererIndexPath(): string {
  // In production, the web app is bundled at ../../apps/web/dist/index.html
  // relative to dist-electron/
  return path.join(__dirname, "..", "dist", "index.html");
}

function openExternal(url: string): void {
  void shell.openExternal(url);
}

class WindowManager {
  private mainWindow: ElectronBrowserWindow | null = null;
  private wizardWindow: ElectronBrowserWindow | null = null;

  createMainWindow(options: { initialRoute?: string } = {}): ElectronBrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      return this.mainWindow;
    }

    const win = new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 1024,
      minHeight: 768,
      frame: false,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 12 },
      icon: getIconPath(),
      show: false,
      // Hardcoded dark background prevents a white flash before CSS loads
      // in dark theme. Electron shows this color immediately while the
      // renderer process initialises, so it must match the app's dark
      // background to avoid a jarring flash.
      backgroundColor: "#0a0a0a",
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const rendererIndexPath = getRendererIndexPath();

    if (isDev()) {
      win.loadURL(
        addHashRouteToUrl(
          process.env.CONVEXPRESS_DESKTOP_DEV_URL ?? "http://localhost:4105",
          options.initialRoute,
        ),
      );
    } else {
      console.log(`[WindowManager] Renderer path: ${rendererIndexPath}`);
      const initialRoute = normalizeInitialRoute(options.initialRoute);
      if (initialRoute) {
        win.loadFile(rendererIndexPath, { hash: initialRoute });
      } else {
        win.loadFile(rendererIndexPath);
      }
    }

    win.once("ready-to-show", () => {
      win.show();
    });

    // Log renderer console output to main process stdout
    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      const prefix = ["LOG", "WARN", "ERROR"][level] || "LOG";
      console.log(`[Renderer ${prefix}] ${message} (${sourceId}:${line})`);
    });

    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[Renderer LOAD FAIL] ${errorCode}: ${errorDescription} URL: ${validatedURL}`,
      );
    });

    win.webContents.on("render-process-gone", (_event, details) => {
      console.error("[Renderer CRASHED]", details);
    });

    // Open `target="_blank"` and window.open() in the user's default browser
    // instead of letting them hijack the admin window. Without this, clicking
    // a link or image URL navigates the entire app away with no way back.
    win.webContents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: "deny" };
    });

    // Block in-window navigation away from the exact app renderer.
    // External URLs go to the system browser so the preload bridge never
    // becomes available to provider dashboards or arbitrary local pages.
    win.webContents.on("will-navigate", (event, url) => {
      const isInternal = isDev()
        ? isDevAppRendererSender(url)
        : isAppRendererSender(url, { rendererIndexPath });
      if (!isInternal) {
        event.preventDefault();
        openExternal(url);
      }
    });

    // Forward maximize/unmaximize state to the renderer
    win.on("maximize", () => {
      win.webContents.send("window:maximized", true);
    });
    win.on("unmaximize", () => {
      win.webContents.send("window:maximized", false);
    });

    // Hide instead of close (keep alive via tray) unless quitting
    win.on("close", (e) => {
      if (!isQuitting()) {
        e.preventDefault();
        win.hide();
      }
    });

    win.on("closed", () => {
      this.mainWindow = null;
    });

    this.mainWindow = win;
    return win;
  }

  createWizardWindow(): ElectronBrowserWindow {
    if (this.wizardWindow && !this.wizardWindow.isDestroyed()) {
      this.wizardWindow.show();
      return this.wizardWindow;
    }

    const win = new BrowserWindow({
      width: 620,
      height: 720,
      frame: false,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 12 },
      resizable: false,
      center: true,
      icon: getIconPath(),
      show: false,
      // Hardcoded dark background prevents a white flash before CSS loads
      // in dark theme. See createMainWindow for the same rationale.
      backgroundColor: "#0a0a0a",
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const wizardIndexPath = path.join(__dirname, "wizard", "index.html");

    win.loadFile(wizardIndexPath);

    win.once("ready-to-show", () => {
      win.show();
    });

    win.on("closed", () => {
      this.wizardWindow = null;
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: "deny" };
    });

    win.webContents.on("will-navigate", (event, url) => {
      if (isExactWizardSender(url, wizardIndexPath)) return;
      event.preventDefault();
      openExternal(url);
    });

    this.wizardWindow = win;
    return win;
  }

  getMainWindow(): ElectronBrowserWindow | null {
    return this.mainWindow;
  }

  getWizardWindow(): ElectronBrowserWindow | null {
    return this.wizardWindow;
  }

  destroyWizard(): void {
    if (this.wizardWindow && !this.wizardWindow.isDestroyed()) {
      this.wizardWindow.destroy();
    }
    this.wizardWindow = null;
  }
}

export const windowManager = new WindowManager();

// Re-export individual functions for convenience
export function createMainWindow(options: { initialRoute?: string } = {}): ElectronBrowserWindow {
  return windowManager.createMainWindow(options);
}

export function createWizardWindow(): ElectronBrowserWindow {
  return windowManager.createWizardWindow();
}

export function getMainWindow(): ElectronBrowserWindow | null {
  return windowManager.getMainWindow();
}

export function getWizardWindow(): ElectronBrowserWindow | null {
  return windowManager.getWizardWindow();
}
