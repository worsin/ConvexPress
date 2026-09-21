import { createFileRoute } from "@tanstack/react-router";
import { SyncedContentLibrary } from "@/components/synced-content/SyncedContentLibrary";
export const Route = createFileRoute("/_authenticated/_admin/synced-content")({ component: SyncedContentLibrary });
