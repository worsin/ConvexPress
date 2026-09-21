import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/synced-content.css";

/** Presentation comes from the active template and the authored wrapper layout.
 * The host supplies only the currently authorized occurrence children. */
export default defineBlock("core/synced", ({ children, syncedState }) => {
  if (syncedState === "unavailable") return <p role="status">Reusable content unavailable.</p>;
  if (syncedState !== "ready") return null;
  return <div className="cp-synced-content">{children}</div>;
});
