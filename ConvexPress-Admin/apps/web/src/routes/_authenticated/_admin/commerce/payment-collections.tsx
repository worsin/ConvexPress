import { createFileRoute } from "@tanstack/react-router";
import { PaymentCollectionsPage } from "@/components/commerce/EnterpriseCommercePages";

export const Route = createFileRoute("/_authenticated/_admin/commerce/payment-collections")({
  component: PaymentCollectionsPage,
});
