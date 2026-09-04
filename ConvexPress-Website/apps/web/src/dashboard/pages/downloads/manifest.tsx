import type { DashboardPageModule } from "../../contracts";
import { DashboardDownloadsPage } from "./DownloadsPage";

const module: DashboardPageModule = {
  id: "downloads",
  Page: () => <DashboardDownloadsPage />,
};

export default module;
