/**
 * Dashboard - Lazy-loaded component
 *
 * The admin landing page with WordPress-style widgets.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";

export const Route = createLazyFileRoute("/_authenticated/_admin/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return <AdminDashboard />;
}
