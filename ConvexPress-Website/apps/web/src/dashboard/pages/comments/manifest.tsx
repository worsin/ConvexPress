import type { DashboardPageModule } from "../../contracts";
import { CommentsPage } from "./CommentsPage";

const module: DashboardPageModule = {
  id: "comments",
  Page: () => <CommentsPage />,
};

export default module;
