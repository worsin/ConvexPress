/**
 * Edit a subscription coupon. `adminCatalog.getCouponEditor` supplies the
 * coupon with its redemptions; `CouponEditor` holds the form.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ArrowLeft } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { useBreadcrumbTitle } from "@/lib/admin-shell/breadcrumb-titles";
import { asId } from "@/lib/utils";
import { CouponEditor } from "@/components/subscriptions/catalog/CouponEditor";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/coupons/$couponId/edit")({
  component: EditCouponPage,
});

function EditCouponPage() {
  const { couponId } = Route.useParams();
  const editor = useQuery(api.commerceSubscriptions.adminCatalog.getCouponEditor, { couponId: asId<"commerce_subscription_coupons">(couponId) });
  useBreadcrumbTitle(couponId, editor?.code);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/commerce/subscriptions/coupons" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to coupons
        </Link>
        <h1 className="mt-2 font-mono text-3xl font-bold tracking-tight">{editor ? editor.code : "Coupon"}</h1>
      </div>
      {editor === undefined ? (
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      ) : editor === null ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">This coupon was not found.</div>
      ) : (
        <CouponEditor key={editor._id} existing={editor} />
      )}
    </div>
  );
}
