import { describe, expect, test } from "bun:test";

import {
  appendRefundFailureNote,
  buildRecordedRefundInsert,
  buildRefundCompletionOutcome,
  shouldApplyRefundCompletion,
} from "../refundLifecycle";
import { EMAIL_TEMPLATES } from "../../helpers/email";
import { RETURN_EVENTS } from "../../events/constants";

describe("refund lifecycle helpers", () => {
  test("applies provider completion only to pending refunds", () => {
    expect(shouldApplyRefundCompletion("refund_pending")).toBe(true);
    expect(shouldApplyRefundCompletion("refunded")).toBe(false);
    expect(shouldApplyRefundCompletion("received")).toBe(false);
  });

  test("builds ledger insert for manually recorded refunds", () => {
    expect(
      buildRecordedRefundInsert({
        orderId: "ord_1",
        amount: 1299,
        currencyCode: "USD",
        returnNumber: "RMA-1",
        refundMethod: "store_credit",
        createdBy: "admin_1",
        now: 1000,
      }),
    ).toEqual({
      orderId: "ord_1",
      amount: {
        amount: 1299,
        currencyCode: "USD",
      },
      reason: "Return RMA-1: store_credit",
      status: "succeeded",
      createdBy: "admin_1",
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  test("builds success outcome for completed provider refunds", () => {
    const outcome = buildRefundCompletionOutcome({
      returnRequest: {
        _id: "ret_123",
        status: "refund_pending",
        orderId: "ord_123",
        returnNumber: "RMA-123",
        refundAmount: 2599,
        refundMethod: "original_payment",
      },
      orderNumber: "1001",
      success: true,
      now: 500,
    });

    expect(outcome.patch).toEqual({
      status: "refunded",
      refundFailureReason: undefined,
      refundedAt: 500,
      updatedAt: 500,
    });
    expect(outcome.history).toEqual({
      eventType: "refund_succeeded",
      fromStatus: "refund_pending",
      toStatus: "refunded",
      metadata: {
        refundAmount: 2599,
        refundMethod: "original_payment",
      },
    });
    expect(outcome.emittedEvent).toEqual({
      code: RETURN_EVENTS.REFUNDED,
      payload: {
        returnId: "ret_123",
        returnNumber: "RMA-123",
        orderId: "ord_123",
        orderNumber: "1001",
        refundAmount: "2599",
        refundMethod: "original_payment",
      },
    });
    expect(outcome.customerNotification.notificationKey).toBe("return_refunded");
    expect(outcome.customerEmailTemplate).toBe(EMAIL_TEMPLATES.RETURN_REFUNDED);
    expect(outcome.orderHistory).toEqual({
      eventType: "refund_processed",
      message: "Refund completed for return RMA-123",
      metadata: {
        returnId: "ret_123",
        refundAmount: 2599,
        refundMethod: "original_payment",
      },
      createdAt: 500,
    });
  });

  test("builds failure outcome that reopens the return to received", () => {
    const outcome = buildRefundCompletionOutcome({
      returnRequest: {
        _id: "ret_456",
        status: "refund_pending",
        orderId: "ord_456",
        returnNumber: "RMA-456",
        refundAmount: 999,
        refundMethod: "original_payment",
        notes: "Warehouse verified package.",
      },
      orderNumber: "1002",
      success: false,
      error: "card network timeout",
      now: 900,
    });

    expect(outcome.patch).toEqual({
      status: "received",
      refundFailureReason: "card network timeout",
      notes: "Warehouse verified package.\n\nRefund failed: card network timeout",
      updatedAt: 900,
    });
    expect(outcome.history).toEqual({
      eventType: "refund_failed",
      fromStatus: "refund_pending",
      toStatus: "received",
      note: "card network timeout",
      metadata: {
        refundAmount: 999,
        refundMethod: "original_payment",
      },
    });
    expect(outcome.emittedEvent).toEqual({
      code: RETURN_EVENTS.REFUND_FAILED,
      payload: {
        returnId: "ret_456",
        returnNumber: "RMA-456",
        orderId: "ord_456",
        orderNumber: "1002",
        errorMessage: "card network timeout",
      },
    });
    expect(outcome.adminNotification.notificationKey).toBe("return_refund_failed");
    expect(outcome.adminNotification.groupKey).toBe("return-refund-failed-ret_456");
    expect(outcome.adminEmailTemplate).toBe(
      EMAIL_TEMPLATES.RETURN_REFUND_FAILED,
    );
  });

  test("appends a generic failure note when provider error is missing", () => {
    expect(appendRefundFailureNote(undefined, undefined)).toBe("Refund failed.");
    expect(appendRefundFailureNote("Existing", undefined)).toBe(
      "Existing\n\nRefund failed.",
    );
  });
});
