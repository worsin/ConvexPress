/** Server-rendered block markup must be styled before renderer JavaScript loads.
 * Keep CSS in the route's static asset graph; views remain independently lazy.
 * Vite deduplicates the same stylesheet imports from individual renderers.
 * Template surfaces load lazily too, so a surface's own stylesheet sits next to
 * it (surfaces/<id>.css) and is loaded here; check:templates refuses one from
 * anywhere else. Like owned block CSS, it must be scoped to what it styles.
 */
import.meta.glob([
  "../../../../../../../blocks/*/*/*.css",
  "./*.css",
  // The SDK primitives every block is built from (sections, text, stacks…).
  // Imported only by the renderer modules, they reached a route that shows a
  // document without loading those modules statically (a form page) after
  // its first paint, and its sections re-laid out.
  "../primitives/*.css",
  // Each pack's own primitive parts (pack-parts.ts), for the same reason.
  "../../packs/*/parts/*.css",
  "../../packs/*/blocks/**/*.css",
  "../../packs/*/surfaces/*.css",
], { eager: true });
