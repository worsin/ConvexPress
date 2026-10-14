/**
 * New subscription offer. The editor (`OfferEditor`) holds the form; this
 * route frames it.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { OfferEditor } from "@/components/subscriptions/catalog/OfferEditor";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/offers/new")({
  component: NewOfferPage,
});

function NewOfferPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link to="/commerce/subscriptions/offers" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to offers
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">New offer</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">An offer is a package customers subscribe to: its price, what it grants, and where it is sold.</p>
      </div>
      <OfferEditor />
    </div>
  );
}
