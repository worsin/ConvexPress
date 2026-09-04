import type { DashboardPageModule } from "../../contracts";
import { DashboardWishlistPage } from "./WishlistPage";

const module: DashboardPageModule = {
  id: "wishlist",
  Page: () => <DashboardWishlistPage />,
};

export default module;
