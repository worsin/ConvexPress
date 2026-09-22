import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import {
	cardColumns,
	Intro,
	PlanContent,
} from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/pricing-cards", ({ attrs }) => (
	<P.Stack gap="md">
		<Intro {...attrs} />
		<P.Grid
			columns={cardColumns(attrs.plans.length)}
			gap="md"
		>
			{attrs.plans.map((plan, index) => (
				<article
					key={index}
					className="depot-plan"
					data-featured={plan.featured}
				>
					<PlanContent ctaLabel={plan.ctaLabel} ctaUrl={plan.ctaUrl}>
						{plan.featured && <P.Badge label="Featured plan" />}
						{plan.name && (
							<P.Heading level={3} size="md">
								{plan.name}
							</P.Heading>
						)}
						{plan.price && (
							<div className="depot-price">
								<P.Text size="lg">{plan.price}</P.Text>
							</div>
						)}
						{plan.description && (
							<P.Text tone="muted">{plan.description}</P.Text>
						)}
						<P.Divider />
						<P.List items={plan.features} />
					</PlanContent>
				</article>
			))}
		</P.Grid>
	</P.Stack>
));
