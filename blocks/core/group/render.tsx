import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/group", ({ children }) => (
  <P.Grid columns={{ base: 1 }} gap="lg">{children}</P.Grid>
));
