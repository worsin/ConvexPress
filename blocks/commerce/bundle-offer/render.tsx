import { useEffect, useId, useRef } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import {
	BundleHostView,
	type BundleInteraction,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/bundle";
import type { BundleOffer } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/bundleOfferContracts";
import { observeSectionReveal } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives/reveal";
import { formatMoney } from "../../../ConvexPress-Website/apps/web/src/lib/commerce/format";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

function Choices({
	offer,
	state,
}: {
	offer: BundleOffer;
	state: BundleInteraction;
}) {
	const id = useId(),
		quantity = state.choices.reduce((sum, item) => sum + item.quantity, 0);
	const unavailableMessage =
		offer.maxItems && quantity > offer.maxItems
			? `Remove ${quantity - offer.maxItems} ${quantity - offer.maxItems === 1 ? "item" : "items"} to keep this set within its ${offer.maxItems}-item limit.`
			: offer.minItems && quantity < offer.minItems
				? `Choose at least ${offer.minItems} ${offer.minItems === 1 ? "item" : "items"} for this set.`
				: offer.configurable
					? "This set is unavailable with the current choices."
					: "This set is unavailable right now.";
	const status = state.busy
		? "Adding your set…"
		: state.message ||
			(!state.ready
				? "Open the bundle to choose your set."
				: !state.quote
					? "Choose available options to calculate your set."
					: !state.quote.available
						? unavailableMessage
						: "Availability and price are checked when you add your set.");
	return (
		<div className="cp-bundle-builder">
			<div className="cp-bundle-builder-heading">
				<P.Heading level={3} size="md">
					Your set, your way.
				</P.Heading>
				<span>
					{quantity} {quantity === 1 ? "item" : "items"} selected
				</span>
			</div>
			{offer.configurable && (offer.minItems || offer.maxItems) && (
				<p className="cp-bundle-limits">
					{offer.minItems
						? `At least ${offer.minItems} ${offer.minItems === 1 ? "item" : "items"}`
						: "Choose your favorites"}
					{offer.maxItems ? ` · Up to ${offer.maxItems}` : ""}
				</p>
			)}
			<fieldset
				disabled={!state.ready || state.busy}
				className="cp-bundle-choices"
				aria-label="Bundle components"
			>
				{offer.components.map((component, index) => {
					const choice = state.choices.find(
							(item) => item.componentId === component.id,
						),
						variant = component.variants.find(
							(item) => item.id === choice?.variantId,
						);
					const replace = (next: typeof choice) =>
						state.change([
							...state.choices.filter(
								(item) => item.componentId !== component.id,
							),
							...(next ? [next] : []),
						]);
					return (
						<div
							className="cp-bundle-component"
							key={component.id}
							data-selected={!!choice}
						>
							<span className="cp-bundle-component-number" aria-hidden="true">
								{String(index + 1).padStart(2, "0")}
							</span>
							<div className="cp-bundle-component-copy">
								<div className="cp-bundle-component-name">
									<a href={component.href}>{component.title}</a>
									<span>
										{formatMoney(
											variant?.unitPriceAmount ?? component.unitPriceAmount,
											offer.currencyCode,
										)}
										<small> / item</small>
									</span>
								</div>
								<div className="cp-bundle-component-controls">
									{offer.configurable && !component.required ? (
										<label className="cp-bundle-include">
											<input
												type="checkbox"
												aria-label={`Include ${component.title}`}
												checked={!!choice}
												onChange={() =>
													replace(
														choice
															? undefined
															: {
																	componentId: component.id,
																	variantId: component.variantId,
																	quantity: component.minQuantity,
																},
													)
												}
											/>
											Include
										</label>
									) : (
										<span className="cp-bundle-included">Included</span>
									)}
									{component.allowVariantChange &&
										component.variants.length > 0 && (
											<select
												aria-label={`${component.title} option`}
												disabled={!choice}
												value={choice?.variantId ?? component.variantId ?? ""}
												onChange={(event) => {
													if (choice)
														replace({
															...choice,
															variantId: event.target.value,
														});
												}}
											>
												{component.variants.map((value) => (
													<option
														key={value.id}
														value={value.id}
														disabled={!value.available}
													>
														{value.title}
														{value.available ? "" : " — unavailable"}
													</option>
												))}
											</select>
										)}
									{!component.allowVariantChange && variant && (
										<span>{variant.title}</span>
									)}
									{choice && (
										<div className="cp-bundle-quantity">
											{offer.configurable && (
												<button
													type="button"
													aria-label={`Decrease ${component.title} quantity`}
													disabled={choice.quantity <= component.minQuantity}
													onClick={() =>
														replace({
															...choice,
															quantity: choice.quantity - 1,
														})
													}
												>
													−
												</button>
											)}
											<span aria-label={`${component.title} quantity`}>
												{choice.quantity}
											</span>
											{offer.configurable && (
												<button
													type="button"
													aria-label={`Increase ${component.title} quantity`}
													disabled={
														choice.quantity >=
														(component.maxQuantity ?? Number.MAX_SAFE_INTEGER)
													}
													onClick={() =>
														replace({
															...choice,
															quantity: choice.quantity + 1,
														})
													}
												>
													+
												</button>
											)}
										</div>
									)}
								</div>
							</div>
						</div>
					);
				})}
			</fieldset>
			<div className="cp-bundle-total">
				<div>
					<span>Set total</span>
					<div className="cp-bundle-price">
						{state.quote
							? formatMoney(state.quote.bundlePrice, offer.currencyCode)
							: "—"}
						{state.quote && state.quote.savings > 0 && (
							<del>
								{formatMoney(state.quote.regularPrice, offer.currencyCode)}
							</del>
						)}
					</div>
				</div>
				{state.quote && state.quote.savings > 0 && (
					<span className="cp-bundle-saving">
						Save {formatMoney(state.quote.savings, offer.currencyCode)}
					</span>
				)}
			</div>
			<p className="cp-bundle-status" id={`${id}-status`} role="status">
				{status}
			</p>
			<button
				type="button"
				className="cp-bundle-add"
				aria-describedby={`${id}-status`}
				disabled={!state.ready || state.busy || !state.quote?.available}
				onClick={() => void state.add()}
			>
				{state.busy ? "Adding…" : "Add set to cart"}
				<span aria-hidden="true">↗</span>
			</button>
			<div className="cp-bundle-links">
				<button
					type="button"
					disabled={!state.ready || state.busy}
					onClick={state.reset}
				>
					Reset choices
				</button>
				<a href="/cart">View cart →</a>
			</div>
		</div>
	);
}
export default defineDataBlock(
	"commerce/bundle-offer",
	"commerce.bundle",
	({ attrs, data }) => {
		const root = useRef<HTMLDivElement>(null);
		useEffect(() => {
			if (root.current) return observeSectionReveal(root.current);
		}, []);
		const offer = data.bundle;
		if (!offer)
			return (
				<div className="cp-bundle-empty">
					<P.Eyebrow>Better together</P.Eyebrow>
					<P.Heading size="lg">A little more to look forward to.</P.Heading>
					<P.Text tone="muted">This set is not available right now.</P.Text>
					<P.Link href="/bundles" label="Explore bundles" />
				</div>
			);
		return (
			<div ref={root} className="cp-bundle-offer">
				<div className="cp-bundle-story">
					<P.Eyebrow>Better together</P.Eyebrow>
					<P.Heading level={2} size="lg">
						{attrs.title || offer.name}
					</P.Heading>
					{attrs.title && attrs.title !== offer.name && (
						<p className="cp-bundle-name">{offer.name}</p>
					)}
					{(attrs.body || offer.description) && (
						<p className="cp-bundle-description">
							{attrs.body || offer.description}
						</p>
					)}
					<a
						className="cp-bundle-art"
						href={offer.href}
						aria-label={`Explore ${offer.name}`}
					>
						{offer.images.length ? (
							<img
								src={offer.images[0]}
								alt={offer.name}
								loading="lazy"
								decoding="async"
							/>
						) : (
							<div className="cp-bundle-monogram" aria-hidden="true">
								<span>{String(offer.components.length).padStart(2, "0")}</span>
								<span>
									Good things.
									<br />
									One set.
								</span>
							</div>
						)}
						<span className="cp-bundle-art-caption">
							{offer.configurable
								? "Made your way"
								: "Thoughtfully put together"}
							<span aria-hidden="true">↗</span>
						</span>
					</a>
					<a className="cp-bundle-details" href={offer.href}>
						Explore the complete bundle <span aria-hidden="true">↗</span>
					</a>
				</div>
				<BundleHostView key={offer.id} offer={offer}>
					{(state) => <Choices offer={offer} state={state} />}
				</BundleHostView>
			</div>
		);
	},
);
