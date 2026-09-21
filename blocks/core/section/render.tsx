import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
// The canonical renderer already supplies the Section and its page gutter.
export default defineBlock("core/section", ({ children }) => <>{children}</>);
