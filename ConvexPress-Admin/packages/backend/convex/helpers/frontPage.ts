/**
 * The page Settings › Reading shows on the front page ("Your homepage
 * displays: a static page"), from the reading settings' values, with the
 * keys older data used. Null when the front page shows the latest posts.
 */
export function staticFrontPageId(values: unknown): string | null {
  if (!values || typeof values !== "object") return null;
  const reading = values as {
    homepageDisplays?: unknown;
    homepageId?: unknown;
    // Legacy keys, kept for older data.
    showOnFront?: unknown;
    pageOnFront?: unknown;
  };
  const id = (value: unknown) => (typeof value === "string" && value ? value : null);
  return (
    (reading.homepageDisplays === "static_page" ? id(reading.homepageId) : null) ??
    (reading.showOnFront === "page" ? id(reading.pageOnFront) : null)
  );
}
