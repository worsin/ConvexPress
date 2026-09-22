import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro, Testimonial, cardColumns } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/testimonials", ({ attrs, resources }) => (
  <P.Stack gap="lg">
    <Intro {...attrs} />
    <P.Grid columns={cardColumns(attrs.items.length, 2)} gap="lg">
      {attrs.items.map((item, index) => <Testimonial key={index} quote={item.quote} attribution={item.name || undefined} source={item.role || undefined} portrait={item.portrait} resources={resources} />)}
    </P.Grid>
  </P.Stack>
));
