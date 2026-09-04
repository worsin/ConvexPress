import type { DashboardPageModule } from "../../contracts";
import { DashboardMembershipPage } from "./MembershipPage";

const module: DashboardPageModule = {
  id: "membership",
  Page: () => <DashboardMembershipPage />,
};

export default module;
