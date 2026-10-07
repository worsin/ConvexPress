import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import { Intro, Testimonial, cardColumns } from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/testimonials", ({ attrs, resources, style }) => (
	<P.Stack gap="lg">
		<Intro {...attrs} />
		<div className="journal-testimonials" data-block-style={style}>
			<P.Grid columns={style === "editorial" ? { base: 1 } : cardColumns(attrs.items.length, style === "wall" ? 3 : 2)} gap="lg">
				{attrs.items.map((item, index) => (
					<div key={index} className="journal-testimonial">
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
