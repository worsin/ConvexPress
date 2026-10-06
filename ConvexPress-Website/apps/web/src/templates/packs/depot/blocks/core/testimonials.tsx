import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import { Intro, Testimonial, cardColumns } from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/testimonials", ({ attrs, resources, style }) => (
	<P.Stack gap="md">
		<Intro {...attrs} />
		<div className="depot-testimonials" data-block-style={style}>
			<P.Grid columns={style === "editorial" ? { base: 1 } : style === "wall" && attrs.items.length >= 4 ? { base: 1, md: 2, lg: 4 } : cardColumns(attrs.items.length, 3)} gap="md">
				{attrs.items.map((item, index) => (
					<div key={index} className="depot-testimonial">
						<Testimonial
							quote={item.quote}
							portrait={item.portrait}
							resources={resources}
							attribution={item.name || undefined}
							source={item.role || undefined}
						/>
					</div>
				))}
			</P.Grid>
		</div>
	</P.Stack>
));
