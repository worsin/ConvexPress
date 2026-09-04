import type { DashboardPageModule } from "../../contracts";
import { SecurityPage } from "./SecurityPage";

const module: DashboardPageModule = {
  id: "security",
  Page: () => <SecurityPage />,
};

export default module;
