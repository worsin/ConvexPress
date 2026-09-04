/**
 * Home = the member's widget grid. Everything on it comes from the layout
 * (api.extensions.dashboard.queries.myLayout) and the widget registry; the
 * loader hands the resolved layout to the `dashboard.home` surface.
 */
import type { DashboardPageModule } from "../../contracts";
import { DashboardHomePage } from "./HomePage";

const module: DashboardPageModule = {
  id: "home",
  Page: () => <DashboardHomePage />,
};

export default module;
