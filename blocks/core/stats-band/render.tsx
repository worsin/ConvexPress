import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro, cardColumns } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/stats-band", ({ attrs }) => (
  <P.Stack gap="lg">
    <Intro {...attrs} />
    <P.Grid columns={cardColumns(attrs.stats.length)} gap="lg">
      {attrs.stats.map((item, index) => <P.Stat key={index} value={item.value || "—"} label={item.label || "Untitled statistic"} detail={item.note} />)}
    </P.Grid>
  </P.Stack>
));
