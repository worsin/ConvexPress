import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import { Intro, Testimonial, cardColumns } from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/testimonials", ({ attrs, resources }) => (
	<P.Stack gap="md">
		<Intro {...attrs} />
		<div className="depot-testimonials">
			<P.Grid columns={cardColumns(attrs.items.length, 3)} gap="md">
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
