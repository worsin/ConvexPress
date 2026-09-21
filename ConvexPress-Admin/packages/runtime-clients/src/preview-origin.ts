/** Public runtime configuration, never an origin supplied by page content. */
export const PACKAGED_EDITOR_ORIGIN = "convexpress-app://shell";

export function validateEditorOrigin(value: string): string {
  if (value === PACKAGED_EDITOR_ORIGIN) return value;
  if (!value || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value))
    throw Error("Invalid authorized editor origin");
  let url: URL;
  try { url = new URL(value); } catch { throw Error("Invalid authorized editor origin"); }
  if (url.origin !== value || url.username || url.password ||
      !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))
    throw Error("Invalid authorized editor origin");
  return value;
}
