/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/stats-band", ({ attrs }) => (<P.Stack gap="lg"><Intro {...attrs} /><P.Grid columns={{base:1,md:2,lg:3}} gap="lg">{attrs.stats.map((item,index)=><P.Stat key={index} value={item.value || "—"} label={item.label || "Untitled statistic"} />)}</P.Grid></P.Stack>));
