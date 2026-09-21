/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/testimonials", ({ attrs }) => (<P.Stack gap="lg"><Intro {...attrs} /><P.Grid columns={{base:1,md:2}} gap="lg">{attrs.items.map((item,index)=><P.Quote key={index} quote={item.quote} attribution={item.name || undefined} source={item.role || undefined} />)}</P.Grid></P.Stack>));
