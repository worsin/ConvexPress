/**
 * SEO JSON-LD - Helper for building Schema.org structured data.
 *
 * Wraps the @graph array from the backend buildJsonLd() into the
 * full JSON-LD object with @context. Also provides helpers for
 * serializing JSON-LD to a safe script tag string.
 *
 * Usage:
 *   const jsonLd = wrapJsonLdGraph(graph);
 *   // { "@context": "https://schema.org", "@graph": [...] }
 */

/**
 * Wrap a JSON-LD @graph array with the Schema.org @context.
 *
 * @param graph - Array of Schema.org JSON-LD objects
 * @returns Complete JSON-LD object ready for serialization
 */
export function wrapJsonLdGraph(graph: object[]): object {
  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

/**
 * Safely serialize a JSON-LD object for embedding in a <script> tag.
 *
 * Escapes forward slashes to prevent XSS via </script> injection.
 * Uses compact formatting for smaller page weight.
 *
 * @param jsonLd - The JSON-LD object to serialize
 * @returns Safe JSON string for use in dangerouslySetInnerHTML
 */
export function serializeJsonLd(jsonLd: object): string {
  return JSON.stringify(jsonLd)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * Build a complete JSON-LD string from a graph array, ready for
 * embedding in a <script type="application/ld+json"> tag.
 *
 * @param graph - Array of Schema.org JSON-LD objects from buildJsonLd()
 * @returns Serialized JSON-LD string
 */
export function buildJsonLdString(graph: object[]): string {
  return serializeJsonLd(wrapJsonLdGraph(graph));
}
