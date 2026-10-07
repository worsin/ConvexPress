import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";

export default defineBlock("business/menu", ({ attrs }) => (
	<P.Grid columns={{ base: 1 }} gap="lg">
		{attrs.sections.map((section, index) => (
			<P.Grid key={index} columns={{ base: 1 }} gap="lg">
				<P.Heading>{section.title}</P.Heading>
				<P.Grid columns={{ base: 1, md: 2 }} gap="lg">
					{section.items.map((item, i) => (
						<P.Card key={i} variant="plain">
							<P.Stack gap="md">
								<P.Heading level={3} size="md">{item.name}</P.Heading>
								{item.description && <P.Text>{item.description}</P.Text>}
								{item.priceLabel && <P.Text>{item.priceLabel}</P.Text>}
								<P.Stack direction="horizontal" gap="sm">
									{item.dietaryLabels.map((label, j) => (
										<P.Badge key={j} label={label} tone="muted" />
									))}
								</P.Stack>
							</P.Stack>
						</P.Card>
					))}
				</P.Grid>
			</P.Grid>
		))}
	</P.Grid>
));
