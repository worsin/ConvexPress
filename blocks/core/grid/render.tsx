import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/grid", ({children}) => <P.Grid columns={{base:1,md:2,lg:3}} gap="lg">{children}</P.Grid>);
