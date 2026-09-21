import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import { Intro } from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/testimonials", ({ attrs }) => (
	<P.Stack gap="md">
		<Intro {...attrs} />
		<div className="depot-testimonials">
			<P.Grid columns={{ base: 1, md: 2, lg: 3 }} gap="md">
				{attrs.items.map((item, index) => (
					<div key={index} className="depot-testimonial">
						<P.Quote
							quote={item.quote}
							attribution={item.name || undefined}
							source={item.role || undefined}
						/>
					</div>
				))}
			</P.Grid>
		</div>
	</P.Stack>
));
