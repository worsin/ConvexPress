import { defineBlock } from "../../../../sdk/block-renderer/model";
import * as P from "../../../../sdk/primitives";
import {
	Intro,
	PlanContent,
} from "../../../../sdk/block-renderer/presentation";
import "../owned.css";
export default defineBlock("core/pricing-cards", ({ attrs }) => (
	<P.Stack gap="md">
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
