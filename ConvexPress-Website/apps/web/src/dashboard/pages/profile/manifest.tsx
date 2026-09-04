import type { DashboardPageModule } from "../../contracts";
import { ProfilePage } from "./ProfilePage";

const module: DashboardPageModule = {
  id: "profile",
  Page: () => <ProfilePage />,
};

export default module;
