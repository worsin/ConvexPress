import type { DashboardPageModule } from "../../contracts";
import { DashboardReviewsPage } from "./ReviewsPage";

const module: DashboardPageModule = {
  id: "reviews",
  Page: () => <DashboardReviewsPage />,
};

export default module;
