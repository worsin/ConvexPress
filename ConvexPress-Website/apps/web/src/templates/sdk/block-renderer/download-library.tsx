import { createContext, useContext, type ReactNode } from "react";
export type DownloadLibraryItem = {
  id: string; title: string; fileName: string; label: string; version: string;
  orderNumber: string; purchasedAt: number; fileSize: number | null;
  remainingDownloads: number | null; expiresAt: number | null;
  status: "available" | "expired" | "exhausted" | "unavailable";
};
export type DownloadLibraryHost =
  | { state: "loading" | "signed-out" | "offline" | "unavailable" }
  | { state: "ready"; items: DownloadLibraryItem[]; message: string; busy: ReadonlySet<string>; download: (id: string) => Promise<void>; previous: (() => void) | null; next: (() => void) | null };
export type DownloadLibraryHostProps = { children: (value: DownloadLibraryHost) => ReactNode };
const Context = createContext<(props: DownloadLibraryHostProps) => ReactNode>(({ children }) => children({ state: "unavailable" }));
/** The renderer receives display metadata and an action, never purchase tokens,
 * storage URLs, or data that can be serialized into the public page document. */
export function DownloadLibraryProvider({ host, children }: { host: (props: DownloadLibraryHostProps) => ReactNode; children: ReactNode }) {
  return <Context value={host}>{children}</Context>;
}
export function DownloadLibraryHostView(props: DownloadLibraryHostProps) {
  const Host = useContext(Context);
  return <Host {...props} />;
}
