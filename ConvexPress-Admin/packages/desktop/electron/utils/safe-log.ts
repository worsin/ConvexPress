import type { BrowserWindow } from "electron";

/**
 * Safe console.log wrapper that catches EPIPE errors
 * (common when Electron's stdout pipe closes unexpectedly).
 */
export function safeLog(...args: unknown[]): void {
  try {
    console.log(...args);
  } catch {
    // Ignore EPIPE errors
  }
}

/**
 * Safe console.error wrapper that catches EPIPE errors.
 */
export function safeError(...args: unknown[]): void {
  try {
    console.error(...args);
  } catch {
    // Ignore EPIPE errors
  }
}

/**
 * Safely send an IPC message to a BrowserWindow.
 * Silently fails if the window is null, destroyed, or the webContents are gone.
 */
export function safeSend(
  win: BrowserWindow | null,
  channel: string,
  ...data: unknown[]
): void {
  try {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, ...data);
    }
  } catch {
    // Ignore send failures
  }
}
