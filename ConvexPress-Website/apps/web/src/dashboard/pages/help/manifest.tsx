import type { DashboardPageModule } from "../../contracts";
import { HelpPage } from "./HelpPage";

const module: DashboardPageModule = {
  id: "help",
  Page: () => <HelpPage />,
};

export default module;
