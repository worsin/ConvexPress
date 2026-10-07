/** Server-rendered block markup must be styled before renderer JavaScript loads.
 * Keep CSS in the route's static asset graph; views remain independently lazy.
 * Vite deduplicates the same stylesheet imports from individual renderers.
 */
import.meta.glob([
  "../../../../../../../blocks/*/*/*.css",
  "./*.css",
  "../../packs/*/blocks/**/*.css",
], { eager: true });
