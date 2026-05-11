/**
 * Commerce — Product Mutations Hook
 */

import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@backend/convex/_generated/dataModel";

export function useProductMutations() {
  const bulkUpdateStatus = useMutation((api as any)["commerce/products"].bulkUpdateStatus);
  const bulkTrash = useMutation((api as any)["commerce/products"].bulkTrash);
  const bulkRestore = useMutation((api as any)["commerce/products"].bulkRestore);
  const bulkDelete = useMutation((api as any)["commerce/products"].bulkDelete);

  return {
    async bulkUpdateProductStatus(productIds: Id<"commerce_products">[], status: string) {
      try {
        const res = await bulkUpdateStatus({ productIds, status });
        toast.success(`${res.updated ?? res.count ?? productIds.length} products updated.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk update failed.");
      }
    },

    async bulkTrashProducts(productIds: Id<"commerce_products">[]) {
      try {
        const res = await bulkTrash({ productIds });
        toast.success(`${res.count} products moved to trash.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk trash failed.");
      }
    },

    async bulkRestoreProducts(productIds: Id<"commerce_products">[]) {
      try {
        const res = await bulkRestore({ productIds });
        toast.success(`${res.count} products restored.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk restore failed.");
      }
    },

    async bulkDeleteProducts(productIds: Id<"commerce_products">[]) {
      try {
        const res = await bulkDelete({ productIds });
        toast.success(`${res.deleted ?? res.count ?? productIds.length} products permanently deleted.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk delete failed.");
      }
    },
  };
}
