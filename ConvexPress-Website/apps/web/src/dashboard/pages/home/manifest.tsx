/**
 * Home = the member's widget grid. Everything on it comes from the layout
 * (api.extensions.dashboard.queries.myLayout) and the widget registry.
 */
import type { DashboardPageModule } from "../../contracts";
import { WidgetGrid } from "../../WidgetGrid";

const module: DashboardPageModule = {
  id: "home",
  Page: () => <WidgetGrid />,
};

export default module;
