import { app, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setQuitting } from "./utils/app-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

function loadTrayIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "iconTemplate.png")
    : path.join(__dirname, "../resources/iconTemplate.png");

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
