import { useId } from "react";
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import {
	WishlistHostView,
	type WishlistPager,
} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/wishlist";
import { formatMoney } from "../../../ConvexPress-Website/apps/web/src/lib/commerce/format";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

function Pager({ value, label }: { value: WishlistPager; label: string }) {
	return value.previous || value.next ? (
		<nav className="cp-wishlist-pager" aria-label={label}>
			<button
				type="button"
				disabled={!value.previous}
				onClick={() => value.previous?.()}
			>
				← Previous
			</button>
			<button
				type="button"
				disabled={!value.next}
				onClick={() => value.next?.()}
			>
				Next →
			</button>
		</nav>
	) : null;
}
export default defineBlock("commerce/wishlist", ({ attrs }) => {
	const selectId = useId();
	return (
		<WishlistHostView>
			{(saved) => (
				<section
					className="cp-wishlist"
					data-wishlist-state={saved.state}
					aria-label={attrs.heading || "Saved products"}
				>
					<header className="cp-wishlist-header">
						<div>
							<P.Eyebrow>Worth coming back for</P.Eyebrow>
							<P.Heading>{attrs.heading || "Your wishlist"}</P.Heading>
						</div>
						<P.Link label="View basket" href="/cart" />
					</header>
					{saved.state === "signed-out" ? (
						<div className="cp-wishlist-empty">
							<P.Heading level={3}>Keep your favourites close.</P.Heading>
							<P.Text>
								Sign in to see your saved products and pick up where you left
								off.
							</P.Text>
							<P.Button label="Sign in" href="/login" />
						</div>
					) : saved.state === "unavailable" ? (
						<p role="status">
							Your saved products are not available right now.
						</p>
					) : saved.state === "loading" ? (
						<p role="status">Loading your saved products…</p>
					) : (
						<>
							{saved.lists.length > 0 && (
								<div className="cp-wishlist-toolbar">
									<div className="cp-wishlist-list-select">
										<label htmlFor={selectId}>Your collections</label>
										<select
											id={selectId}
											value={saved.selected ?? ""}
											onChange={(event) => saved.select(event.target.value)}
										>
											{saved.lists.map((list) => (
												<option key={list.id} value={list.id}>
													{list.name}
												</option>
											))}
										</select>
									</div>
									<Pager value={saved.listsPager} label="Saved collections" />
								</div>
							)}
							<p
								className="cp-wishlist-feedback"
								role="status"
								aria-live="polite"
								aria-atomic="true"
							>
								{saved.message}
							</p>
							{saved.itemsLoading ? (
								<p role="status">Loading this collection…</p>
							) : saved.items.length === 0 ? (
								<div className="cp-wishlist-empty">
									<P.Heading level={3}>
										A little space for what you love.
									</P.Heading>
									<P.Text>{attrs.emptyMessage}</P.Text>
									<P.Button
										label={attrs.browseLink?.label || "Explore the shop"}
										href={attrs.browseLink?.href || "/products"}
									/>
								</div>
							) : (
								<ul className="cp-wishlist-grid">
									{saved.items.map((item) => (
										<li key={item._id} className="cp-wishlist-card">
											<div className="cp-wishlist-image">
												{item.image && item.product ? (
													<img
														src={item.image.src}
														alt={item.image.alt}
														loading="lazy"
														decoding="async"
													/>
												) : (
													<span
														aria-hidden="true"
														className="cp-wishlist-image-placeholder"
													>
														♡
													</span>
												)}
												<span className="cp-wishlist-saved-label">
													Saved for you
												</span>
											</div>
											<div className="cp-wishlist-card-body">
												<P.Heading level={3}>
													{item.product?.title || "Product no longer available"}
												</P.Heading>
												{item.variant && (
													<p className="cp-wishlist-variant">
														{item.variant.name}
													</p>
												)}
												{item.product && item.currencyCode && (
													<p className="cp-wishlist-price">
														{formatMoney(
															item.effectivePrice,
															item.currencyCode,
														)}
													</p>
												)}
												<div className="cp-wishlist-card-actions">
													{item.product && (
														<P.Link
															label={
																item.purchaseMode === "chooseOptions"
																	? "Choose options"
																	: "View product"
															}
															href={`/products/${encodeURIComponent(item.product.slug)}`}
														/>
													)}
													{item.purchaseMode === "add" && (
														<button
															className="cp-wishlist-move"
															type="button"
															disabled={Boolean(saved.busy) || !saved.canMove}
															onClick={() => void saved.move(item._id)}
														>
															{saved.busy === item._id
																? "Updating…"
																: "Move to basket"}
														</button>
													)}
													{item.purchaseMode === "unavailable" &&
														item.product && (
															<p className="cp-wishlist-variant">
																Currently unavailable
															</p>
														)}
													<button
														className="cp-wishlist-remove"
														type="button"
														disabled={Boolean(saved.busy)}
														aria-label={`Remove ${item.product?.title || "unavailable product"} from saved products`}
														onClick={() => void saved.remove(item._id)}
													>
														Remove
													</button>
												</div>
											</div>
										</li>
									))}
								</ul>
							)}
							<Pager value={saved.itemsPager} label="Saved products" />
						</>
					)}
				</section>
			)}
		</WishlistHostView>
	);
});
