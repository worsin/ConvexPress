import { defineDataBlock } from "../../../../sdk/block-renderer/model";
import "../owned.css";
import LibraryCategoryTiles from "../../../../sdk/block-renderer/category-tiles";
export default defineDataBlock(
	"commerce/category-tiles",
	"commerce.categoryTiles",
	(props) => (
		<div className="depot-categories">
			<LibraryCategoryTiles.View {...props} />
		</div>
	),
);
