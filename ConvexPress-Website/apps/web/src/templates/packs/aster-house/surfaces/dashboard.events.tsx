import type { SurfaceProps } from "@/templates/sdk/types";
import type { EventsIndexSurfaceData } from "@/extensions/events/types";
import { EventList } from "./events.index";
export default function AsterDashboardEvents({ data }: SurfaceProps<EventsIndexSurfaceData>) {
  return <section className="space-y-9"><h1 className="font-display text-4xl tracking-tight">Events</h1><EventList data={data} /></section>;
}
