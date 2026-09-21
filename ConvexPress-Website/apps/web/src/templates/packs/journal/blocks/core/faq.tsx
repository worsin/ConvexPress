import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import { Intro } from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/faq", ({ attrs }) => (
	<div className="journal-faq">
		<P.Split ratio="one-two" gap="lg">
			<Intro {...attrs} />
			<P.Accordion
				multiple
				label={attrs.heading || "Frequently asked questions"}
				items={attrs.items.map((item, index) => ({
					id: `question-${index}`,
					title: item.question || `Question ${index + 1}`,
					body: item.answer,
				}))}
			/>
		</P.Split>
	</div>
));
