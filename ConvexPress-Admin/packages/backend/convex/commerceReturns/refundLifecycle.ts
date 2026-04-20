import { EMAIL_TEMPLATES } from "../helpers/email";
import { RETURN_EVENTS } from "../events/constants";

export function appendRefundFailureNote(
  existingNotes: string | undefined,
  error: string | undefined,
) {
  const nextNote = error ? `Refund failed: ${error}` : "Refund failed.";
  return existingNotes ? `${existingNotes}\n\n${nextNote}` : nextNote;
}

export function shouldApplyRefundCompletion(status: string) {
  return status === "refund_pending";
}

export function buildRecordedRefundInsert(args: {
  orderId: string;
  amount: number;
  currencyCode: string;
  returnNumber: string;
  refundMethod: string;
  createdBy?: string;
  now: number;
}) {
  return {
    orderId: args.orderId,
    amount: {
      amount: args.amount,
      currencyCode: args.currencyCode,
    },
    reason: `Return ${args.returnNumber}: ${args.refundMethod}`,
    status: "succeeded",
    createdBy: args.createdBy,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

export function buildRefundCompletionOutcome(args: {
  returnRequest: {
    _id: string;
    status: string;
    orderId: string;
    returnNumber: string;
    refundAmount?: number;
    refundMethod?: string;
    notes?: string;
  };
  orderNumber?: string;
  success: boolean;
  error?: string;
  now: number;
}) {
  const { returnRequest, orderNumber, success, error, now } = args;

  if (success) {
    return {
      patch: {
        status: "refunded",
        refundFailureReason: undefined,
        refundedAt: now,
        updatedAt: now,
      },
      history: {
        eventType: "refund_succeeded",
        fromStatus: returnRequest.status,
        toStatus: "refunded",
        metadata: {
          refundAmount: returnRequest.refundAmount,
          refundMethod: returnRequest.refundMethod,
        },
      },
      emittedEvent: {
        code: RETURN_EVENTS.REFUNDED,
        payload: {
          returnId: returnRequest._id,
          returnNumber: returnRequest.returnNumber,
          orderId: returnRequest.orderId,
          orderNumber: orderNumber ?? "",
          refundAmount: String(returnRequest.refundAmount ?? ""),
          refundMethod: returnRequest.refundMethod ?? "",
        },
      },
      customerNotification: {
        notificationKey: "return_refunded",
        eventCode: RETURN_EVENTS.REFUNDED,
        type: "success",
        title: "Your refund has been completed",
        message: `Refund completed for return ${returnRequest.returnNumber}.`,
        icon: "DollarSign",
        persistent: true,
        metadata: {
          returnId: returnRequest._id,
          refundAmount: returnRequest.refundAmount,
        },
      },
      customerEmailTemplate: EMAIL_TEMPLATES.RETURN_REFUNDED,
      orderHistory: {
        eventType: "refund_processed",
        message: `Refund completed for return ${returnRequest.returnNumber}`,
        metadata: {
          returnId: returnRequest._id,
          refundAmount: returnRequest.refundAmount,
          refundMethod: returnRequest.refundMethod,
        },
        createdAt: now,
      },
    } as const;
  }

  return {
    patch: {
      status: "received",
      refundFailureReason: error,
      notes: appendRefundFailureNote(returnRequest.notes, error),
      updatedAt: now,
    },
    history: {
      eventType: "refund_failed",
      fromStatus: returnRequest.status,
      toStatus: "received",
      note: error,
      metadata: {
        refundAmount: returnRequest.refundAmount,
        refundMethod: returnRequest.refundMethod,
      },
    },
    emittedEvent: {
      code: RETURN_EVENTS.REFUND_FAILED,
      payload: {
        returnId: returnRequest._id,
        returnNumber: returnRequest.returnNumber,
        orderId: returnRequest.orderId,
        orderNumber: orderNumber ?? "",
        errorMessage: error ?? "",
      },
    },
    adminNotification: {
      notificationKey: "return_refund_failed",
      eventCode: RETURN_EVENTS.REFUND_FAILED,
      type: "error",
      title: "Return refund failed",
      message: `Refund failed for return ${returnRequest.returnNumber}.`,
      icon: "TriangleAlert",
      persistent: true,
      groupKey: `return-refund-failed-${returnRequest._id}`,
      metadata: {
        returnId: returnRequest._id,
        errorMessage: error,
      },
    },
    adminEmailTemplate: EMAIL_TEMPLATES.RETURN_REFUND_FAILED,
  } as const;
}
