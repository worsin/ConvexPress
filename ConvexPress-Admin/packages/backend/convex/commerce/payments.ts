// @ts-nocheck
/**
 * Commerce Payment System — Queries, Mutations, Internal Mutations
 *
 * Handles Stripe payment intent creation, webhook-driven confirmation,
 * and admin refund processing.
 *
 * Flow:
 *   1. Frontend calls `initiatePayment` with an orderId
 *   2. Mutation creates a `commerce_payment_transactions` record (status "pending")
 *   3. Mutation schedules `createStripeIntent` action (paymentActions.ts)
 *   4. Action calls Stripe API, updates transaction with clientSecret + paymentIntentId
 *   5. Frontend uses clientSecret to confirm payment via Stripe Elements
 *   6. Stripe webhook calls `confirmPaymentSuccess` or `confirmPaymentFailure`
 */

import { isInventoryCommitConflict } from "./reservationCommit";
import { readStockTarget, readCheckoutReservations } from "./stockTarget";
import { insertWithMediaReferences, patchWithMediaReferences , patchDynamicWithMediaReferences} from "../media/attachmentGuard";
import { settleOrderCoupon } from "./couponLifecycle";
import { ConvexError, v } from "convex/values";

import {
	query,
	mutation,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { CHECKOUT_EVENTS, SYSTEM } from "../events/constants";
import { getCommerceSettings, requireCommerceEnabled } from "./helpers";
import {
	getBundlePurchaseDelta,
	isBundleLineMetadata,
} from "../commerceBundles/runtime";
import {
	getOrderItemInventoryAllocations,
	resolveInventoryAdjustment,
} from "./orderBundleHelpers";
import { appendRefundFailureNote } from "../commerceReturns/refundLifecycle";
import {
	EMAIL_TEMPLATES,
	queueEmailForEvent,
	resolveRecipients,
} from "../helpers/email";
import { fulfillOrderDigitalEntitlementsHandler } from "../commerceDigital/fulfillment";
import { syncPurchasedCourseEnrollmentsHandler } from "../lms/enrollment/internals";

async function getOrCreatePaymentCollectionForOrder(ctx: any, order: any) {
	const existing = await ctx.db
		.query("commerce_payment_collections")
		.withIndex("by_order", (q: any) => q.eq("orderId", order._id))
		.collect();
	const active = existing.find((collection: any) =>
		["pending", "authorized", "partially_captured"].includes(collection.status),
	);
	if (active) return active;

	const now = Date.now();
	const collectionId = await ctx.db.insert("commerce_payment_collections", {
		orderId: order._id,
		checkoutSessionId: order.checkoutSessionId,
		currencyCode: order.currencyCode,
		amount: order.totalAmount,
		authorizedAmount: 0,
		capturedAmount: 0,
		refundedAmount: 0,
		status: "pending",
		metadata: {
			orderNumber: order.orderNumber,
			email: order.email,
		},
		createdAt: now,
		updatedAt: now,
	});

	await patchDynamicWithMediaReferences(ctx, order._id, {
		paymentCollectionId: collectionId,
		updatedAt: now,
	});

	return await ctx.db.get(collectionId);
}

async function getOrCreatePaymentSessionForCollection(
	ctx: any,
	args: {
		collection: any;
		order: any;
		provider: string;
	},
) {
	const existing = await ctx.db
		.query("commerce_payment_sessions")
		.withIndex("by_collection", (q: any) =>
			q.eq("collectionId", args.collection._id),
		)
		.collect();
	const active = existing.find(
		(session: any) =>
			session.provider === args.provider &&
			["pending", "processing", "authorized"].includes(session.status),
	);
	if (active) return active;

	const now = Date.now();
	const sessionId = await ctx.db.insert("commerce_payment_sessions", {
		collectionId: args.collection._id,
		orderId: args.order._id,
		checkoutSessionId: args.order.checkoutSessionId,
		provider: args.provider,
		status: "pending",
		amount: {
			amount: args.collection.amount,
			currencyCode: args.collection.currencyCode,
		},
		metadata: {
			orderNumber: args.order.orderNumber,
			email: args.order.email,
		},
		createdAt: now,
		updatedAt: now,
	});

	return await ctx.db.get(sessionId);
}

async function commitReservedInventoryForPaidOrder(ctx: any, order: any) {
  if (!order.checkoutSessionId) return false;
  const activeReservations = await readCheckoutReservations(ctx,order.checkoutSessionId);
  if (!activeReservations.length && order.inventoryReservationCount === undefined) return false;
  try {
    await ctx.runMutation(internal.commerce.inventory.commit, {
      checkoutSessionId:order.checkoutSessionId,orderId:order._id,
    });
  } catch (error) {
    if (!isInventoryCommitConflict(error)) throw error;
    await ctx.db.patch("commerce_orders",order._id,{fulfillmentStatus:"needs_review",updatedAt:Date.now()});
    await ctx.db.insert("commerce_order_history",{
      orderId:order._id,eventType:"inventory_conflict",
      message:"Payment received, but the original stock reservation could not be committed. Review inventory before fulfillment.",
      metadata:{code:error.data.code},createdAt:Date.now(),
    });
  }
  // Both a successful commit and a recorded conflict finish the reservation
  // path. Never follow a conflict with an allocation using today's stock owner.
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get payment settings (public-safe — publishable key only, no secrets).
 */
export const getSettings = query({
	args: {},
	handler: async (ctx) => {
		const settings = await getCommerceSettings(ctx);

		// Read commerce.payments section for Stripe publishable key
		const paymentsDoc = await ctx.db
			.query("settings")
			.withIndex("by_section", (q) => q.eq("section", "commerce.payments"))
			.unique();

		const paymentsValues = (paymentsDoc?.values ?? {}) as Record<
			string,
			unknown
		>;

		return {
			stripePublishableKey:
				(paymentsValues.stripePublishableKey as string) || null,
			enabledPaymentMethods: settings.paymentMethods.filter((m) => m.enabled),
			currencyCode: settings.currencyCode,
		};
	},
});

/**
 * List payment transactions (admin).
 */
export const listTransactions = query({
	args: {
		status: v.optional(v.string()),
		provider: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await requireCan(ctx, "manage_options");

		let results;

		if (args.provider && args.status) {
			results = await ctx.db
				.query("commerce_payment_transactions")
				.withIndex("by_provider_status", (q) =>
					q.eq("provider", args.provider).eq("status", args.status),
				)
				.order("desc")
				.take(args.limit ?? 50);
		} else {
			results = await ctx.db
				.query("commerce_payment_transactions")
				.order("desc")
				.take(args.limit ?? 50);

			if (args.status) {
				results = results.filter((t) => t.status === args.status);
			}
			if (args.provider) {
				results = results.filter((t) => t.provider === args.provider);
			}
		}

		// Enrich with order info
		const enriched = await Promise.all(
			results.map(async (t) => {
				const order = t.orderId ? await ctx.db.get(t.orderId) : null;
				return {
					...t,
					orderNumber: order?.orderNumber ?? null,
					orderEmail: order?.email ?? null,
				};
			}),
		);

		return enriched;
	},
});

export const listCollections = query({
	args: {
		status: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await requireCan(ctx, "manage_options");
		const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
		const rows = args.status
			? await ctx.db
					.query("commerce_payment_collections")
					.withIndex("by_status", (q: any) => q.eq("status", args.status))
					.order("desc")
					.take(limit)
			: await ctx.db
					.query("commerce_payment_collections")
					.order("desc")
					.take(limit);

		return await Promise.all(
			rows.map(async (collection: any) => {
				const order = collection.orderId ? await ctx.db.get(collection.orderId) : null;
				const sessions = await ctx.db
					.query("commerce_payment_sessions")
					.withIndex("by_collection", (q: any) =>
						q.eq("collectionId", collection._id),
					)
					.collect();
				const captures = await ctx.db
					.query("commerce_payment_captures")
					.withIndex("by_collection", (q: any) =>
						q.eq("collectionId", collection._id),
					)
					.collect();
				return {
					...collection,
					orderNumber: order?.orderNumber,
					orderEmail: order?.email,
					sessions,
					captures,
				};
			}),
		);
	},
});

export const listCaptures = query({
	args: {
		orderId: v.optional(v.id("commerce_orders")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await requireCan(ctx, "manage_options");
		const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
		if (args.orderId) {
			return await ctx.db
				.query("commerce_payment_captures")
				.withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
				.order("desc")
				.take(limit);
		}
		return await ctx.db.query("commerce_payment_captures").order("desc").take(limit);
	},
});

/**
 * Get a single transaction with full detail (admin).
 */
export const getTransaction = query({
	args: {
		transactionId: v.id("commerce_payment_transactions"),
	},
	handler: async (ctx, args) => {
		await requireCan(ctx, "manage_options");

		const transaction = await ctx.db.get(args.transactionId);
		if (!transaction) return null;

		// Get associated refunds
		const refunds = await ctx.db
			.query("commerce_payment_refunds")
			.withIndex("by_order", (q) => q.eq("orderId", transaction.orderId))
			.collect();

		// Get order info
		const order = transaction.orderId
			? await ctx.db.get(transaction.orderId)
			: null;

		return {
			...transaction,
			refunds,
			order: order
				? {
						_id: order._id,
						orderNumber: order.orderNumber,
						email: order.email,
						status: order.status,
						totalAmount: order.totalAmount,
					}
				: null,
		};
	},
});

/**
 * Get a transaction by ID (for frontend polling after initiatePayment).
 */
export const getTransactionStatus = query({
	args: {
		transactionId: v.id("commerce_payment_transactions"),
	},
	handler: async (ctx, args) => {
		const transaction = await ctx.db.get(args.transactionId);
		if (!transaction) return null;

		return {
			_id: transaction._id,
			status: transaction.status,
			clientSecret: transaction.clientSecret ?? null,
			providerTransactionId: transaction.providerTransactionId ?? null,
			failureMessage: transaction.failureMessage ?? null,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS (client-callable)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initiate payment for an order. Creates a payment transaction record
 * and schedules the Stripe action to create a PaymentIntent.
 *
 * Called by the frontend after checkout.complete() returns an orderId.
 */
export const initiatePayment = mutation({
	args: {
		orderId: v.id("commerce_orders"),
	},
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);

		const order = await ctx.db.get(args.orderId);
		if (!order) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Order not found.",
			});
		}

		if (order.paymentStatus !== "pending" || ["cancelled", "failed", "refunded"].includes(order.status)) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: `Order payment status is "${order.paymentStatus}", expected "pending".`,
			});
		}

		// Check for existing pending/processing transaction
		const existingTransactions = await ctx.db
			.query("commerce_payment_transactions")
			.withIndex("by_order", (q) => q.eq("orderId", args.orderId))
			.collect();

		const activeTransaction = existingTransactions.find(
			(t) => t.status === "pending" || t.status === "processing",
		);

		if (activeTransaction) {
			// Return existing transaction instead of creating duplicate
			return {
				transactionId: activeTransaction._id,
				collectionId: activeTransaction.collectionId,
				sessionId: activeTransaction.sessionId,
			};
		}

		const now = Date.now();
		const collection = await getOrCreatePaymentCollectionForOrder(ctx, order);
		const paymentSession = await getOrCreatePaymentSessionForCollection(ctx, {
			collection,
			order,
			provider: "stripe",
		});

		// Create transaction record
		const transactionId = await ctx.db.insert("commerce_payment_transactions", {
			orderId: args.orderId,
			checkoutSessionId: order.checkoutSessionId,
			collectionId: collection._id,
			sessionId: paymentSession._id,
			provider: "stripe",
			status: "pending",
			amount: {
				amount: order.totalAmount,
				currencyCode: order.currencyCode,
			},
			metadata: {
				orderNumber: order.orderNumber,
				email: order.email,
			},
			createdAt: now,
			updatedAt: now,
		});

		// Schedule the Stripe action
		await ctx.scheduler.runAfter(
			0,
			internal.commerce.paymentActions.createStripeIntent,
			{
				transactionId,
				orderId: args.orderId,
				amount: order.totalAmount,
				currency: order.currencyCode,
				email: order.email,
			},
		);

		return {
			transactionId,
			collectionId: collection._id,
			sessionId: paymentSession._id,
		};
	},
});

/**
 * Process a refund (admin only).
 */
export const processRefund = mutation({
	args: {
		transactionId: v.id("commerce_payment_transactions"),
		amount: v.number(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireCan(ctx, "manage_options");

		const transaction = await ctx.db.get(args.transactionId);
		if (!transaction) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Transaction not found.",
			});
		}

		if (
			transaction.status !== "succeeded" &&
			transaction.status !== "partially_refunded"
		) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message:
					"Can only refund succeeded or partially refunded transactions.",
			});
		}

		// Validate refund amount
		const refundedSoFar = transaction.refundedAmount ?? 0;
		const availableToRefund = transaction.amount.amount - refundedSoFar;

		if (args.amount > availableToRefund) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: `Cannot refund more than ${availableToRefund}. Already refunded: ${refundedSoFar}.`,
			});
		}

		if (args.amount <= 0) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Refund amount must be greater than 0.",
			});
		}

		if (!transaction.orderId) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Transaction has no associated order.",
			});
		}

		if (!transaction.providerTransactionId) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Transaction has no provider transaction ID to refund.",
			});
		}

		const now = Date.now();

		// Create refund record
		const refundId = await ctx.db.insert("commerce_payment_refunds", {
			orderId: transaction.orderId,
			transactionId: args.transactionId,
			collectionId: transaction.collectionId,
			sessionId: transaction.sessionId,
			captureId: transaction.captureId,
			amount: {
				amount: args.amount,
				currencyCode: transaction.amount.currencyCode,
			},
			reason: args.reason,
			status: "pending",
			createdBy: user._id,
			createdAt: now,
			updatedAt: now,
		});

		if (transaction.provider === "stripe") {
			await ctx.scheduler.runAfter(
				0,
				internal.commerce.paymentActions.processStripeRefund,
				{
					refundId,
					transactionId: args.transactionId,
					providerTransactionId: transaction.providerTransactionId,
					amount: args.amount,
				},
			);
		} else {
			await ctx.scheduler.runAfter(
				0,
				internal.commerce.paymentActions.processProviderRefundAction,
				{
					refundId,
					transactionId: args.transactionId,
					provider: transaction.provider,
					providerTransactionId: transaction.providerTransactionId,
					amount: args.amount,
					currencyCode: transaction.amount.currencyCode,
				},
			);
		}

		return { refundId };
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS (called by actions/webhooks — not client-callable)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update transaction with Stripe PaymentIntent details (called by action).
 */
export const updateTransactionProvider = internalMutation({
	args: {
		transactionId: v.id("commerce_payment_transactions"),
		providerTransactionId: v.string(),
		clientSecret: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const transaction = await ctx.db.get(args.transactionId);
		await ctx.db.patch("commerce_payment_transactions", args.transactionId, {
			providerTransactionId: args.providerTransactionId,
			clientSecret: args.clientSecret,
			status: "processing",
			updatedAt: Date.now(),
		});
		if (transaction?.sessionId) {
			await ctx.db.patch("commerce_payment_sessions", transaction.sessionId, {
				providerSessionId: args.providerTransactionId,
				clientSecret: args.clientSecret,
				status: "processing",
				updatedAt: Date.now(),
			});
		}
	},
});

/**
 * Confirm payment succeeded (called by Stripe webhook).
 */
export const confirmPaymentSuccess = internalMutation({
	args: {
		providerTransactionId: v.string(),
		provider: v.string(),
	},
	handler: async (ctx, args) => {
		const transaction = await ctx.db
			.query("commerce_payment_transactions")
			.withIndex("by_provider_txn", (q) =>
				q
					.eq("provider", args.provider)
					.eq("providerTransactionId", args.providerTransactionId),
			)
			.unique();

		if (!transaction) {
			console.error(
				"[Payments] Transaction not found for provider ID:",
				args.providerTransactionId,
			);
			return;
		}

		// Idempotency: already succeeded
		if (["succeeded", "partially_refunded", "refunded"].includes(transaction.status)) return;

		const now = Date.now();

		await ctx.db.patch("commerce_payment_transactions", transaction._id, {
			status: "succeeded",
			completedAt: now,
			updatedAt: now,
		});

		if (transaction.sessionId) {
			await ctx.db.patch("commerce_payment_sessions", transaction.sessionId, {
				status: "captured",
				authorizedAt: now,
				completedAt: now,
				updatedAt: now,
			});
		}

		let captureId: any = undefined;
		if (transaction.collectionId) {
			await ctx.db.patch("commerce_payment_collections", transaction.collectionId, {
				status: "captured",
				authorizedAmount: transaction.amount.amount,
				capturedAmount: transaction.amount.amount,
				completedAt: now,
				updatedAt: now,
			});
			captureId = await ctx.db.insert("commerce_payment_captures", {
				collectionId: transaction.collectionId,
				sessionId: transaction.sessionId,
				transactionId: transaction._id,
				orderId: transaction.orderId,
				provider: args.provider,
				providerCaptureId: args.providerTransactionId,
				amount: transaction.amount,
				metadata: {
					source: "payment_success_webhook",
				},
				createdAt: now,
			});
			await ctx.db.patch("commerce_payment_transactions", transaction._id, {
				captureId,
				updatedAt: now,
			});
		}

		// Update the order's paymentStatus to "paid"
		if (transaction.orderId) {
			const order = await ctx.db.get(transaction.orderId);
			if (order) {
				await ctx.db.patch("commerce_orders", transaction.orderId, {
					paymentStatus: "paid",
					status: "processing",
					paidAt: now,
					updatedAt: now,
				});

				const checkoutSession = order.checkoutSessionId
					? await ctx.db.get(order.checkoutSessionId)
					: null;
				if (checkoutSession) {
					await ctx.db.patch("commerce_checkout_sessions", checkoutSession._id, {
						status: "completed",
						completedAt: now,
						updatedAt: now,
					});

					const cart = checkoutSession.cartId
						? await ctx.db.get(checkoutSession.cartId)
						: null;
					if (cart) {
						await ctx.db.patch("commerce_carts", cart._id, {
							status: "converted",
							orderId: order._id,
							convertedAt: now,
							updatedAt: now,
							lastActiveAt: now,
						});
					}
					await emitEvent(ctx, CHECKOUT_EVENTS.COMPLETED, SYSTEM.CHECKOUT, {
						checkoutSessionId: checkoutSession._id,
						cartId: checkoutSession.cartId,
						orderId: order._id,
						userId: checkoutSession.userId,
						totalAmount: order.totalAmount,
						paymentProvider: args.provider,
					});
				}

        await settleOrderCoupon(ctx, order, "consume");

				// Commit inventory for paid order
				const orderItems = await ctx.db
					.query("commerce_order_items")
					.withIndex("by_order", (q: any) => q.eq("orderId", order._id))
					.collect();

                let reservedInventoryHandled = false;
                if (!order.inventoryCommittedAt && !order.inventoryReleasedAt) {
                  reservedInventoryHandled = await commitReservedInventoryForPaidOrder(ctx,order);
                }

				if (!order.inventoryCommittedAt && !order.inventoryReleasedAt) {
					const refreshedOrder = await ctx.db.get(order._id);
					if (refreshedOrder?.inventoryCommittedAt || reservedInventoryHandled) {
						// Location-aware reservations were committed through the inventory module.
					} else {
					for (const item of orderItems) {
						if (isBundleLineMetadata(item.metadata)) {
							const delta = getBundlePurchaseDelta(
								item.metadata,
								item.quantity,
							);
							if (delta) {
								const bundle = await ctx.db.get(delta.bundleId);
								if (
									bundle?.trackInventory &&
									typeof bundle.stockCount === "number"
								) {
									const nextStock = bundle.stockCount - delta.quantity;
									if (nextStock < 0) {
										// Payment succeeded but inventory depleted — flag for admin review instead of throwing
										await ctx.db.patch("commerce_orders", order._id, {
											fulfillmentStatus: "needs_review",
											paymentStatus: "paid",
											updatedAt: now,
										});
										await ctx.db.insert("commerce_order_history", {
											orderId: order._id,
											eventType: "inventory_conflict",
											message: `Bundle "${bundle.name}" stock depleted after payment. Needs admin review.`,
											actorUserId: undefined,
											createdAt: now,
										});
										continue; // Don't throw — payment is already captured
									}
									await patchDynamicWithMediaReferences(ctx, delta.bundleId, {
										stockCount: nextStock,
										updatedAt: now,
									});
								}
							}
						}

						for (const allocation of getOrderItemInventoryAllocations(item)) {
							const product = allocation.productId
								? await ctx.db.get(allocation.productId)
								: null;
							if (!product) continue;

							const variant = allocation.variantId
								? await ctx.db.get(allocation.variantId)
								: null;
							const selection = await readStockTarget(ctx, product._id, allocation.variantId);
							if (!selection.policy.tracked) continue;
							const target = selection.policy.owner === "variant" ? variant : product;
							try {
								const adjustment = resolveInventoryAdjustment({
									mode: "decrement",
									stockQuantity:
										typeof target.stockQuantity === "number"
											? target.stockQuantity
											: 0,
									allocationQuantity: allocation.quantity,
									allowBackorders: selection.policy.allowBackorders,
									label: allocation.label ?? product.title,
								});

								await patchDynamicWithMediaReferences(ctx, target._id, {
									stockQuantity: adjustment.nextStock,
									updatedAt: now,
								});
								await ctx.db.insert("commerce_inventory_adjustments", {
									productId: allocation.productId,
									variantId: selection.inventoryVariantId,
									orderId: order._id,
									adjustmentType: adjustment.adjustmentType,
									quantityDelta: adjustment.quantityDelta,
									reason: `Inventory allocated after payment received (${order.orderNumber})`,
									createdAt: now,
								});
							} catch {
								// Payment succeeded but inventory depleted — flag for admin review instead of throwing
								await ctx.db.patch("commerce_orders", order._id, {
									fulfillmentStatus: "needs_review",
									paymentStatus: "paid",
									updatedAt: now,
								});
								await ctx.db.insert("commerce_order_history", {
									orderId: order._id,
									eventType: "inventory_conflict",
									message: `Product "${allocation.label ?? product.title}" stock depleted after payment. Needs admin review.`,
									actorUserId: undefined,
									createdAt: now,
								});
							}
						}
					}

					if (order.checkoutSessionId) {
                        const reservations = await readCheckoutReservations(ctx,order.checkoutSessionId);
						for (const reservation of reservations) {
							await ctx.db.patch("commerce_stock_reservations", reservation._id, {
								status: "converted",
								updatedAt: now,
							});
						}
					}

					await ctx.db.patch("commerce_orders", order._id, { inventoryCommittedAt: now, inventoryPolicyVersion: 1 });
					}
				}

				// Increment bundle purchase counts now that payment is confirmed
					for (const item of orderItems) {
						if (isBundleLineMetadata(item.metadata) && item.metadata.bundleId) {
							const bundle = await ctx.db.get(item.metadata.bundleId);
							if (bundle) {
								await patchDynamicWithMediaReferences(ctx, item.metadata.bundleId, {
								purchaseCount: (bundle.purchaseCount ?? 0) + item.quantity,
							});
							}
						}
					}

					try {
						await fulfillOrderDigitalEntitlementsHandler(ctx, {
							orderId: order._id,
							reason: "payment_success",
						});
					} catch (error) {
						console.error("[Digital Fulfillment] Payment success fulfillment failed:", error);
						await ctx.db.patch("commerce_orders", order._id, {
							digitalFulfillmentStatus: "failed",
							digitalFulfillmentError:
								error instanceof Error ? error.message : "Digital fulfillment failed after payment success.",
							updatedAt: now,
						});
					}
	
					// Add order history entry
					await ctx.db.insert("commerce_order_history", {
					orderId: transaction.orderId,
					eventType: "payment_received",
					message: `Payment of ${transaction.amount.amount} ${transaction.amount.currencyCode} received via ${args.provider}.`,
					metadata: {
						transactionId: transaction._id,
						providerTransactionId: args.providerTransactionId,
					},
					createdAt: now,
				});
				await ctx.runMutation((internal as any).purchases.internals.syncCommerceOrder, {
					orderId: order._id,
					eventType: "payment_received",
					metadata: {
						transactionId: transaction._id,
						providerTransactionId: args.providerTransactionId,
						provider: args.provider,
					},
				});
			}
		}
	},
});

/**
 * Confirm payment failed (called by Stripe webhook).
 */
async function failPaymentTransaction(ctx: any, transaction: any, error?: string) {
		// Idempotency: already failed or succeeded
		if (["failed", "succeeded", "partially_refunded", "refunded"].includes(transaction.status)) {
			return;
		}

		const now = Date.now();

		await patchDynamicWithMediaReferences(ctx, transaction._id, {
			status: "failed",
			failureMessage: error || "Payment failed",
			updatedAt: now,
		});
		if (transaction.sessionId) {
			await patchDynamicWithMediaReferences(ctx, transaction.sessionId, {
				status: "failed",
				updatedAt: now,
			});
		}
		if (transaction.collectionId) {
			await patchDynamicWithMediaReferences(ctx, transaction.collectionId, {
				status: "failed",
				updatedAt: now,
			});
		}

		// Keep the order payable so the customer can retry with a new transaction.
		if (transaction.orderId) {
			const order = await ctx.db.get(transaction.orderId);
			if (order && order.paymentStatus === "pending" && !["cancelled", "failed"].includes(order.status)) {
				await patchDynamicWithMediaReferences(ctx, transaction.orderId, {
					paymentStatus: "pending",
					status: "pending",
					updatedAt: now,
				});
				if (order.checkoutSessionId) {
					const checkoutSession = await ctx.db.get(order.checkoutSessionId);
					if (checkoutSession) {
						await patchDynamicWithMediaReferences(ctx, checkoutSession._id, {
							status: "failed",
							failedAt: now,
							failureReason: error || "Payment failed",
							updatedAt: now,
						});
						await emitEvent(ctx, CHECKOUT_EVENTS.FAILED, SYSTEM.CHECKOUT, {
							checkoutSessionId: checkoutSession._id,
							cartId: checkoutSession.cartId,
							orderId: order._id,
							userId: checkoutSession.userId,
							reason: error || "Payment failed",
							paymentProvider: transaction.provider,
						});
					}
				}

				await ctx.db.insert("commerce_order_history", {
					orderId: transaction.orderId,
					eventType: "payment_failed",
					message: `Payment failed: ${error || "Unknown error"}.`,
					metadata: {
						transactionId: transaction._id,
						providerTransactionId: transaction.providerTransactionId,
						error: error,
					},
					createdAt: now,
				});
				await ctx.runMutation((internal as any).purchases.internals.syncCommerceOrder, {
					orderId: order._id,
					eventType: "payment_failed",
					metadata: {
						transactionId: transaction._id,
						providerTransactionId: transaction.providerTransactionId,
						provider: transaction.provider,
						error: error,
					},
				});
			}
		}
}

/** Creation can fail before a provider assigns an ID. Always address the local row. */
export const failPaymentCreation = internalMutation({
  args: { transactionId: v.id("commerce_payment_transactions"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get(args.transactionId);
    if (transaction) await failPaymentTransaction(ctx, transaction, args.error);
    return null;
  },
});

export const confirmPaymentFailure = internalMutation({
	args: {
		providerTransactionId: v.string(),
		provider: v.string(),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const transaction = await ctx.db
			.query("commerce_payment_transactions")
			.withIndex("by_provider_txn", (q) =>
				q
					.eq("provider", args.provider)
					.eq("providerTransactionId", args.providerTransactionId),
			)
			.unique();

		if (!transaction) {
			console.error(
				"[Payments] Transaction not found for provider ID:",
				args.providerTransactionId,
			);
			return;
		}

		await failPaymentTransaction(ctx, transaction, args.error);
	},
});

/**
 * Complete refund processing (called by provider refund actions).
 */
async function completeRefundHandler(ctx: any, args: any) {
		const now = Date.now();
		const transaction = await ctx.db.get(args.transactionId);
		if (!transaction) return null;
		const refund = await ctx.db.get(args.refundId);
    if (!refund || String(refund.transactionId) !== String(transaction._id)) return null;
    if (Number(refund.amount.amount) !== args.amount) throw new ConvexError({ code: "REFUND_AMOUNT_MISMATCH", message: "Provider refund amount does not match the request." });
    if (refund.status === "succeeded") return null;
    const providerStatus = args.providerStatus?.toLowerCase();
    const succeeded = providerStatus ? ["succeeded", "completed"].includes(providerStatus) : args.success;
    const pending = providerStatus && !succeeded && !["failed", "canceled", "cancelled"].includes(providerStatus);
    if (pending) {
      if (refund.status !== "failed") await patchDynamicWithMediaReferences(ctx, refund._id, {
        status: "pending", providerRefundId: args.providerRefundId || refund.providerRefundId,
        failureMessage: undefined, updatedAt: now,
      });
      return null;
    }
    if (!succeeded && refund.status === "failed") return null;

		if (succeeded) {
			// Update refund record
			await patchDynamicWithMediaReferences(ctx, args.refundId, {
				status: "succeeded",
        failureMessage: undefined,
				providerRefundId: args.providerRefundId,
				updatedAt: now,
			});

			// Update transaction refunded amount
			const newRefundedAmount = (transaction.refundedAmount ?? 0) + args.amount;
			const newStatus =
				newRefundedAmount >= transaction.amount.amount
					? "refunded"
					: "partially_refunded";

			await patchDynamicWithMediaReferences(ctx, args.transactionId, {
				refundedAmount: newRefundedAmount,
				status: newStatus,
				updatedAt: now,
			});
			if (transaction.collectionId) {
				const collection = await ctx.db.get(transaction.collectionId);
				const previousRefunded = Number(collection?.refundedAmount ?? 0);
				await patchDynamicWithMediaReferences(ctx, transaction.collectionId, {
					refundedAmount: previousRefunded + args.amount,
					status:
						previousRefunded + args.amount >= Number(collection?.amount ?? transaction.amount.amount)
							? "refunded"
							: "partially_refunded",
					updatedAt: now,
				});
			}

			// Update order status if fully refunded
			if (transaction.orderId && newStatus === "refunded") {
				await patchDynamicWithMediaReferences(ctx, transaction.orderId, {
					paymentStatus: "refunded",
					status: "refunded",
					updatedAt: now,
				});
				await syncPurchasedCourseEnrollmentsHandler(ctx, {
					orderId: transaction.orderId,
					action: "revoke",
				});
			}

			// Add order history
			if (transaction.orderId) {
				await ctx.db.insert("commerce_order_history", {
					orderId: transaction.orderId,
					eventType: "refund_processed",
					message: `Refund of ${args.amount} ${transaction.amount.currencyCode} processed.`,
					metadata: {
						refundId: args.refundId,
						providerRefundId: args.providerRefundId,
						amount: args.amount,
					},
					createdAt: now,
				});
				await ctx.runMutation((internal as any).purchases.internals.syncCommerceOrder, {
					orderId: transaction.orderId,
					eventType: "refund_processed",
					metadata: {
						refundId: args.refundId,
						providerRefundId: args.providerRefundId,
						amount: args.amount,
					},
				});
			}

			if (refund?.returnId) {
				const returnRequest = await ctx.db.get(refund.returnId);
				if (returnRequest?.status === "refund_pending") {
					await patchDynamicWithMediaReferences(ctx, refund.returnId, {
						status: "refunded",
						refundFailureReason: undefined,
						refundedAt: now,
						updatedAt: now,
					});
					await ctx.db.insert("commerce_return_history", {
						returnRequestId: refund.returnId,
						actorType: "system",
						eventType: "refund_succeeded",
						fromStatus: "refund_pending",
						toStatus: "refunded",
						metadata: {
							refundId: args.refundId,
							providerRefundId: args.providerRefundId,
							refundAmount: args.amount,
						},
						createdAt: now,
					});
				}
			}
		} else {
			// Refund failed
			await patchDynamicWithMediaReferences(ctx, args.refundId, {
				status: "failed",
        providerRefundId: args.providerRefundId || refund.providerRefundId,
				failureMessage: args.error,
				updatedAt: now,
			});

			if (transaction.orderId) {
				await ctx.db.insert("commerce_order_history", {
					orderId: transaction.orderId,
					eventType: "refund_failed",
					message: `Refund failed: ${args.error || "Unknown error"}.`,
					metadata: {
						refundId: args.refundId,
						error: args.error,
					},
					createdAt: now,
				});
				await ctx.runMutation((internal as any).purchases.internals.syncCommerceOrder, {
					orderId: transaction.orderId,
					eventType: "refund_failed",
					metadata: {
						refundId: args.refundId,
						amount: args.amount,
						error: args.error,
					},
				});
			}

			if (refund?.returnId) {
				const returnRequest = await ctx.db.get(refund.returnId);
				if (returnRequest?.status === "refund_pending") {
					const order = transaction.orderId
						? await ctx.db.get(transaction.orderId)
						: null;
					await patchDynamicWithMediaReferences(ctx, refund.returnId, {
						status: "received",
						refundFailureReason: args.error,
						notes: appendRefundFailureNote(returnRequest.notes, args.error),
						updatedAt: now,
					});
					await ctx.db.insert("commerce_return_history", {
						returnRequestId: refund.returnId,
						actorType: "system",
						eventType: "refund_failed",
						fromStatus: "refund_pending",
						toStatus: "received",
						note: args.error,
						metadata: {
							refundId: args.refundId,
							refundAmount: args.amount,
						},
						createdAt: now,
					});

					const admins = await resolveRecipients(ctx, "admin");
					for (const admin of admins) {
						await queueEmailForEvent(
							ctx,
							EMAIL_TEMPLATES.RETURN_REFUND_FAILED,
							{
								recipientEmail: admin.email,
								recipientName: admin.name,
								recipientUserId: admin.userId,
								variables: {
									returnNumber: returnRequest.returnNumber,
									orderNumber: order?.orderNumber ?? "",
									error_message: args.error ?? "Unknown error",
								},
							},
						);
					}
				}
			}
		}
    return null;
}

export const completeRefund = internalMutation({
	args: {
		refundId: v.id("commerce_payment_refunds"),
		transactionId: v.id("commerce_payment_transactions"),
		providerRefundId: v.string(),
		amount: v.number(),
		success: v.boolean(),
		error: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
	},
  returns: v.null(),
  handler: completeRefundHandler,
});

/**
 * Get available payment methods for checkout.
 * Returns structured list of methods with icons, names, and provider info.
 * No auth required (used by checkout frontend).
 */
export const getAvailableMethods = query({
	args: {},
	handler: async (ctx) => {
		const settings = await getCommerceSettings(ctx);

		// Read commerce.payments section for provider keys
		const paymentsDoc = await ctx.db
			.query("settings")
			.withIndex("by_section", (q) => q.eq("section", "commerce.payments"))
			.unique();

		const paymentsValues = (paymentsDoc?.values ?? {}) as Record<
			string,
			unknown
		>;

		const stripePublishableKey =
			(paymentsValues.stripePublishableKey as string) || null;
		const paypalClientId =
			(paymentsValues.paypalClientId as string) ||
			process.env.PAYPAL_CLIENT_ID ||
			null;
		const paypalEnabled = !!paypalClientId;

		const methods: Array<{
			id: string;
			name: string;
			provider: "stripe" | "paypal";
			icon: string;
		}> = [];

		// Add Stripe methods if publishable key is configured
		if (stripePublishableKey) {
			methods.push(
				{
					id: "card",
					name: "Credit or Debit Card",
					provider: "stripe",
					icon: "credit-card",
				},
				{
					id: "apple_pay",
					name: "Apple Pay",
					provider: "stripe",
					icon: "apple",
				},
				{
					id: "google_pay",
					name: "Google Pay",
					provider: "stripe",
					icon: "smartphone",
				},
			);
		}

		// Add PayPal if configured
		if (paypalEnabled) {
			methods.push({
				id: "paypal",
				name: "PayPal",
				provider: "paypal",
				icon: "paypal",
			});
		}

		// Sort by configured method order
		const configuredOrder = settings.paymentMethods
			.filter((m) => m.enabled)
			.map((m) => m.code);

		const orderedMethods = configuredOrder
			.map((code) => methods.find((m) => m.id === code))
			.filter((m): m is NonNullable<typeof m> => m !== undefined);

		// Add any methods not in the configured order at the end
		const unorderedMethods = methods.filter(
			(m) => !configuredOrder.includes(m.id),
		);

		return {
			methods: [...orderedMethods, ...unorderedMethods],
			stripePublishableKey,
			paypalClientId,
		};
	},
});

/**
 * Get saved payment methods for the authenticated user.
 */
export const getSavedMethods = query({
	args: {},
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx);
		if (!user) return [];

		const methods = await ctx.db
			.query("commerce_saved_payment_methods")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		return methods.map((m) => ({
			_id: m._id,
			type: m.type,
			brand: m.brand,
			last4: m.last4,
			expiryMonth: m.expiryMonth,
			expiryYear: m.expiryYear,
			isDefault: m.isDefault,
		}));
	},
});

/**
 * Get transaction stats for admin dashboard.
 * Filterable by time window (days parameter).
 */
export const getTransactionStats = query({
	args: {
		days: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await requireCan(ctx, "manage_options");

		const daysAgo = args.days ?? 30;
		const startTime = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

		const transactions = await ctx.db
			.query("commerce_payment_transactions")
			.filter((q) => q.gte(q.field("createdAt"), startTime))
			.collect();

		const succeeded = transactions.filter((t) => t.status === "succeeded");
		const failed = transactions.filter((t) => t.status === "failed");
		const refunded = transactions.filter(
			(t) => t.status === "refunded" || t.status === "partially_refunded",
		);

		const totalRevenue = succeeded.reduce((sum, t) => sum + t.amount.amount, 0);
		const totalRefunded = refunded.reduce(
			(sum, t) => sum + (t.refundedAmount || 0),
			0,
		);

		return {
			totalTransactions: transactions.length,
			succeededCount: succeeded.length,
			failedCount: failed.length,
			refundedCount: refunded.length,
			totalRevenue,
			totalRefunded,
			netRevenue: totalRevenue - totalRefunded,
			successRate:
				transactions.length > 0
					? (succeeded.length / transactions.length) * 100
					: 0,
		};
	},
});

/**
 * Save a payment method for the authenticated user.
 * Prevents duplicates and manages default flag.
 */
export const savePaymentMethod = mutation({
	args: {
		providerMethodId: v.string(),
		providerCustomerId: v.optional(v.string()),
		type: v.string(),
		brand: v.optional(v.string()),
		last4: v.string(),
		expiryMonth: v.optional(v.number()),
		expiryYear: v.optional(v.number()),
		setAsDefault: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "You must be logged in to save a payment method.",
			});
		}

		// Check if method already saved (prevent duplicates)
		const existing = await ctx.db
			.query("commerce_saved_payment_methods")
			.withIndex("by_provider_method", (q) =>
				q.eq("providerMethodId", args.providerMethodId),
			)
			.unique();

		if (existing) {
			return existing._id;
		}

		// If setting as default, unset others
		if (args.setAsDefault) {
			const otherMethods = await ctx.db
				.query("commerce_saved_payment_methods")
				.withIndex("by_user", (q) => q.eq("userId", user._id))
				.collect();

			for (const method of otherMethods) {
				if (method.isDefault) {
					await ctx.db.patch("commerce_saved_payment_methods", method._id, { isDefault: false });
				}
			}
		}

		// Create saved method
		const methodId = await ctx.db.insert("commerce_saved_payment_methods", {
			userId: user._id,
			provider: "stripe",
			providerMethodId: args.providerMethodId,
			providerCustomerId: args.providerCustomerId,
			type: args.type,
			brand: args.brand,
			last4: args.last4,
			expiryMonth: args.expiryMonth,
			expiryYear: args.expiryYear,
			isDefault: args.setAsDefault ?? false,
			createdAt: Date.now(),
		});

		return methodId;
	},
});

/**
 * Delete a saved payment method.
 * Schedules Stripe detach action.
 */
export const deletePaymentMethod = mutation({
	args: {
		id: v.id("commerce_saved_payment_methods"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "You must be logged in.",
			});
		}

		const method = await ctx.db.get(args.id);
		if (!method) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Payment method not found.",
			});
		}

		// Verify ownership
		if (method.userId !== user._id) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "You do not own this payment method.",
			});
		}

		// Schedule Stripe detach action
		await ctx.scheduler.runAfter(
			0,
			internal.commerce.paymentActions.detachStripeMethodAction,
			{
				providerMethodId: method.providerMethodId,
			},
		);

		// Delete record
		await ctx.db.delete("commerce_saved_payment_methods", args.id);

		return { success: true };
	},
});

/**
 * Set a payment method as default.
 * Unsets all other defaults for the user.
 */
export const setDefaultPaymentMethod = mutation({
	args: {
		id: v.id("commerce_saved_payment_methods"),
	},
	handler: async (ctx, args) => {
		const user = await getCurrentUser(ctx);
		if (!user) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "You must be logged in.",
			});
		}

		const method = await ctx.db.get(args.id);
		if (!method) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Payment method not found.",
			});
		}

		if (method.userId !== user._id) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "You do not own this payment method.",
			});
		}

		// Unset all other defaults
		const otherMethods = await ctx.db
			.query("commerce_saved_payment_methods")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		for (const m of otherMethods) {
			if (m.isDefault && m._id !== args.id) {
				await ctx.db.patch("commerce_saved_payment_methods", m._id, { isDefault: false });
			}
		}

		// Set this one as default
		await ctx.db.patch("commerce_saved_payment_methods", args.id, { isDefault: true });

		return { success: true };
	},
});

/**
 * Admin mutation to configure payment settings.
 * Requires manage_options capability.
 */
export const updateSettings = mutation({
	args: {
		stripeEnabled: v.optional(v.boolean()),
		stripePublishableKey: v.optional(v.string()),
		paypalEnabled: v.optional(v.boolean()),
		paypalClientId: v.optional(v.string()),
		paypalMode: v.optional(
			v.union(
				v.literal("sandbox"),
				v.literal("production"),
				v.literal("live"),
			),
		),
		defaultCurrency: v.optional(v.string()),
		allowGuestCheckout: v.optional(v.boolean()),
		methodOrder: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		await requireCan(ctx, "manage_options");

		// Read current commerce.payments section
		const existing = await ctx.db
			.query("settings")
			.withIndex("by_section", (q) => q.eq("section", "commerce.payments"))
			.unique();

		const currentValues = (existing?.values ?? {}) as Record<string, unknown>;

		// Merge in new values (only provided fields)
		const newValues: Record<string, unknown> = { ...currentValues };
		if (args.stripeEnabled !== undefined)
			newValues.stripeEnabled = args.stripeEnabled;
		if (args.stripePublishableKey !== undefined)
			newValues.stripePublishableKey = args.stripePublishableKey;
		if (args.paypalEnabled !== undefined)
			newValues.paypalEnabled = args.paypalEnabled;
		if (args.paypalClientId !== undefined)
			newValues.paypalClientId = args.paypalClientId;
		if (args.paypalMode !== undefined) {
			newValues.paypalMode =
				args.paypalMode === "live" ? "production" : args.paypalMode;
		}
		if (args.defaultCurrency !== undefined)
			newValues.defaultCurrency = args.defaultCurrency;
		if (args.allowGuestCheckout !== undefined)
			newValues.allowGuestCheckout = args.allowGuestCheckout;
		if (args.methodOrder !== undefined)
			newValues.methodOrder = args.methodOrder;

		if (existing) {
			await patchWithMediaReferences<"settings">(ctx, "settings", existing._id, {
				values: newValues,
				updatedAt: Date.now(),
			});
			return existing._id;
		} else {
			return await insertWithMediaReferences<"settings">(ctx, "settings", {
				section: "commerce.payments" as any,
				values: newValues as any,
				updatedAt: Date.now(),
			});
		}
	},
});

/**
 * Create a PayPal order. Creates transaction record with PayPal provider
 * and schedules PayPal order creation action.
 */
export const createPayPalOrder = mutation({
	args: {
		orderId: v.id("commerce_orders"),
	},
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);

		const order = await ctx.db.get(args.orderId);
		if (!order) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Order not found.",
			});
		}

		if (order.paymentStatus !== "pending" || ["cancelled", "failed", "refunded"].includes(order.status)) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: `Order payment status is "${order.paymentStatus}", expected "pending".`,
			});
		}

		// Check for existing pending/processing PayPal transaction
		const existingTransactions = await ctx.db
			.query("commerce_payment_transactions")
			.withIndex("by_order", (q) => q.eq("orderId", args.orderId))
			.collect();

		const activeTransaction = existingTransactions.find(
			(t) =>
				t.provider === "paypal" &&
				(t.status === "pending" || t.status === "processing"),
		);

		if (activeTransaction) {
			return {
				transactionId: activeTransaction._id,
				collectionId: activeTransaction.collectionId,
				sessionId: activeTransaction.sessionId,
			};
		}

		const now = Date.now();
		const collection = await getOrCreatePaymentCollectionForOrder(ctx, order);
		const paymentSession = await getOrCreatePaymentSessionForCollection(ctx, {
			collection,
			order,
			provider: "paypal",
		});

		// Create transaction record
		const transactionId = await ctx.db.insert("commerce_payment_transactions", {
			orderId: args.orderId,
			checkoutSessionId: order.checkoutSessionId,
			collectionId: collection._id,
			sessionId: paymentSession._id,
			provider: "paypal",
			status: "pending",
			amount: {
				amount: order.totalAmount,
				currencyCode: order.currencyCode,
			},
			metadata: {
				orderNumber: order.orderNumber,
				email: order.email,
			},
			createdAt: now,
			updatedAt: now,
		});

		// Schedule the PayPal action
		await ctx.scheduler.runAfter(
			0,
			internal.commerce.paymentActions.createPayPalOrderAction,
			{
				transactionId,
				orderId: args.orderId,
				amount: order.totalAmount,
				currency: order.currencyCode,
			},
		);

		return {
			transactionId,
			collectionId: collection._id,
			sessionId: paymentSession._id,
		};
	},
});

/**
 * Capture a PayPal order after customer approval.
 * Called by the frontend after the customer approves the PayPal order.
 */
export const capturePayPalOrder = mutation({
	args: {
		transactionId: v.id("commerce_payment_transactions"),
		paypalOrderId: v.string(),
	},
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);

		const transaction = await ctx.db.get(args.transactionId);
		if (!transaction) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Transaction not found.",
			});
		}

		if (transaction.provider !== "paypal") {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Transaction is not a PayPal transaction.",
			});
		}

		if (transaction.status === "succeeded") {
			return { status: "already_completed" };
		}

		// Schedule the capture action
		await ctx.scheduler.runAfter(
			0,
			internal.commerce.paymentActions.capturePayPalOrderAction,
			{
				transactionId: args.transactionId,
				paypalOrderId: args.paypalOrderId,
			},
		);

		return { status: "capture_scheduled" };
	},
});

// ─── Internal Queries (for actions) ──────────────────────────────────────────

/**
 * Get transaction by ID (for actions that need to read transaction state).
 */
export const getTransactionInternal = internalQuery({
	args: {
		transactionId: v.id("commerce_payment_transactions"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.transactionId);
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK IDEMPOTENCY — Internal Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log an incoming webhook event and check for idempotency.
 * Returns the eventId and whether it already exists.
 */
export const logWebhookEvent = internalMutation({
	args: {
		provider: v.string(),
		eventType: v.string(),
		eventId: v.string(),
		payload: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Check for existing event (idempotency)
		const existing = await ctx.db
			.query("commerce_webhook_events")
			.withIndex("by_provider_event", (q) =>
				q.eq("provider", args.provider).eq("eventId", args.eventId),
			)
			.unique();

		if (existing) {
			return {
				eventId: existing._id,
				alreadyExists: true,
				status: existing.status,
			};
		}

		const eventId = await ctx.db.insert("commerce_webhook_events", {
			provider: args.provider,
			eventType: args.eventType,
			eventId: args.eventId,
			payload: args.payload,
			status: "received",
			createdAt: now,
		});

		return { eventId, alreadyExists: false, status: "received" as const };
	},
});

/**
 * Check if a webhook event already exists (for idempotency).
 */
export const getWebhookEvent = internalQuery({
	args: {
		provider: v.string(),
		eventId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("commerce_webhook_events")
			.withIndex("by_provider_event", (q) =>
				q.eq("provider", args.provider).eq("eventId", args.eventId),
			)
			.unique();
	},
});

/**
 * Mark a webhook event as processing.
 */
export const markWebhookProcessing = internalMutation({
	args: {
		eventId: v.id("commerce_webhook_events"),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch("commerce_webhook_events", args.eventId, {
			status: "processing",
		});
	},
});

/**
 * Mark a webhook event as processed successfully.
 */
export const markWebhookProcessed = internalMutation({
	args: {
		eventId: v.id("commerce_webhook_events"),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch("commerce_webhook_events", args.eventId, {
			status: "processed",
			processedAt: Date.now(),
		});
	},
});

/**
 * Mark a webhook event as failed.
 */
export const markWebhookFailed = internalMutation({
	args: {
		eventId: v.id("commerce_webhook_events"),
		errorMessage: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch("commerce_webhook_events", args.eventId, {
			status: "failed",
			errorMessage: args.errorMessage,
			processedAt: Date.now(),
		});
	},
});

/** Called only after the HTTP endpoint verifies the provider signature. */
export const reconcileProviderRefund = internalMutation({
  args: {
    provider: v.union(v.literal("stripe"), v.literal("paypal")), providerRefundId: v.string(), providerStatus: v.string(),
    refundId: v.optional(v.id("commerce_payment_refunds")), providerTransactionId: v.optional(v.string()),
    amount: v.optional(v.number()), error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const refund = args.refundId ? await ctx.db.get(args.refundId)
      : await ctx.db.query("commerce_payment_refunds").withIndex("by_provider_refund", (q: any) => q.eq("providerRefundId", args.providerRefundId)).unique();
    if (!refund || !refund.transactionId) return null;
    const transaction = await ctx.db.get(refund.transactionId);
    if (!transaction || transaction.provider !== args.provider ||
        (refund.providerRefundId && refund.providerRefundId !== args.providerRefundId) ||
        (args.providerTransactionId && transaction.providerTransactionId !== args.providerTransactionId)) {
      throw new ConvexError({ code: "REFUND_PROVIDER_MISMATCH", message: "Refund does not match its payment transaction." });
    }
    return completeRefundHandler(ctx, {
      refundId: refund._id, transactionId: transaction._id, providerRefundId: args.providerRefundId,
      providerStatus: args.providerStatus, amount: args.amount ?? refund.amount.amount, success: false, error: args.error,
    });
  },
});
