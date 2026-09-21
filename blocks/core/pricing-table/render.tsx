/** Editorial comparison only. No billing toggles or checkout authority are inferred. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./pricing.css";
const unspecified = (
	<span className="cp-library-price-unspecified">Not specified</span>
);
export default defineBlock("core/pricing-table", ({ attrs }) => {
	if (!attrs.plans.length)
		return <P.Text tone="muted">Add plans to compare.</P.Text>;
	return (
		<P.Card>
			<section
				className="cp-library-pricing-scroll"
				aria-label="Plan comparison"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need access to horizontal table scrolling.
				tabIndex={0}
			>
				<table className="cp-library-pricing-table">
					<caption>Plan comparison</caption>
					<thead>
						<tr>
							<th scope="col">Plan details</th>
							{attrs.plans.map((plan, index) => (
								<th key={index} scope="col">
									<P.Eyebrow>{plan.name}</P.Eyebrow>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{attrs.plans.some((plan) => plan.description) && (
							<tr>
								<th scope="row">Overview</th>
								{attrs.plans.map((plan, index) => (
									<td key={index}>{plan.description || unspecified}</td>
								))}
							</tr>
						)}
						{attrs.plans.some((plan) => plan.priceLabel) && (
							<tr>
								<th scope="row">Price</th>
								{attrs.plans.map((plan, index) => (
									<td key={index}>
										<P.Text size="lg">{plan.priceLabel || unspecified}</P.Text>
									</td>
								))}
							</tr>
						)}
						{attrs.plans.some((plan) => plan.features.length) && (
							<tr>
								<th scope="row">Features</th>
								{attrs.plans.map((plan, index) => (
									<td key={index}>
										{plan.features.length ? (
											<P.List items={plan.features} />
										) : (
											unspecified
										)}
									</td>
								))}
							</tr>
						)}
						{attrs.rows.map((row, index) => (
							<tr key={index}>
								<th scope="row">{row.label}</th>
								{row.values.map((value, column) => (
									<td key={column}>{value || unspecified}</td>
								))}
							</tr>
						))}
						{attrs.plans.some((plan) => plan.cta) && (
							<tr>
								<th scope="row">Learn more</th>
								{attrs.plans.map((plan, index) => (
									<td key={index}>
										{plan.cta ? (
											<P.Link
												href={plan.cta.href}
												label={plan.cta.label.trim() || `Explore ${plan.name}`}
												newTab={plan.cta.newTab}
											/>
										) : (
											unspecified
										)}
									</td>
								))}
							</tr>
						)}
					</tbody>
				</table>
			</section>
		</P.Card>
	);
});
