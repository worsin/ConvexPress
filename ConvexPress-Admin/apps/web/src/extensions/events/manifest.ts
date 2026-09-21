import { CalendarDays } from "lucide-react";
import type { AdminPluginDefinition } from "@/lib/plugins/registry";
export default { id: "events", title: "Events", description: "Publish event schedules, locations and registration links with a member dashboard listing.", icon: CalendarDays, settingsKey: "eventsEnabled", defaultEnabled: false, navSectionIds: ["events"], adminAccessPrefixes: ["/events"], routePrefixes: ["/events"] } satisfies AdminPluginDefinition;
