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
	<P.Stack gap="md">
		<Intro {...attrs} />
		<div className="depot-features">
			<P.Grid columns={cardColumns(attrs.items.length)} gap="md">
				{attrs.items.map((item, index) => (
					<article key={index} className="depot-feature">
						<CardCopy>
							<P.Stack gap="md">
								<span className="depot-ordinal" aria-hidden="true">
									{String(index + 1).padStart(2, "0")}
								</span>
								{item.icon && <P.Icon name={item.icon} size="lg" />}
								{item.title && (
									<P.Heading level={3} size="md">
										{item.title}
									</P.Heading>
								)}
								{item.description && <Prose text={item.description} />}
								{item.link && <P.Link {...item.link} />}
							</P.Stack>
						</CardCopy>
					</article>
				))}
			</P.Grid>
		</div>
	</P.Stack>
));
