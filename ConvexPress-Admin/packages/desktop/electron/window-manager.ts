import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isQuitting } from "./utils/app-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getPreloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function getIconPath(): string {
  return path.join(__dirname, "../resources/icon.png");
}

/**
 * Resolve the path to the renderer's index.html.
 * In dev mode: Vite dev server URL (http://localhost:5173).
 * In packaged mode: load from the bundled web app dist.
 */
function getRendererIndexPath(): string {
  // In production, the web app is bundled at ../../apps/web/dist/index.html
  // relative to dist-electron/
  return path.join(__dirname, "..", "dist", "index.html");
}

class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private wizardWindow: BrowserWindow | null = null;

  createMainWindow(): BrowserWindow {
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

    if (!app.isPackaged) {
      win.loadURL("http://localhost:4105");
    } else {
      const indexPath = getRendererIndexPath();
      console.log(`[WindowManager] Renderer path: ${indexPath}`);
      win.loadFile(indexPath);
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

  createWizardWindow(): BrowserWindow {
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

    win.loadFile(path.join(__dirname, "wizard", "index.html"));

    win.once("ready-to-show", () => {
      win.show();
    });

    win.on("closed", () => {
      this.wizardWindow = null;
    });

    this.wizardWindow = win;
    return win;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  getWizardWindow(): BrowserWindow | null {
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
export function createMainWindow(): BrowserWindow {
  return windowManager.createMainWindow();
}

export function createWizardWindow(): BrowserWindow {
  return windowManager.createWizardWindow();
}

export function getMainWindow(): BrowserWindow | null {
  return windowManager.getMainWindow();
}

export function getWizardWindow(): BrowserWindow | null {
  return windowManager.getWizardWindow();
}
