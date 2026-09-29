import { createContext, useContext, type ReactNode } from 'react';
import { publicStorageDownloadHref } from './public-file-href';
const PublicStorageOrigin = createContext<string | null>(null);
export function PublicFileDownloadProvider({ backendOrigin, children }: { backendOrigin?: string; children: ReactNode }) {
  return <PublicStorageOrigin.Provider value={backendOrigin ?? null}>{children}</PublicStorageOrigin.Provider>;
}
export function usePublicFileDownloadHref() {
  const origin = useContext(PublicStorageOrigin);
  return (src: string, filename?: string) => publicStorageDownloadHref(src, filename, origin);
}
