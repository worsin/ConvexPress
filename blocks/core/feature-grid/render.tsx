/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	CardCopy,
	CardCollection,
	Prose,
	Intro,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/feature-grid", ({ attrs }) => (
	<P.Stack gap="lg">
		<Intro {...attrs} />
		<CardCollection>
			<P.Grid columns={{ base: 1, md: 2, lg: 3 }} gap="lg">
				{attrs.items.map((item, index) => (
					<P.Card key={index}>
						<CardCopy>
							<P.Stack gap="md">
								{item.title && (
									<P.Heading level={3} size="md">
										{item.title}
									</P.Heading>
								)}
								{item.description && <Prose text={item.description} />}
							</P.Stack>
						</CardCopy>
					</P.Card>
				))}
			</P.Grid>
		</CardCollection>
	</P.Stack>
));
