import type { BrowserWindow } from "electron";

// A launcher or terminal can disappear while Electron continues running. Pipe
// failures arrive as asynchronous stream events, outside console's try/catch.
// Never report a failed output stream through the uncaught-exception logger:
// that would write to the same pipe indefinitely and starve the native UI.
const failedOutputs = new WeakSet<NodeJS.WriteStream>();
for (const output of [process.stdout, process.stderr]) {
  output.on("error", () => { failedOutputs.add(output); });
  output.on("close", () => { failedOutputs.add(output); });
}
function available(output: NodeJS.WriteStream): boolean {
  return !failedOutputs.has(output) && !output.destroyed && output.writable;
}

/**
 * Safe console.log wrapper that catches EPIPE errors
 * (common when Electron's stdout pipe closes unexpectedly).
 */
export function safeLog(...args: unknown[]): void {
  if (!available(process.stdout)) return;
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
  if (!available(process.stderr)) return;
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
