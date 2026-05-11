import type { Id } from "@backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";

import { CommerceProductEditor } from "@/components/commerce/CommerceProductEditor";

export const Route = createFileRoute(
	"/_authenticated/_admin/commerce/products/$productId",
)({
	component: CommerceEditProductPage,
});

function CommerceEditProductPage() {
	const { productId } = Route.useParams();

	return (
		<CommerceProductEditor
			mode="edit"
			productId={productId as Id<"commerce_products">}
		/>
	);
}
