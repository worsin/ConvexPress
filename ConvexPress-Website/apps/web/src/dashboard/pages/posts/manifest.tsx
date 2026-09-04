import type { DashboardPageModule } from "../../contracts";
import { MyPostsPage } from "./PostsPage";

const module: DashboardPageModule = {
  id: "posts",
  Page: () => <MyPostsPage />,
};

export default module;
