/**
 * The document an agreement field names (`settings.document`), read in a
 * dialog without leaving the form (FormDocument.tsx).
 */
export type FormDocument = { page: string; label: string };

/** The document a field's settings name, or null: a site page path and the name to show. */
export function formDocument(settings: unknown): FormDocument | null {
  if (!settings || typeof settings !== "object") return null;
  const value: unknown = Reflect.get(settings, "document");
  if (!value || typeof value !== "object") return null;
  const page: unknown = Reflect.get(value, "page");
  const label: unknown = Reflect.get(value, "label");
  if (typeof page !== "string" || typeof label !== "string") return null;
  const path = page.trim();
  const name = label.trim();
  // A page on this site: one leading slash, no scheme or protocol-relative host.
  if (!/^\/(?!\/)[^\s]*$/.test(path) || name === "") return null;
  return { page: path, label: name };
}

/** Where the page is on the site: CMS pages live under /page. */
export function documentHref(page: string): string {
  return `/page${page === "/" ? "" : page}`;
}
