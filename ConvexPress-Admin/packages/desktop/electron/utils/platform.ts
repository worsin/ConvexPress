/**
 * Platform detection and OS-specific helpers.
 */

const { app } = require("electron") as typeof import("electron");

/**
 * Returns true when running in development.
 *
 * macOS dev bundles can look packaged to Electron when the executable is
 * renamed for Dock identity testing, so the dev launcher also sets an explicit
 * marker. Security-sensitive startup gates must use this helper instead of
 * app.isPackaged directly.
 */
export function isDev(): boolean {
  return !app.isPackaged || process.env.CONVEXPRESS_DESKTOP_DEV === "1";
}

/**
 * Returns the current platform identifier.
 */
export function getPlatformId(): "mac" | "win" | "linux" {
  switch (process.platform) {
    case "darwin":
      return "mac";
    case "win32":
      return "win";
    default:
      return "linux";
  }
}
