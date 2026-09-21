/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/quote", ({ attrs }) => (<P.Quote quote={attrs.text ?? ""} attribution={attrs.cite || undefined} source={attrs.source || undefined} />));
