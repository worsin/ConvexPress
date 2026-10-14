/**
 * Edit a subscription offer. `adminCatalog.getOfferEditor` supplies the offer
 * with its use and locks; `OfferEditor` holds the form.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ArrowLeft } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { useBreadcrumbTitle } from "@/lib/admin-shell/breadcrumb-titles";
import { asId } from "@/lib/utils";
import { OfferEditor } from "@/components/subscriptions/catalog/OfferEditor";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/offers/$offerId/edit")({
  component: EditOfferPage,
});

function EditOfferPage() {
  const { offerId } = Route.useParams();
  const editor = useQuery(api.commerceSubscriptions.adminCatalog.getOfferEditor, { offerId: asId<"commerce_subscription_offers">(offerId) });
  useBreadcrumbTitle(offerId, editor?.offer.title);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/commerce/subscriptions/offers" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to offers
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{editor ? editor.offer.title : "Offer"}</h1>
      </div>
      {editor === undefined ? (
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      ) : editor === null ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">This offer was not found.</div>
      ) : (
        // Remount when another offer opens, so the form starts from its values.
        <OfferEditor key={editor.offer._id} existing={editor} />
      )}
    </div>
  );
}
