/**
 * Orders page module: list at "", detail at "/<orderId>", return request at
 * "/<orderId>/return". The subpath comes from the route wrapper or the
 * configurable-base-path host, never from a hardcoded URL.
 */
import type { DashboardPageModule } from "../../contracts";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { DashboardOrdersPage } from "./OrdersPage";
import { DashboardOrderDetailPage } from "./OrderDetailPage";
import { OrderReturnPage } from "./OrderReturnPage";

function segments(subpath: string): string[] {
  return subpath.split("/").filter(Boolean);
}

const module: DashboardPageModule = {
  id: "orders",
  matchSubpath: (subpath) => {
    const parts = segments(subpath);
    return parts.length === 0 || parts.length === 1 || (parts.length === 2 && parts[1] === "return");
  },
  Page: ({ subpath }) => {
    const parts = segments(subpath);
    if (parts.length === 0) return <DashboardOrdersPage />;
    if (parts.length === 1) return <DashboardOrderDetailPage orderId={parts[0]} />;
    if (parts.length === 2 && parts[1] === "return") return <OrderReturnPage orderId={parts[0]} />;
    return <NotFoundPage />;
  },
};

export default module;
