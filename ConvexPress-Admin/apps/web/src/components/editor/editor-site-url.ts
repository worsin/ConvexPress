/** Keep permalink previews bound to the selected environment, including when
 * its content/settings originated from a production snapshot. */
export function normalizeEditorSiteUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
export function resolveEditorSiteUrl(
  selectedSiteOrigin: unknown,
  settingsDocument: unknown,
): string | undefined {
  // A selected but invalid target must never silently link to another site.
  if (selectedSiteOrigin !== undefined && selectedSiteOrigin !== null)
    return normalizeEditorSiteUrl(selectedSiteOrigin);
  const values =
    settingsDocument && typeof settingsDocument === "object" && "values" in settingsDocument
      ? settingsDocument.values
      : null;
  if (!values || typeof values !== "object") return undefined;
  return (
    normalizeEditorSiteUrl("homeUrl" in values ? values.homeUrl : undefined) ??
    normalizeEditorSiteUrl("siteUrl" in values ? values.siteUrl : undefined)
  );
}

/** Resolve published content on its Website, never on the desktop renderer. */
export function editorContentUrl(
  siteOrigin: string | undefined,
  content: { type: "post" | "page"; slug: string; path?: string },
): string | undefined {
  const origin = normalizeEditorSiteUrl(siteOrigin);
  if (!origin) return undefined;
  const path = content.type === "page" && content.path
    ? content.path
    : `${content.type === "post" ? "/blog/" : "/"}${encodeURIComponent(content.slug)}`;
  if (!path.startsWith("/") || path.startsWith("//") || /[\\?#\u0000-\u0020]/.test(path))
    return undefined;
  const url = new URL(path, origin);
  return url.origin === origin ? url.href : undefined;
}
