import type { DashboardPageModule } from "../../contracts";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { DashboardReturnsPage } from "./ReturnsPage";
import { DashboardReturnDetailPage } from "./ReturnDetailPage";

const module: DashboardPageModule = {
  id: "returns",
  matchSubpath: (subpath) => subpath.split("/").filter(Boolean).length <= 1,
  Page: ({ subpath }) => {
    const parts = subpath.split("/").filter(Boolean);
    if (parts.length === 0) return <DashboardReturnsPage />;
    if (parts.length === 1) return <DashboardReturnDetailPage returnId={parts[0]} />;
    return <NotFoundPage />;
  },
};

export default module;
