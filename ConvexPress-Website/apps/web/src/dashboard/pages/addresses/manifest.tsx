import type { DashboardPageModule } from "../../contracts";
import { DashboardAddressesPage } from "./AddressesPage";

const module: DashboardPageModule = {
  id: "addresses",
  Page: () => <DashboardAddressesPage />,
};

export default module;
