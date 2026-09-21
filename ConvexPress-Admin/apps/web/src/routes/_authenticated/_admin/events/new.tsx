import { createFileRoute } from "@tanstack/react-router";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { EventEditor } from "@/extensions/events/EventEditor";
export const Route = createFileRoute("/_authenticated/_admin/events/new")({ component: () => <PluginGuard pluginId="events"><EventEditor /></PluginGuard> });
