import { createFileRoute } from "@tanstack/react-router";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { EventsList } from "@/extensions/events/EventsList";
export const Route = createFileRoute("/_authenticated/_admin/events/")({ component: () => <PluginGuard pluginId="events"><EventsList /></PluginGuard> });
