/**
 * New subscription coupon. The editor (`CouponEditor`) holds the form.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { CouponEditor } from "@/components/subscriptions/catalog/CouponEditor";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/coupons/new")({
  component: NewCouponPage,
});

function NewCouponPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/commerce/subscriptions/coupons" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to coupons
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">New coupon</h1>
      </div>
      <CouponEditor />
    </div>
  );
}
