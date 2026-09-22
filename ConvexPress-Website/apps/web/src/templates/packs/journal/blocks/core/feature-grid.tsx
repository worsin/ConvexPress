import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import {
	CardCopy,
	cardColumns,
	Intro,
	Prose,
} from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/feature-grid", ({ attrs }) => (
	<P.Stack gap="lg">
		<Intro {...attrs} />
		<div className="journal-features">
			<P.Grid columns={cardColumns(attrs.items.length, 2)} gap="lg">
				{attrs.items.map((item, index) => (
					<article key={index} className="journal-feature">
						<CardCopy>
							<P.Stack gap="md">
								<span className="journal-ordinal" aria-hidden="true">
									{String(index + 1).padStart(2, "0")}
								</span>
								{item.title && (
									<P.Heading level={3} size="md">
										{item.title}
									</P.Heading>
								)}
								{item.description && <Prose text={item.description} />}
							</P.Stack>
						</CardCopy>
					</article>
				))}
			</P.Grid>
		</div>
	</P.Stack>
));
