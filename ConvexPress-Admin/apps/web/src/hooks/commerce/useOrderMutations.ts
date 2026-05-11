/**
 * Commerce — Order Mutations Hook
 *
 * Wraps bulk + per-row mutations with toast feedback.
 */

import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@backend/convex/_generated/dataModel";

export function useOrderMutations() {
  const bulkUpdateStatus = useMutation((api as any).commerce.orders.bulkUpdateStatus);
  const bulkCancel = useMutation((api as any).commerce.orders.bulkCancel);
  const updateStatus = useMutation((api as any).commerce.orders.updateStatus);

  return {
    async bulkUpdateOrderStatus(orderIds: Id<"commerce_orders">[], status: string) {
      try {
        const res = await bulkUpdateStatus({ orderIds, status });
        toast.success(`${res.count} orders updated to ${status}.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk update failed.");
      }
    },

    async bulkCancelOrders(orderIds: Id<"commerce_orders">[]) {
      try {
        const res = await bulkCancel({ orderIds });
        toast.success(`${res.count} orders cancelled.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk cancel failed.");
      }
    },

    async updateOrderStatus(orderId: Id<"commerce_orders">, status: string) {
      try {
        await updateStatus({ orderId, status });
        toast.success(`Order updated to ${status}.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed.");
      }
    },
  };
}
