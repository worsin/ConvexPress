/**
 * Shared application state flags.
 * Avoids monkey-patching the Electron `app` object with `as any`.
 */

let quitting = false;

export function setQuitting(value: boolean): void {
  quitting = value;
}

export function isQuitting(): boolean {
  return quitting;
}
