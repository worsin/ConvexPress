import type { Id } from "@backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { EventEditor } from "@/extensions/events/EventEditor";
export const Route = createFileRoute("/_authenticated/_admin/events/$eventId")({ component: Page });
function Page() { const { eventId } = Route.useParams(); return <PluginGuard pluginId="events"><EventEditor key={eventId} id={eventId as Id<"extension_events">} /></PluginGuard>; }
