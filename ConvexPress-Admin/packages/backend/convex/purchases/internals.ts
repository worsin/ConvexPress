// @ts-nocheck TS2589: Convex generated API union types exceed TypeScript instantiation depth.
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { emitEvent } from "../helpers/events";
import {
  EMAIL_TEMPLATES,
  queueEmailForEvent,
  resolveRecipients,
} from "../helpers/email";
import { getUserIdentifier } from "../helpers/permissions";
import { NOTIFICATION_KEYS } from "../notifications/validators";
import { PURCHASE_EVENTS, SYSTEM } from "../events/constants";

type PurchaseEventCode =
  | typeof PURCHASE_EVENTS.CREATED
  | typeof PURCHASE_EVENTS.PAYMENT_PENDING
  | typeof PURCHASE_EVENTS.PAYMENT_SUCCEEDED
  | typeof PURCHASE_EVENTS.PAYMENT_FAILED
  | typeof PURCHASE_EVENTS.REFUND_CREATED
  | typeof PURCHASE_EVENTS.REFUND_FAILED
  | typeof PURCHASE_EVENTS.UPDATED;

function normalizeCurrency(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase()
    : "USD";
}

function normalizeEmail(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().includes("@")
    ? value.trim().toLowerCase()
    : undefined;
}

function money(value: unknown): number {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
}

function parseJsonBag(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function displayAmount(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizeCurrency(currencyCode),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${normalizeCurrency(currencyCode)}`;
  }
}

function purchaseCustomerUrl(purchase: any): string {
  if (purchase.commerceOrderId) return `/dashboard/orders/${purchase.commerceOrderId}`;
  return `/dashboard/orders/${purchase._id}`;
}

function purchaseAdminUrl(purchase: any): string {
  if (purchase.commerceOrderId) return `/commerce/orders/${purchase.commerceOrderId}`;
  if (purchase.formId && purchase.formSubmissionId) {
    return `/forms/${purchase.formId}/entries/${purchase.formSubmissionId}`;
  }
  if (purchase.subscriptionInvoiceId) {
    return `/commerce/subscriptions/invoices/${purchase.subscriptionInvoiceId}`;
  }
  if (purchase.subscriptionId) {
    return `/commerce/subscriptions/contracts/${purchase.subscriptionId}`;
  }
  return `/commerce/orders?purchaseId=${purchase._id}`;
}

function mapCommerceOrderStatus(order: any): string {
  if (order.status === "fulfilled" || order.status === "completed") return "fulfilled";
  if (order.status === "refunded" || order.paymentStatus === "refunded") return "refunded";
  if (order.paymentStatus === "partially_refunded") return "partially_refunded";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "failed" || order.paymentStatus === "failed") return "payment_failed";
  if (order.paymentStatus === "paid" || order.status === "paid" || order.status === "processing") {
    return "paid";
  }
  return "payment_pending";
}

function mapPurchasePaymentStatus(value: unknown): string {
  const status = String(value ?? "pending").toLowerCase();
  if (status === "payment_pending") return "pending";
  if (status === "payment_failed") return "failed";
  if (["succeeded", "success", "paid"].includes(status)) return "paid";
  if (["captured", "capture"].includes(status)) return "captured";
  if (["authorized", "requires_capture"].includes(status)) return "authorized";
  if (["processing", "requires_confirmation"].includes(status)) return "processing";
  if (["requires_action", "requires_payment_method"].includes(status)) return "requires_action";
  if (["failed", "declined"].includes(status)) return "failed";
  if (["canceled", "cancelled"].includes(status)) return "cancelled";
  if (status === "partially_refunded") return "partially_refunded";
  if (status === "refunded") return "refunded";
  return "pending";
}

function mapRefundStatus(value: unknown): string {
  const status = String(value ?? "pending").toLowerCase();
  if (["completed", "succeeded", "success"].includes(status)) return "succeeded";
  if (["failed", "declined"].includes(status)) return "failed";
  if (["canceled", "cancelled"].includes(status)) return "cancelled";
  if (["processing", "pending"].includes(status)) return status;
  return "pending";
}

function eventTypeToCode(eventType?: string): PurchaseEventCode {
  if (!eventType) return PURCHASE_EVENTS.UPDATED;
  if (["order_created", "form_order_created", "subscription_signup_created", "subscription_invoice_created"].includes(eventType)) {
    return PURCHASE_EVENTS.CREATED;
  }
  if (["payment_pending"].includes(eventType)) return PURCHASE_EVENTS.PAYMENT_PENDING;
  if (
    [
      "payment_received",
      "payment_captured",
      "form_order_paid",
      "subscription_signup_paid",
      "subscription_invoice_paid",
    ].includes(eventType)
  ) {
    return PURCHASE_EVENTS.PAYMENT_SUCCEEDED;
  }
  if (
    [
      "payment_failed",
      "form_order_payment_failed",
      "subscription_signup_payment_failed",
      "subscription_invoice_payment_failed",
    ].includes(eventType)
  ) {
    return PURCHASE_EVENTS.PAYMENT_FAILED;
  }
  if (["refund_created", "refund_processed", "subscription_invoice_refunded"].includes(eventType)) {
    return PURCHASE_EVENTS.REFUND_CREATED;
  }
  if (["refund_failed"].includes(eventType)) return PURCHASE_EVENTS.REFUND_FAILED;
  return PURCHASE_EVENTS.UPDATED;
}

function notificationKeyForEvent(code: PurchaseEventCode): string | null {
  if (code === PURCHASE_EVENTS.CREATED) return NOTIFICATION_KEYS.PURCHASE_CREATED;
  if (code === PURCHASE_EVENTS.PAYMENT_SUCCEEDED) {
    return NOTIFICATION_KEYS.PURCHASE_PAYMENT_SUCCEEDED;
  }
  if (code === PURCHASE_EVENTS.PAYMENT_FAILED) {
    return NOTIFICATION_KEYS.PURCHASE_PAYMENT_FAILED;
  }
  if (code === PURCHASE_EVENTS.REFUND_CREATED) {
    return NOTIFICATION_KEYS.PURCHASE_REFUND_CREATED;
  }
  return null;
}

function notificationTypeForEvent(code: PurchaseEventCode): "info" | "success" | "warning" | "error" {
  if (code === PURCHASE_EVENTS.PAYMENT_SUCCEEDED) return "success";
  if (code === PURCHASE_EVENTS.PAYMENT_FAILED || code === PURCHASE_EVENTS.REFUND_FAILED) {
    return "error";
  }
  if (code === PURCHASE_EVENTS.PAYMENT_PENDING) return "warning";
  return "info";
}

async function findPurchaseBySource(ctx: any, sourceType: string, sourceId: string) {
  return await ctx.db
    .query("purchase_orders")
    .withIndex("by_source", (q: any) =>
      q.eq("sourceType", sourceType).eq("sourceId", sourceId),
    )
    .first();
}

async function upsertPurchaseOrder(ctx: any, snapshot: Record<string, any>) {
  const now = Date.now();
  const existing =
    (snapshot.purchaseOrderId ? await ctx.db.get(snapshot.purchaseOrderId) : null) ??
    (await findPurchaseBySource(ctx, snapshot.sourceType, snapshot.sourceId));

  const { purchaseOrderId: _purchaseOrderId, ...fields } = snapshot;
  if (fields.email) fields.email = normalizeEmail(fields.email);
  if (existing) {
    await ctx.db.patch(existing._id, {
      ...fields,
      updatedAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert("purchase_orders", {
    ...fields,
    createdAt: now,
    updatedAt: now,
  });
}

async function deletePurchaseChildren(ctx: any, table: string, purchaseOrderId: any) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_purchase_order", (q: any) => q.eq("purchaseOrderId", purchaseOrderId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

async function replacePurchaseLines(ctx: any, purchaseOrderId: any, lines: any[]) {
  await deletePurchaseChildren(ctx, "purchase_order_lines", purchaseOrderId);
  const now = Date.now();
  for (const line of lines) {
    await ctx.db.insert("purchase_order_lines", {
      purchaseOrderId,
      sourceLineId: line.sourceLineId,
      lineType: line.lineType ?? "custom",
      title: line.title,
      subtitle: line.subtitle,
      sku: line.sku,
      quantity: line.quantity ?? 1,
      unitAmount: money(line.unitAmount),
      lineSubtotalAmount: money(line.lineSubtotalAmount ?? line.lineTotalAmount),
      lineTotalAmount: money(line.lineTotalAmount),
      currencyCode: normalizeCurrency(line.currencyCode),
      productId: line.productId,
      variantId: line.variantId,
      courseId: line.courseId,
      formId: line.formId,
      formSubmissionId: line.formSubmissionId,
      subscriptionId: line.subscriptionId,
      subscriptionInvoiceId: line.subscriptionInvoiceId,
      metadata: line.metadata,
      createdAt: now,
    });
  }
}

async function replacePurchasePayments(ctx: any, purchaseOrderId: any, payments: any[]) {
  await deletePurchaseChildren(ctx, "purchase_payments", purchaseOrderId);
  const now = Date.now();
  for (const payment of payments) {
    await ctx.db.insert("purchase_payments", {
      purchaseOrderId,
      provider: payment.provider ?? "unknown",
      providerTransactionId: payment.providerTransactionId,
      providerSessionId: payment.providerSessionId,
      paymentIntentId: payment.paymentIntentId,
      status: mapPurchasePaymentStatus(payment.status),
      amount: money(payment.amount),
      currencyCode: normalizeCurrency(payment.currencyCode),
      failureCode: payment.failureCode,
      failureMessage: payment.failureMessage,
      rawStatus: payment.rawStatus ?? payment.status,
      metadata: payment.metadata,
      createdAt: payment.createdAt ?? now,
      updatedAt: now,
      completedAt: payment.completedAt,
    });
  }
}

async function replacePurchaseRefunds(ctx: any, purchaseOrderId: any, refunds: any[]) {
  await deletePurchaseChildren(ctx, "purchase_refunds", purchaseOrderId);
  const now = Date.now();
  for (const refund of refunds) {
    await ctx.db.insert("purchase_refunds", {
      purchaseOrderId,
      purchasePaymentId: refund.purchasePaymentId,
      provider: refund.provider ?? "unknown",
      providerRefundId: refund.providerRefundId,
      status: mapRefundStatus(refund.status),
      amount: money(refund.amount),
      currencyCode: normalizeCurrency(refund.currencyCode),
      reason: refund.reason,
      failureCode: refund.failureCode,
      failureMessage: refund.failureMessage,
      metadata: refund.metadata,
      createdAt: refund.createdAt ?? now,
      updatedAt: now,
      completedAt: refund.completedAt,
    });
  }
}

async function getUserIdentifierForPurchase(ctx: any, purchase: any): Promise<string | null> {
  if (!purchase.userId) return null;
  const user = await ctx.db.get(purchase.userId);
  return user ? getUserIdentifier(user) : String(purchase.userId);
}

async function emitPurchaseLifecycle(ctx: any, purchaseOrderId: any, eventType?: string, message?: string, metadata?: any) {
  if (!eventType) return;

  const existingEvents = await ctx.db
    .query("purchase_order_events")
    .withIndex("by_purchase_order", (q: any) => q.eq("purchaseOrderId", purchaseOrderId))
    .collect();
  const duplicate = existingEvents.some((entry: any) => entry.eventType === eventType);
  if (duplicate) return;

  const purchase = await ctx.db.get(purchaseOrderId);
  if (!purchase) return;

  const code = eventTypeToCode(eventType);
  const payloadUserId = await getUserIdentifierForPurchase(ctx, purchase);
  const payload = {
    purchaseOrderId,
    orderNumber: purchase.orderNumber,
    sourceType: purchase.sourceType,
    sourceLabel: purchase.sourceLabel,
    customerEmail: purchase.email,
    totalAmount: purchase.totalAmount,
    currencyCode: purchase.currencyCode,
    total: displayAmount(purchase.totalAmount, purchase.currencyCode),
    userId: payloadUserId ?? undefined,
    commerceOrderId: purchase.commerceOrderId,
    formId: purchase.formId,
    formSubmissionId: purchase.formSubmissionId,
    subscriptionId: purchase.subscriptionId,
    subscriptionInvoiceId: purchase.subscriptionInvoiceId,
    ...metadata,
  };

  const eventId = await emitEvent(ctx, code, SYSTEM.PURCHASE, payload);
  await ctx.db.insert("purchase_order_events", {
    purchaseOrderId,
    eventType,
    message: message ?? defaultMessageForPurchaseEvent(code, purchase),
    metadata: {
      eventCode: code,
      eventId,
      ...metadata,
    },
    createdAt: Date.now(),
  });

  await queuePurchaseNotifications(ctx, purchase, code, eventId);
}

function defaultMessageForPurchaseEvent(code: PurchaseEventCode, purchase: any): string {
  if (code === PURCHASE_EVENTS.CREATED) return `Purchase ${purchase.orderNumber} was created.`;
  if (code === PURCHASE_EVENTS.PAYMENT_SUCCEEDED) return `Payment received for ${purchase.orderNumber}.`;
  if (code === PURCHASE_EVENTS.PAYMENT_FAILED) return `Payment failed for ${purchase.orderNumber}.`;
  if (code === PURCHASE_EVENTS.REFUND_CREATED) return `Refund recorded for ${purchase.orderNumber}.`;
  if (code === PURCHASE_EVENTS.REFUND_FAILED) return `Refund failed for ${purchase.orderNumber}.`;
  return `Purchase ${purchase.orderNumber} was updated.`;
}

async function queuePurchaseNotifications(ctx: any, purchase: any, code: PurchaseEventCode, eventId: any) {
  const notificationKey = notificationKeyForEvent(code);
  if (!notificationKey) return;

  const type = notificationTypeForEvent(code);
  const title =
    code === PURCHASE_EVENTS.PAYMENT_SUCCEEDED
      ? "Payment received"
      : code === PURCHASE_EVENTS.PAYMENT_FAILED
        ? "Payment failed"
        : code === PURCHASE_EVENTS.REFUND_CREATED
          ? "Refund recorded"
          : "Purchase updated";
  const message = defaultMessageForPurchaseEvent(code, purchase);
  const metadata = JSON.stringify({
    purchaseOrderId: String(purchase._id),
    sourceType: purchase.sourceType,
    commerceOrderId: purchase.commerceOrderId ? String(purchase.commerceOrderId) : undefined,
    formSubmissionId: purchase.formSubmissionId ? String(purchase.formSubmissionId) : undefined,
    subscriptionInvoiceId: purchase.subscriptionInvoiceId ? String(purchase.subscriptionInvoiceId) : undefined,
  });

  const customerUserId = await getUserIdentifierForPurchase(ctx, purchase);
  if (customerUserId) {
    await ctx.scheduler.runAfter(0, internal.notifications.internals.send, {
      userId: customerUserId,
      notificationKey,
      eventCode: code,
      eventId,
      type,
      title,
      message,
      icon: code === PURCHASE_EVENTS.PAYMENT_SUCCEEDED ? "BadgeCheck" : "ShoppingBag",
      actionUrl: purchaseCustomerUrl(purchase),
      actionLabel: "View Purchase",
      metadata,
      persistent: code === PURCHASE_EVENTS.PAYMENT_FAILED,
      groupKey: `${code}:${purchase._id}`,
    });
  }

  const admins = await resolveRecipients(ctx, "admin");
  if (admins.length > 0) {
    await ctx.scheduler.runAfter(0, internal.notifications.internals.sendBulk, {
      userIds: admins.map((admin) => admin.userId),
      notificationKey,
      eventCode: code,
      eventId,
      type,
      title:
        code === PURCHASE_EVENTS.PAYMENT_SUCCEEDED
          ? `Paid purchase ${purchase.orderNumber}`
          : title,
      message:
        code === PURCHASE_EVENTS.PAYMENT_SUCCEEDED
          ? `${purchase.sourceLabel ?? "Purchase"} ${purchase.orderNumber} paid ${displayAmount(purchase.totalAmount, purchase.currencyCode)}.`
          : message,
      icon: code === PURCHASE_EVENTS.PAYMENT_SUCCEEDED ? "BadgeCheck" : "ShoppingBag",
      actionUrl: purchaseAdminUrl(purchase),
      actionLabel: "Open",
      metadata,
      persistent: code === PURCHASE_EVENTS.PAYMENT_FAILED,
      groupKey: `${code}:admin:${purchase._id}`,
    });
  }

  await queuePurchaseEmails(ctx, purchase, code, eventId, admins);
}

async function queuePurchaseEmails(ctx: any, purchase: any, code: PurchaseEventCode, eventId: any, admins: any[]) {
  const customerUserIdentifier = await getUserIdentifierForPurchase(ctx, purchase);
  const variables = {
    orderNumber: purchase.orderNumber,
    sourceLabel: purchase.sourceLabel ?? "Purchase",
    customerEmail: purchase.email ?? "",
    total: displayAmount(purchase.totalAmount, purchase.currencyCode),
    orderUrl: purchaseCustomerUrl(purchase),
    adminUrl: purchaseAdminUrl(purchase),
  };

  if (code === PURCHASE_EVENTS.PAYMENT_SUCCEEDED && purchase.email) {
    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.PURCHASE_RECEIPT, {
      recipientEmail: purchase.email,
      recipientName: purchase.customerName,
      recipientUserId: customerUserIdentifier ?? undefined,
      variables,
      eventId,
    });
    for (const admin of admins) {
      await queueEmailForEvent(ctx, EMAIL_TEMPLATES.PURCHASE_ADMIN_ALERT, {
        recipientEmail: admin.email,
        recipientName: admin.name,
        recipientUserId: admin.userId,
        variables,
        eventId,
      });
    }
  }

  if (code === PURCHASE_EVENTS.PAYMENT_FAILED && purchase.email) {
    await queueEmailForEvent(ctx, EMAIL_TEMPLATES.PURCHASE_PAYMENT_FAILED, {
      recipientEmail: purchase.email,
      recipientName: purchase.customerName,
      recipientUserId: customerUserIdentifier ?? undefined,
      variables,
      eventId,
    });
  }
}

function commerceLineType(item: any): string {
  const metadata = parseJsonBag(item.metadata);
  if (metadata.lineType === "bundle" || metadata.bundleId) return "bundle";
  if (metadata.courseId) return "course";
  if (item.variantId) return "variant";
  return "product";
}

function extractCourseId(item: any): any {
  const metadata = parseJsonBag(item.metadata);
  return metadata.courseId;
}

async function syncCommerceChildren(ctx: any, purchaseOrderId: any, order: any) {
  const items = await ctx.db
    .query("commerce_order_items")
    .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
    .collect();
  await replacePurchaseLines(
    ctx,
    purchaseOrderId,
    items.map((item: any) => ({
      sourceLineId: String(item._id),
      lineType: commerceLineType(item),
      title: item.productTitle,
      sku: item.sku,
      quantity: item.quantity,
      unitAmount: item.unitPriceAmount,
      lineSubtotalAmount: item.lineSubtotalAmount,
      lineTotalAmount: item.lineTotalAmount,
      currencyCode: order.currencyCode,
      productId: item.productId,
      variantId: item.variantId,
      courseId: extractCourseId(item),
      metadata: item.metadata,
    })),
  );

  const transactions = await ctx.db
    .query("commerce_payment_transactions")
    .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
    .collect();
  await replacePurchasePayments(
    ctx,
    purchaseOrderId,
    transactions.map((transaction: any) => ({
      provider: transaction.provider,
      providerTransactionId: transaction.providerTransactionId,
      providerSessionId: transaction.sessionId ? String(transaction.sessionId) : undefined,
      paymentIntentId: transaction.providerTransactionId,
      status: transaction.status,
      amount: transaction.amount?.amount,
      currencyCode: transaction.amount?.currencyCode ?? order.currencyCode,
      failureCode: transaction.failureCode,
      failureMessage: transaction.failureMessage,
      metadata: {
        source: "commerce_payment_transactions",
        sourceTransactionId: String(transaction._id),
        collectionId: transaction.collectionId ? String(transaction.collectionId) : undefined,
        captureId: transaction.captureId ? String(transaction.captureId) : undefined,
      },
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
    })),
  );

  const refunds = await ctx.db
    .query("commerce_payment_refunds")
    .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
    .collect();
  await replacePurchaseRefunds(
    ctx,
    purchaseOrderId,
    refunds.map((refund: any) => ({
      provider: refund.providerRefundId ? "stripe" : "manual",
      providerRefundId: refund.providerRefundId,
      status: refund.status,
      amount: refund.amount?.amount,
      currencyCode: refund.amount?.currencyCode ?? order.currencyCode,
      reason: refund.reason,
      failureCode: refund.failureCode,
      failureMessage: refund.failureMessage,
      metadata: {
        source: "commerce_payment_refunds",
        sourceRefundId: String(refund._id),
        transactionId: refund.transactionId ? String(refund.transactionId) : undefined,
        returnId: refund.returnId ? String(refund.returnId) : undefined,
      },
      createdAt: refund.createdAt,
      completedAt: mapRefundStatus(refund.status) === "succeeded" ? refund.updatedAt : undefined,
    })),
  );
}

function paidAmountFromCommerce(order: any, transactions: any[]) {
  const transactionTotal = transactions
    .filter((transaction: any) =>
      ["succeeded", "captured", "paid", "partially_refunded", "refunded"].includes(
        String(transaction.status ?? "").toLowerCase(),
      ),
    )
    .reduce((sum: number, transaction: any) => sum + money(transaction.amount?.amount), 0);

  if (transactionTotal > 0) return transactionTotal;
  if (["paid", "refunded", "partially_refunded"].includes(order.paymentStatus)) {
    return money(order.totalAmount);
  }
  return 0;
}

function refundedAmountFromCommerce(refunds: any[]) {
  return refunds
    .filter((refund: any) => ["completed", "succeeded"].includes(String(refund.status ?? "").toLowerCase()))
    .reduce((sum: number, refund: any) => sum + money(refund.amount?.amount), 0);
}

export const syncCommerceOrder = internalMutation({
  args: {
    orderId: v.id("commerce_orders"),
    eventType: v.optional(v.string()),
    message: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const [transactions, refunds, customer] = await Promise.all([
      ctx.db
        .query("commerce_payment_transactions")
        .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
        .collect(),
      ctx.db
        .query("commerce_payment_refunds")
        .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
        .collect(),
      order.customerId ? ctx.db.get(order.customerId) : Promise.resolve(null),
    ]);

    const amountRefunded = refundedAmountFromCommerce(refunds);
    const purchaseOrderId = await upsertPurchaseOrder(ctx, {
      purchaseOrderId: order.purchaseOrderId,
      orderNumber: order.orderNumber,
      sourceType: "storefront_order",
      sourceId: String(order._id),
      sourceLabel: "Storefront order",
      sourceUrl: `/commerce/orders/${order._id}`,
      commerceOrderId: order._id,
      customerId: order.customerId,
      userId: order.userId,
      email: order.email,
      customerName: customer
        ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email
        : undefined,
      status: mapCommerceOrderStatus(order),
      paymentStatus: mapPurchasePaymentStatus(order.paymentStatus),
      fulfillmentStatus: order.fulfillmentStatus,
      currencyCode: normalizeCurrency(order.currencyCode),
      subtotalAmount: money(order.subtotalAmount),
      discountAmount: money(order.discountAmount),
      shippingAmount: money(order.shippingAmount),
      taxAmount: money(order.taxAmount),
      totalAmount: money(order.totalAmount),
      amountPaid: paidAmountFromCommerce(order, transactions),
      amountRefunded,
      placedAt: order.createdAt,
      paidAt: order.paidAt,
      failedAt: order.status === "failed" ? order.updatedAt : undefined,
      cancelledAt: order.status === "cancelled" ? order.updatedAt : undefined,
      refundedAt: amountRefunded > 0 ? order.updatedAt : undefined,
      metadata: {
        checkoutSessionId: order.checkoutSessionId ? String(order.checkoutSessionId) : undefined,
        paymentCollectionId: order.paymentCollectionId ? String(order.paymentCollectionId) : undefined,
        selectedPaymentMethodCode: order.selectedPaymentMethodCode,
        selectedShippingMethodCode: order.selectedShippingMethodCode,
      },
    });

    if (order.purchaseOrderId !== purchaseOrderId) {
      await ctx.db.patch(order._id, {
        purchaseOrderId,
        updatedAt: Date.now(),
      });
    }

    await syncCommerceChildren(ctx, purchaseOrderId, order);
    await emitPurchaseLifecycle(ctx, purchaseOrderId, args.eventType, args.message, args.metadata);
    return purchaseOrderId;
  },
});

function formOrderStatusFromPayment(status: string): string {
  const normalized = String(status ?? "").toLowerCase();
  if (["succeeded", "paid", "captured"].includes(normalized)) return "paid";
  if (["failed", "declined"].includes(normalized)) return "payment_failed";
  if (["refunded"].includes(normalized)) return "refunded";
  if (["partially_refunded"].includes(normalized)) return "partially_refunded";
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  return "pending_payment";
}

function purchaseStatusFromFormOrder(status: string): string {
  if (status === "paid") return "paid";
  if (status === "payment_failed") return "payment_failed";
  if (status === "refunded") return "refunded";
  if (status === "partially_refunded") return "partially_refunded";
  if (status === "cancelled") return "cancelled";
  return "payment_pending";
}

function normalizeFormLines(lineItems: any[], context: any) {
  return lineItems
    .map((line: any, index: number) => {
      const amount = money(line?.amount ?? line?.lineTotalAmount ?? line?.totalAmount);
      if (amount <= 0) return null;
      return {
        sourceLineId: line?.fieldKey
          ? `${line.fieldKey}:${line.choiceValue ?? index}`
          : `form-line:${index}`,
        lineType: "form_choice",
        title: String(line?.label ?? line?.fieldLabel ?? "Form selection"),
        subtitle: typeof line?.choiceValue === "string" ? line.choiceValue : undefined,
        quantity: Number.isFinite(Number(line?.quantity)) ? Number(line.quantity) : 1,
        unitAmount: amount,
        lineSubtotalAmount: amount,
        lineTotalAmount: amount,
        currencyCode: context.currencyCode,
        formId: context.formId,
        formSubmissionId: context.submissionId,
        metadata: line,
      };
    })
    .filter(Boolean);
}

function findEmailInValues(fields: any[], values: Record<string, string>): string | undefined {
  for (const field of fields) {
    if (field.type !== "email") continue;
    const email = normalizeEmail(values[field.key]);
    if (email) return email;
  }
  for (const value of Object.values(values)) {
    const email = normalizeEmail(value);
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  }
  return undefined;
}

async function resolveFormCustomerEmail(ctx: any, submission: any, form: any, orderPayment: any) {
  const fromPayment = normalizeEmail(orderPayment.customerEmail);
  if (fromPayment) return fromPayment;
  const values: Record<string, string> = {};
  const rows = await ctx.db
    .query("fieldValues")
    .withIndex("by_entity", (q: any) =>
      q.eq("entityType", "form_submission").eq("entityId", submission._id as string),
    )
    .collect();
  for (const row of rows) values[row.fieldKey] = row.value;
  const fields = form.fieldGroupId
    ? await ctx.db
        .query("fieldDefinitions")
        .withIndex("by_group", (q: any) => q.eq("groupId", form.fieldGroupId))
        .collect()
    : [];
  return findEmailInValues(fields, values);
}

export const syncFormOrder = internalMutation({
  args: {
    submissionId: v.id("form_submissions"),
    paymentIntentId: v.optional(v.string()),
    provider: v.optional(v.string()),
    status: v.optional(v.string()),
    error: v.optional(v.string()),
    eventType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) return null;
    const form = await ctx.db.get(submission.formId);
    if (!form) return null;

    const meta = parseJsonBag(submission.meta);
    const pricing = parseJsonBag(meta.pricing);
    const orderPayment = parseJsonBag(meta.orderPayment);
    const amount = money(pricing.oneTime ?? orderPayment.amount);
    if (amount <= 0) return null;

    const currencyCode = normalizeCurrency(pricing.currency ?? orderPayment.currency);
    const paymentIntentId = args.paymentIntentId ?? orderPayment.paymentIntentId;
    const paymentStatus = args.status ?? orderPayment.status ?? "pending";
    const status = formOrderStatusFromPayment(paymentStatus);
    const customerEmail = await resolveFormCustomerEmail(ctx, submission, form, orderPayment);
    const now = Date.now();

    const existingFormOrder = await ctx.db
      .query("form_orders")
      .withIndex("by_submission", (q: any) => q.eq("submissionId", submission._id))
      .first();
    const formOrderPatch = {
      formId: form._id,
      submissionId: submission._id,
      status,
      currencyCode,
      subtotalAmount: amount,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: amount,
      amountPaid: status === "paid" ? amount : 0,
      amountRefunded: 0,
      paymentProvider: args.provider ?? "stripe",
      paymentIntentId,
      customerEmail,
      lineItems: Array.isArray(pricing.lineItems) ? pricing.lineItems : [],
      metadata: {
        orderPayment,
        error: args.error,
      },
      paidAt: status === "paid" ? now : existingFormOrder?.paidAt,
      failedAt: status === "payment_failed" ? now : existingFormOrder?.failedAt,
      updatedAt: now,
    };

    const formOrderId = existingFormOrder
      ? existingFormOrder._id
      : await ctx.db.insert("form_orders", {
          ...formOrderPatch,
          purchaseOrderId: undefined,
          createdAt: now,
        });
    if (existingFormOrder) await ctx.db.patch(existingFormOrder._id, formOrderPatch);

    const purchaseOrderId = await upsertPurchaseOrder(ctx, {
      purchaseOrderId: existingFormOrder?.purchaseOrderId,
      orderNumber: `FORM-${String(submission._id).slice(-8).toUpperCase()}`,
      sourceType: "form_order",
      sourceId: String(submission._id),
      sourceLabel: form.title,
      sourceUrl: `/forms/${form._id}/entries/${submission._id}`,
      formId: form._id,
      formSubmissionId: submission._id,
      formOrderId,
      userId: submission.userId,
      email: customerEmail,
      status: purchaseStatusFromFormOrder(status),
      paymentStatus: mapPurchasePaymentStatus(status === "paid" ? "paid" : status),
      fulfillmentStatus: "not_required",
      currencyCode,
      subtotalAmount: amount,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 0,
      totalAmount: amount,
      amountPaid: status === "paid" ? amount : 0,
      amountRefunded: 0,
      placedAt: submission.completedAt ?? submission.submittedAt ?? submission.createdAt,
      paidAt: status === "paid" ? now : existingFormOrder?.paidAt,
      failedAt: status === "payment_failed" ? now : existingFormOrder?.failedAt,
      metadata: {
        formTitle: form.title,
        submissionId: String(submission._id),
        orderPayment,
      },
    });

    const refreshedFormOrder = await ctx.db.get(formOrderId);
    if (refreshedFormOrder?.purchaseOrderId !== purchaseOrderId) {
      await ctx.db.patch(formOrderId, { purchaseOrderId, updatedAt: now });
    }

    const lines = normalizeFormLines(Array.isArray(pricing.lineItems) ? pricing.lineItems : [], {
      currencyCode,
      formId: form._id,
      submissionId: submission._id,
    });
    await replacePurchaseLines(ctx, purchaseOrderId, lines.length > 0 ? lines : [
      {
        sourceLineId: "form-total",
        lineType: "custom",
        title: form.title,
        quantity: 1,
        unitAmount: amount,
        lineSubtotalAmount: amount,
        lineTotalAmount: amount,
        currencyCode,
        formId: form._id,
        formSubmissionId: submission._id,
      },
    ]);
    await replacePurchasePayments(ctx, purchaseOrderId, paymentIntentId ? [
      {
        provider: args.provider ?? "stripe",
        providerTransactionId: paymentIntentId,
        paymentIntentId,
        status: paymentStatus,
        amount,
        currencyCode,
        failureMessage: args.error,
        metadata: {
          source: "form_order_payment",
          submissionId: String(submission._id),
        },
        createdAt: now,
        completedAt: status === "paid" ? now : undefined,
      },
    ] : []);
    await replacePurchaseRefunds(ctx, purchaseOrderId, []);
    await emitPurchaseLifecycle(ctx, purchaseOrderId, args.eventType, undefined, {
      paymentIntentId,
      error: args.error,
    });
    return purchaseOrderId;
  },
});

function intentOrderStatus(intent: any): string {
  if (intent.status === "failed" || intent.status === "cancelled") return "payment_failed";
  if (intent.status === "activated") return "paid";
  return "payment_pending";
}

export const syncSubscriptionCheckoutIntent = internalMutation({
  args: {
    intentId: v.id("commerce_subscription_checkout_intents"),
    eventType: v.optional(v.string()),
    message: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) return null;
    const subscription = intent.subscriptionId ? await ctx.db.get(intent.subscriptionId) : null;
    const user = intent.userId
      ? await ctx.db.get(intent.userId)
      : subscription?.userId
        ? await ctx.db.get(subscription.userId)
        : null;
    const pricing = parseJsonBag(intent.pricingSnapshot);
    const amount = money(intent.initialAmount);
    const currencyCode = normalizeCurrency(intent.currencyCode);
    const status = intentOrderStatus(intent);
    const now = Date.now();

    const lines = [];
    const setupFeeAmount = money(intent.setupFeeAmount ?? pricing.setupFeeAmount);
    const recurringCharged = Math.max(0, amount - setupFeeAmount);
    if (setupFeeAmount > 0) {
      lines.push({
        sourceLineId: "setup-fee",
        lineType: "setup_fee",
        title: `${pricing.offerTitle ?? "Subscription"} setup fee`,
        quantity: 1,
        unitAmount: setupFeeAmount,
        lineSubtotalAmount: setupFeeAmount,
        lineTotalAmount: setupFeeAmount,
        currencyCode,
        subscriptionId: subscription?._id,
        metadata: { intentId: String(intent._id), offerId: pricing.offerId },
      });
    }
    if (recurringCharged > 0 || lines.length === 0) {
      lines.push({
        sourceLineId: "initial-subscription",
        lineType: "subscription",
        title: pricing.offerTitle ?? "Initial subscription charge",
        quantity: 1,
        unitAmount: recurringCharged || amount,
        lineSubtotalAmount: recurringCharged || amount,
        lineTotalAmount: recurringCharged || amount,
        currencyCode,
        subscriptionId: subscription?._id,
        metadata: { intentId: String(intent._id), offerId: pricing.offerId },
      });
    }

    const purchaseOrderId = await upsertPurchaseOrder(ctx, {
      purchaseOrderId: intent.purchaseOrderId,
      orderNumber: `SUB-${String(intent._id).slice(-8).toUpperCase()}`,
      sourceType: "subscription_signup",
      sourceId: String(intent._id),
      sourceLabel: pricing.offerTitle ?? "Subscription signup",
      sourceUrl: subscription
        ? `/commerce/subscriptions/contracts/${subscription._id}`
        : `/commerce/subscriptions`,
      subscriptionId: subscription?._id,
      subscriptionCheckoutIntentId: intent._id,
      customerId: intent.customerId,
      userId: intent.userId ?? subscription?.userId,
      email: intent.email ?? user?.email,
      customerName: user
        ? user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email)
        : undefined,
      status,
      paymentStatus: mapPurchasePaymentStatus(status === "paid" ? "paid" : status),
      fulfillmentStatus: "not_required",
      currencyCode,
      subtotalAmount: amount,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 0,
      totalAmount: amount,
      amountPaid: status === "paid" ? amount : 0,
      amountRefunded: 0,
      placedAt: intent.createdAt,
      paidAt: status === "paid" ? intent.updatedAt ?? now : undefined,
      failedAt: status === "payment_failed" ? intent.updatedAt ?? now : undefined,
      metadata: {
        pricingSnapshot: intent.pricingSnapshot,
        paymentProvider: intent.paymentProvider,
        savedPaymentMethodId: intent.savedPaymentMethodId,
      },
    });

    if (intent.purchaseOrderId !== purchaseOrderId) {
      await ctx.db.patch(intent._id, { purchaseOrderId, updatedAt: now });
    }
    await replacePurchaseLines(ctx, purchaseOrderId, lines);
    await replacePurchasePayments(ctx, purchaseOrderId, intent.paymentTransactionId ? [
      {
        provider: intent.paymentProvider ?? "stripe",
        providerTransactionId: intent.paymentTransactionId,
        paymentIntentId: intent.paymentTransactionId,
        status: status === "paid" ? "paid" : status,
        amount,
        currencyCode,
        metadata: {
          source: "commerce_subscription_checkout_intents",
          intentId: String(intent._id),
        },
        createdAt: intent.createdAt,
        completedAt: status === "paid" ? intent.updatedAt ?? now : undefined,
      },
    ] : []);
    await replacePurchaseRefunds(ctx, purchaseOrderId, []);
    await emitPurchaseLifecycle(ctx, purchaseOrderId, args.eventType, args.message, args.metadata);
    return purchaseOrderId;
  },
});

function invoiceOrderStatus(invoice: any): string {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "failed" || invoice.status === "void") return "payment_failed";
  if (invoice.status === "cancelled" || invoice.status === "canceled") return "cancelled";
  return "payment_pending";
}

export const syncSubscriptionInvoice = internalMutation({
  args: {
    invoiceId: v.id("commerce_subscription_invoices"),
    eventType: v.optional(v.string()),
    message: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    const subscription = await ctx.db.get(invoice.subscriptionId);
    if (!subscription) return null;
    const user = subscription.userId ? await ctx.db.get(subscription.userId) : null;

    const items = await ctx.db
      .query("commerce_subscription_invoice_items")
      .withIndex("by_invoice", (q: any) => q.eq("invoiceId", invoice._id))
      .collect();
    const status = invoiceOrderStatus(invoice);
    const currencyCode = normalizeCurrency(invoice.currencyCode);
    const totalAmount = money(invoice.totalAmount);
    const now = Date.now();

    const purchaseOrderId = await upsertPurchaseOrder(ctx, {
      purchaseOrderId: invoice.purchaseOrderId,
      orderNumber: invoice.invoiceNumber ?? `INV-${String(invoice._id).slice(-8).toUpperCase()}`,
      sourceType: "subscription_invoice",
      sourceId: String(invoice._id),
      sourceLabel: invoice.invoiceNumber
        ? `Subscription invoice ${invoice.invoiceNumber}`
        : "Subscription invoice",
      sourceUrl: `/commerce/subscriptions/invoices/${invoice._id}`,
      subscriptionId: subscription._id,
      subscriptionCheckoutIntentId: invoice.checkoutIntentId,
      subscriptionInvoiceId: invoice._id,
      customerId: subscription.customerId,
      userId: subscription.userId,
      email: user?.email,
      customerName: user
        ? user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email)
        : undefined,
      status,
      paymentStatus: mapPurchasePaymentStatus(status === "paid" ? "paid" : status),
      fulfillmentStatus: "not_required",
      currencyCode,
      subtotalAmount: money(invoice.subtotalAmount),
      discountAmount: Math.max(0, money(invoice.subtotalAmount) + money(invoice.taxAmount) - totalAmount),
      shippingAmount: 0,
      taxAmount: money(invoice.taxAmount),
      totalAmount,
      amountPaid: status === "paid" ? totalAmount : 0,
      amountRefunded: 0,
      placedAt: invoice.createdAt,
      paidAt: invoice.paidAt,
      failedAt: status === "payment_failed" ? invoice.updatedAt ?? now : undefined,
      metadata: {
        sourceChannel: invoice.sourceChannel,
        paymentProvider: invoice.paymentProvider,
        savedPaymentMethodId: invoice.savedPaymentMethodId,
        manualBilling: invoice.manualBilling,
      },
    });

    if (invoice.purchaseOrderId !== purchaseOrderId) {
      await ctx.db.patch(invoice._id, { purchaseOrderId, updatedAt: now });
    }
    await replacePurchaseLines(
      ctx,
      purchaseOrderId,
      items.map((item: any) => ({
        sourceLineId: String(item._id),
        lineType: item.lineType === "setup_fee" ? "setup_fee" : "subscription",
        title: item.description,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        lineSubtotalAmount: item.lineTotalAmount,
        lineTotalAmount: item.lineTotalAmount,
        currencyCode: item.currencyCode ?? currencyCode,
        subscriptionId: subscription._id,
        subscriptionInvoiceId: invoice._id,
        metadata: item.metadata,
      })),
    );
    await replacePurchasePayments(ctx, purchaseOrderId, invoice.paymentTransactionId ? [
      {
        provider: invoice.paymentProvider ?? subscription.paymentProvider ?? "stripe",
        providerTransactionId: invoice.paymentTransactionId,
        paymentIntentId: invoice.paymentTransactionId,
        status: status === "paid" ? "paid" : status,
        amount: totalAmount,
        currencyCode,
        metadata: {
          source: "commerce_subscription_invoices",
          invoiceId: String(invoice._id),
          subscriptionId: String(subscription._id),
        },
        createdAt: invoice.createdAt,
        completedAt: invoice.paidAt,
      },
    ] : []);
    await replacePurchaseRefunds(ctx, purchaseOrderId, []);
    await emitPurchaseLifecycle(ctx, purchaseOrderId, args.eventType, args.message, args.metadata);
    return purchaseOrderId;
  },
});
