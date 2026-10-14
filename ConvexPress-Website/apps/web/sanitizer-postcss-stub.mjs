/**
 * Keep PostCSS out of the browser bundle.
 *
 * `sanitize-html` loads PostCSS at import time, only to parse `style`
 * attributes, and this site's sanitizer turns that off (`parseStyleAttributes:
 * false`, src/templates/sdk/block-data/portable/html.ts). In a browser build,
 * PostCSS drags in Node's path, fs and url and source-map-js: dead weight that
 * Vite externalizes with a warning on every page. For imports made by
 * sanitize-html only, `postcss` resolves to a stub whose `parse` fails loudly,
 * so turning style parsing back on can never silently do nothing.
 *
 * Covers the production build (Rollup `resolveId`) and the dev dependency
 * pre-bundle (an esbuild plugin for `optimizeDeps`). Server bundles keep the
 * real module: SSR externalizes sanitize-html, so Node loads PostCSS normally.
 */
const STUB_ID = "\0sanitize-html-postcss-stub";
const STUB_SOURCE = `
function parse() {
  throw new Error("sanitize-html: style attribute parsing is disabled in this build (parseStyleAttributes must stay false).");
}
export { parse };
export default { parse };
`;

function importedBySanitizeHtml(importer) {
  return typeof importer === "string" && /[\\/]sanitize-html[\\/]/.test(importer);
}

/** The esbuild side, for Vite's dependency pre-bundle in dev. */
export const sanitizerPostcssStubEsbuild = {
  name: "sanitize-html-postcss-stub",
  setup(build) {
    build.onResolve({ filter: /^postcss$/ }, (args) =>
      importedBySanitizeHtml(args.importer) ? { path: "postcss-stub", namespace: "sanitize-html-postcss-stub" } : undefined,
    );
    build.onLoad({ filter: /.*/, namespace: "sanitize-html-postcss-stub" }, () => ({ contents: STUB_SOURCE, loader: "js" }));
  },
};

/** The Rollup side, for client builds. */
export function sanitizerPostcssStub() {
  return {
    name: "sanitize-html-postcss-stub",
    enforce: "pre",
    resolveId(source, importer, options) {
      if (options?.ssr) return null;
      return source === "postcss" && importedBySanitizeHtml(importer) ? STUB_ID : null;
    },
    load(id) {
      return id === STUB_ID ? STUB_SOURCE : null;
    },
  };
}
