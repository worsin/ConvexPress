import { CalendarDays } from "lucide-react";
import type { AdminNavSection } from "@/lib/admin-shell/types";
export default { id: "events", label: "Events", to: "/events", icon: CalendarDays, pluginId: "events", capability: "manage_options", children: [{ id: "events-all", label: "All events", to: "/events", exact: true }, { id:"events-categories",label:"Categories",to:"/events/categories",exact:true }, { id: "events-new", label: "Add event", to: "/events/new", isAddNew: true }] } satisfies AdminNavSection;
