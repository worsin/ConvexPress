// scripts/patch-electron-mac.js
// Renames Electron.app to ConvexPress.app so the dock tooltip shows the correct name in dev mode.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

if (process.platform !== "darwin") process.exit(0);

const APP_NAME = "ConvexPress";

const electronDist = path.join(__dirname, "..", "..", "..", "node_modules", "electron", "dist");
const oldApp = path.join(electronDist, "Electron.app");
const newApp = path.join(electronDist, `${APP_NAME}.app`);
const pathFile = path.join(__dirname, "..", "..", "..", "node_modules", "electron", "path.txt");

if (fs.existsSync(oldApp)) {
  fs.renameSync(oldApp, newApp);
}

// CRITICAL: No trailing newline in path.txt
if (fs.existsSync(pathFile)) {
  fs.writeFileSync(pathFile, `${APP_NAME}.app/Contents/MacOS/Electron`, { encoding: "utf-8" });
}

const plist = path.join(newApp, "Contents", "Info.plist");
if (fs.existsSync(plist)) {
  try { execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName '${APP_NAME}'" "${plist}"`); } catch {}
  try { execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName '${APP_NAME}'" "${plist}"`); } catch {
    try { execSync(`/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string '${APP_NAME}'" "${plist}"`); } catch {}
  }
}

console.log(`[postinstall] Electron.app renamed to ${APP_NAME}.app`);
