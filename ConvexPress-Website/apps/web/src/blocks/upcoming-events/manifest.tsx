import { useEventWindow } from "@/extensions/events/useEventWindow";
import { useQuery } from "convex/react";
import { useSettings } from "@/contexts/SettingsContext";
import { upcomingEvents } from "@/extensions/events/api";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { upcomingEventsAttrsSchema, type UpcomingEventsAttrs } from "./schema";
import { UpcomingEventsView } from "./View";
function Renderer({attrs}:BlockRendererProps<UpcomingEventsAttrs>) {
 const settings=useSettings();
 const startsAtOrAfter=useEventWindow(true);
 const enabled=isPublicPluginEnabled('events',settings);
 const result=useQuery(upcomingEvents,enabled?{startsAtOrAfter,paginationOpts:{numItems:attrs.count,cursor:null}}:'skip');
 if (!enabled) return null;
 return <UpcomingEventsView attrs={attrs} events={result?.page}/>;
}
export const definition = {name:"events/upcoming",title:"Upcoming Events",version:1,schema:upcomingEventsAttrsSchema,Renderer,rendererStatus:"ready"} satisfies WebsiteBlockDefinition;
export default definition;
