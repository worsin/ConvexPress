import type { DashboardPageDefinition } from "../dashboard/registry";
export const pages: DashboardPageDefinition[] = [{ id: "events", title: "Events", icon: "calendar-days", description: "Upcoming events and community gatherings.", path: "/events", pluginId: "events", group: "activity", defaultInSidebar: true }];
export const widgets = [];
