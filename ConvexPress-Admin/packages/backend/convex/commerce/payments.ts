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

import { ConvexError, v } from "convex/values";

import {
	query,
	mutation,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan, getCurrentUser } from "../helpers/permissions";
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

		if (order.paymentStatus !== "pending") {
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
			return { transactionId: activeTransaction._id };
		}

		const now = Date.now();

		// Create transaction record
		const transactionId = await ctx.db.insert("commerce_payment_transactions", {
			orderId: args.orderId,
			checkoutSessionId: order.checkoutSessionId,
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

		return { transactionId };
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

		const now = Date.now();

		// Create refund record
		const refundId = await ctx.db.insert("commerce_payment_refunds", {
			orderId: transaction.orderId,
			transactionId: args.transactionId,
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

		// Schedule the Stripe refund action
		await ctx.scheduler.runAfter(
			0,
			internal.commerce.paymentActions.processStripeRefund,
			{
				refundId,
				transactionId: args.transactionId,
				providerTransactionId: transaction.providerTransactionId!,
				amount: args.amount,
			},
		);

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
		await ctx.db.patch(args.transactionId, {
			providerTransactionId: args.providerTransactionId,
			clientSecret: args.clientSecret,
			status: "processing",
			updatedAt: Date.now(),
		});
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
		if (transaction.status === "succeeded") return;

		const now = Date.now();

		await ctx.db.patch(transaction._id, {
			status: "succeeded",
			completedAt: now,
			updatedAt: now,
		});

		// Update the order's paymentStatus to "paid"
		if (transaction.orderId) {
			const order = await ctx.db.get(transaction.orderId);
			if (order) {
				await ctx.db.patch(transaction.orderId, {
					paymentStatus: "paid",
					status: "processing",
					paidAt: now,
					updatedAt: now,
				});

				// Commit inventory for paid order
				const orderItems = await ctx.db
					.query("commerce_order_items")
					.withIndex("by_order", (q: any) => q.eq("orderId", order._id))
					.collect();

				if (!order.inventoryCommittedAt && !order.inventoryReleasedAt) {
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
										await ctx.db.patch(order._id, {
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
									await ctx.db.patch(delta.bundleId, {
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
							if (!product || product.trackInventory === false) continue;

							const variant = allocation.variantId
								? await ctx.db.get(allocation.variantId)
								: null;
							const target = variant ?? product;
							try {
								const adjustment = resolveInventoryAdjustment({
									mode: "decrement",
									stockQuantity:
										typeof target.stockQuantity === "number"
											? target.stockQuantity
											: 0,
									allocationQuantity: allocation.quantity,
									allowBackorders: product.allowBackorders,
									label: allocation.label ?? product.title,
								});

								await ctx.db.patch(target._id, {
									stockQuantity: adjustment.nextStock,
									updatedAt: now,
								});
								await ctx.db.insert("commerce_inventory_adjustments", {
									productId: allocation.productId,
									variantId: allocation.variantId,
									adjustmentType: adjustment.adjustmentType,
									quantityDelta: adjustment.quantityDelta,
									reason: `Inventory allocated after payment received (${order.orderNumber})`,
									createdAt: now,
								});
							} catch {
								// Payment succeeded but inventory depleted — flag for admin review instead of throwing
								await ctx.db.patch(order._id, {
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

					await ctx.db.patch(order._id, { inventoryCommittedAt: now });
				}

				// Increment bundle purchase counts now that payment is confirmed
				for (const item of orderItems) {
					if (isBundleLineMetadata(item.metadata) && item.metadata.bundleId) {
						const bundle = await ctx.db.get(item.metadata.bundleId);
						if (bundle) {
							await ctx.db.patch(item.metadata.bundleId, {
								purchaseCount: (bundle.purchaseCount ?? 0) + item.quantity,
							});
						}
					}
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
			}
		}
	},
});

/**
 * Confirm payment failed (called by Stripe webhook).
 */
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

		// Idempotency: already failed or succeeded
		if (transaction.status === "failed" || transaction.status === "succeeded") {
			return;
		}

		const now = Date.now();

		await ctx.db.patch(transaction._id, {
			status: "failed",
			failureMessage: args.error || "Payment failed",
			updatedAt: now,
		});

		// Update the order's paymentStatus to "failed"
		if (transaction.orderId) {
			const order = await ctx.db.get(transaction.orderId);
			if (order) {
				await ctx.db.patch(transaction.orderId, {
					paymentStatus: "failed",
					status: "failed",
					updatedAt: now,
				});

				await ctx.db.insert("commerce_order_history", {
					orderId: transaction.orderId,
					eventType: "payment_failed",
					message: `Payment failed: ${args.error || "Unknown error"}.`,
					metadata: {
						transactionId: transaction._id,
						providerTransactionId: args.providerTransactionId,
						error: args.error,
					},
					createdAt: now,
				});
			}
		}
	},
});

/**
 * Complete refund processing (called by Stripe refund action).
 */
export const completeRefund = internalMutation({
	args: {
		refundId: v.id("commerce_payment_refunds"),
		transactionId: v.id("commerce_payment_transactions"),
		providerRefundId: v.string(),
		amount: v.number(),
		success: v.boolean(),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const transaction = await ctx.db.get(args.transactionId);
		if (!transaction) return;
		const refund = await ctx.db.get(args.refundId);

		if (args.success) {
			// Update refund record
			await ctx.db.patch(args.refundId, {
				status: "succeeded",
				providerRefundId: args.providerRefundId,
				updatedAt: now,
			});

			// Update transaction refunded amount
			const newRefundedAmount = (transaction.refundedAmount ?? 0) + args.amount;
			const newStatus =
				newRefundedAmount >= transaction.amount.amount
					? "refunded"
					: "partially_refunded";

			await ctx.db.patch(args.transactionId, {
				refundedAmount: newRefundedAmount,
				status: newStatus,
				updatedAt: now,
			});

			// Update order status if fully refunded
			if (transaction.orderId && newStatus === "refunded") {
				await ctx.db.patch(transaction.orderId, {
					paymentStatus: "refunded",
					status: "refunded",
					updatedAt: now,
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
			}

			if (refund?.returnId) {
				const returnRequest = await ctx.db.get(refund.returnId);
				if (returnRequest?.status === "refund_pending") {
					await ctx.db.patch(refund.returnId, {
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
			await ctx.db.patch(args.refundId, {
				status: "failed",
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
			}

			if (refund?.returnId) {
				const returnRequest = await ctx.db.get(refund.returnId);
				if (returnRequest?.status === "refund_pending") {
					await ctx.db.patch(refund.returnId, {
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
				}
			}
		}
	},
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
					await ctx.db.patch(method._id, { isDefault: false });
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
		await ctx.db.delete(args.id);

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
				await ctx.db.patch(m._id, { isDefault: false });
			}
		}

		// Set this one as default
		await ctx.db.patch(args.id, { isDefault: true });

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
		paypalMode: v.optional(v.union(v.literal("sandbox"), v.literal("live"))),
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
		if (args.paypalMode !== undefined) newValues.paypalMode = args.paypalMode;
		if (args.defaultCurrency !== undefined)
			newValues.defaultCurrency = args.defaultCurrency;
		if (args.allowGuestCheckout !== undefined)
			newValues.allowGuestCheckout = args.allowGuestCheckout;
		if (args.methodOrder !== undefined)
			newValues.methodOrder = args.methodOrder;

		if (existing) {
			await ctx.db.patch(existing._id, {
				values: newValues,
				updatedAt: Date.now(),
			});
			return existing._id;
		} else {
			return await ctx.db.insert("settings", {
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

		if (order.paymentStatus !== "pending") {
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
			return { transactionId: activeTransaction._id };
		}

		const now = Date.now();

		// Create transaction record
		const transactionId = await ctx.db.insert("commerce_payment_transactions", {
			orderId: args.orderId,
			checkoutSessionId: order.checkoutSessionId,
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

		return { transactionId };
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
		await ctx.db.patch(args.eventId, {
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
		await ctx.db.patch(args.eventId, {
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
		await ctx.db.patch(args.eventId, {
			status: "failed",
			errorMessage: args.errorMessage,
			processedAt: Date.now(),
		});
	},
});
