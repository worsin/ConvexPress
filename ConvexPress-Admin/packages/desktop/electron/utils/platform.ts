/**
 * Platform detection and OS-specific helpers.
 */

import { app } from "electron";

/**
 * Returns true when running in development (not packaged).
 */
export function isDev(): boolean {
  return !app.isPackaged;
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
