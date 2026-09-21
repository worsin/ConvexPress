import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
export default defineBlock("core/pullquote", ({ attrs }) => attrs.text.trim() ? (
  <div className="cp-library-pullquote"><P.Quote quote={attrs.text} attribution={attrs.cite || undefined} /></div>
) : null);
