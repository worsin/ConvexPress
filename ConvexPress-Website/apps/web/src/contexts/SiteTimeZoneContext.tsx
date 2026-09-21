import { createContext, useContext, type ReactNode } from "react";

// Kept independent of the query/client graph so SDK blocks and BlockDemo can
// share the same presentation contract. SettingsProvider owns the live value.
const SiteTimeZoneContext = createContext("UTC");
export function SiteTimeZoneProvider({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  return <SiteTimeZoneContext value={timeZone}>{children}</SiteTimeZoneContext>;
}
export function useSiteTimeZone(): string {
  return useContext(SiteTimeZoneContext);
}
