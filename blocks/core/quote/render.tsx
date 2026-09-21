/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
export default defineBlock("core/quote", ({ attrs }) => attrs.text?.trim() ? (
  <div className="cp-library-quotation"><P.Quote quote={attrs.text} attribution={attrs.cite || undefined} source={attrs.source ? "View source" : undefined} href={attrs.source || undefined} /></div>
) : null);
