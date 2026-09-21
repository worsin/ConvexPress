/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import {
	Intro,
	PlanContent,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/pricing-cards", ({ attrs }) => (
	<P.Stack gap="lg">
		<Intro {...attrs} />
		<P.Grid
			columns={{
				base: 1,
				md: attrs.plans.length < 2 ? 1 : 2,
				lg:
					attrs.plans.length < 2
						? 1
						: attrs.plans.length === 2 || attrs.plans.length === 4
							? 2
							: 3,
			}}
			gap="lg"
		>
			{attrs.plans.map((plan, index) => (
				<P.Card key={index} tone={plan.featured ? "muted" : "default"}>
					<PlanContent ctaLabel={plan.ctaLabel} ctaUrl={plan.ctaUrl}>
						{plan.featured && <P.Badge label="Featured plan" />}
						{plan.name && (
							<P.Heading level={3} size="md">
								{plan.name}
							</P.Heading>
						)}
						{plan.price && <P.Text size="lg">{plan.price}</P.Text>}
						{plan.description && <P.Text>{plan.description}</P.Text>}
						<P.List items={plan.features} />
					</PlanContent>
				</P.Card>
			))}
		</P.Grid>
	</P.Stack>
));
