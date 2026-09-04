import type { DashboardPageModule } from "../../contracts";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { DashboardSubscriptionsPage } from "./SubscriptionsPage";
import { DashboardSubscriptionDetailPage } from "./SubscriptionDetailPage";

const module: DashboardPageModule = {
  id: "subscriptions",
  matchSubpath: (subpath) => subpath.split("/").filter(Boolean).length <= 1,
  Page: ({ subpath }) => {
    const parts = subpath.split("/").filter(Boolean);
    if (parts.length === 0) return <DashboardSubscriptionsPage />;
    if (parts.length === 1) return <DashboardSubscriptionDetailPage subscriptionId={parts[0]} />;
    return <NotFoundPage />;
  },
};

export default module;
