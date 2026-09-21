import { defineDataBlock } from "../../../../sdk/block-renderer/model";
import "../owned.css";
import LibraryProductShowcase from "../../../../sdk/block-renderer/product-showcase";
export default defineDataBlock(
	"commerce/product-showcase",
	"commerce.productShowcase",
	(props) => (
		<div className="depot-products">
			<LibraryProductShowcase.View {...props} />
		</div>
	),
);
