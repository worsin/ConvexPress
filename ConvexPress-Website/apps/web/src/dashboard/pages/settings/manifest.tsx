import type { DashboardPageModule } from "../../contracts";
import { SettingsPage } from "./SettingsPage";

const module: DashboardPageModule = {
  id: "settings",
  Page: () => <SettingsPage />,
};

export default module;
