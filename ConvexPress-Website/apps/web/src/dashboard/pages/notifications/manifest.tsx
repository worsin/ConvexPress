/**
 * Dashboard page module: notifications (registry id "notifications").
 *
 * Renders the notification center at <basePath>/notifications. State lives
 * in the URL search (?view=needs&id=...&kind=support&tab=preferences).
 */

import type { DashboardPageModule } from "@/dashboard/contracts";
import { NotificationsPage } from "./NotificationsPage";

const notificationsPageModule: DashboardPageModule = {
  id: "notifications",
  Page: () => <NotificationsPage />,
};

export default notificationsPageModule;
