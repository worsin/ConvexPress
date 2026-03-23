/**
 * Tools > WordPress Sync
 *
 * Main page for WordPress site connections and content import.
 * Connect WordPress sites and sync all content in one click.
 *
 * Features:
 * - List connected WordPress sites
 * - Add new site connections
 * - Test connections
 * - Start/pause/cancel sync jobs
 * - Real-time sync progress
 * - Job history and error logs
 */

import { createFileRoute } from "@tanstack/react-router";

import { WordPressSyncDashboard } from "./-components/WordPressSyncDashboard";

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/wordpress-sync/",
)({
  component: WordPressSyncPage,
});

function WordPressSyncPage() {
  return <WordPressSyncDashboard />;
}
