/** Authored price periods change display copy; checkout authority stays with commerce. */
import { useId, useState } from "react";
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./pricing.css";
const unspecified = (
	<span className="cp-library-price-unspecified">Not specified</span>
);
export default defineBlock("core/pricing-table", ({ attrs }) => {
	const periodId = useId();
	const [alternate, setAlternate] = useState(false);
	const showingAlternate = Boolean(attrs.pricePeriods && alternate);
	const periodLabel = attrs.pricePeriods
		? showingAlternate
			? attrs.pricePeriods.alternateLabel.trim() || "Alternate"
			: attrs.pricePeriods.primaryLabel.trim() || "Standard"
		: undefined;
	if (!attrs.plans.length)
		return <P.Text tone="muted">Add plans to compare.</P.Text>;
	return (
		<P.Card>
			{attrs.pricePeriods && (
				<div className="cp-library-price-periods" role="radiogroup" aria-label="Price period">
					{[
						{ value: false, label: attrs.pricePeriods.primaryLabel.trim() || "Standard" },
						{ value: true, label: attrs.pricePeriods.alternateLabel.trim() || "Alternate" },
					].map((period) => (
						<label key={String(period.value)}>
							<input type="radio" name={periodId} checked={showingAlternate === period.value} onChange={() => setAlternate(period.value)} />
							<span>{period.label}</span>
						</label>
					))}
				</div>
			)}
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
						{(attrs.pricePeriods || attrs.plans.some((plan) => plan.priceLabel)) && (
							<tr>
								<th scope="row">{periodLabel ? `${periodLabel} price` : "Price"}</th>
								{attrs.plans.map((plan, index) => (
									<td key={index}>
										<P.Text size="lg">{(showingAlternate ? plan.alternatePriceLabel : plan.priceLabel) || unspecified}</P.Text>
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
