/**
 * Commerce — Discount Mutations Hook
 */

import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@backend/convex/_generated/dataModel";

export function useDiscountMutations() {
  const bulkSetStatus = useMutation((api as any)["commerce/discounts"].bulkSetStatus);
  const bulkDelete = useMutation((api as any)["commerce/discounts"].bulkDelete);
  const removeDiscount = useMutation((api as any)["commerce/discounts"].remove);
  const updateDiscount = useMutation((api as any)["commerce/discounts"].update);

  return {
    async bulkActivate(discountIds: Id<"commerce_discount_codes">[]) {
      try {
        const res = await bulkSetStatus({ discountIds, status: "active" });
        toast.success(`${res.count} discounts activated.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk activate failed.");
      }
    },
    async bulkDeactivate(discountIds: Id<"commerce_discount_codes">[]) {
      try {
        const res = await bulkSetStatus({ discountIds, status: "inactive" });
        toast.success(`${res.count} discounts deactivated.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk deactivate failed.");
      }
    },
    async bulkDeleteDiscounts(discountIds: Id<"commerce_discount_codes">[]) {
      try {
        const res = await bulkDelete({ discountIds });
        toast.success(`${res.count} discounts deleted.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk delete failed.");
      }
    },
    async toggleStatus(id: Id<"commerce_discount_codes">, currentStatus: string) {
      try {
        const newStatus = currentStatus === "active" ? "inactive" : "active";
        await updateDiscount({ discountId: id, status: newStatus });
        toast.success(`Discount ${newStatus}.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed.");
      }
    },
    async deleteOne(id: Id<"commerce_discount_codes">) {
      try {
        await removeDiscount({ discountId: id });
        toast.success("Discount deleted.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed.");
      }
    },
  };
}
