/**
 * Tools > Website Import
 *
 * Main page for website connections and content import.
 * Redirects from the legacy "wordpress-sync" route.
 */

import { createFileRoute } from "@tanstack/react-router";

import { WordPressSyncDashboard } from "../wordpress-sync/-components/WordPressSyncDashboard";

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/website-import/",
)({
  component: WebsiteImportPage,
});

function WebsiteImportPage() {
  return <WordPressSyncDashboard />;
}
