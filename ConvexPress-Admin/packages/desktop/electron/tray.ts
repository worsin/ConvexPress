import path from "node:path";
import { setQuitting } from "./utils/app-state.js";
import { isDev } from "./utils/platform.js";

const { app, Menu, nativeImage, Tray } = require("electron") as typeof import("electron");

let tray: Tray | null = null;

function loadTrayIcon(): Electron.NativeImage {
  const iconPath = isDev()
    ? path.join(__dirname, "../resources/iconTemplate.png")
    : path.join(process.resourcesPath, "iconTemplate.png");

  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(true);
  return image;
}

export function createTray(wm: {
  getMainWindow: () => Electron.BrowserWindow | null;
  createMainWindow: () => Electron.BrowserWindow;
}): void {
  if (tray) return; // Already created

  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("ConvexPress");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show ConvexPress",
      click: () => {
        const win = wm.getMainWindow();
        if (win) {
          win.show();
          win.focus();
        } else {
          wm.createMainWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        setQuitting(true);
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    const win = wm.getMainWindow();
    if (win) {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    } else {
      wm.createMainWindow();
    }
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
