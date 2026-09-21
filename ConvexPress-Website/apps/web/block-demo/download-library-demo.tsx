import { createContext, useContext, useState, type ReactNode } from "react";
import { DownloadLibraryProvider, type DownloadLibraryHost, type DownloadLibraryHostProps, type DownloadLibraryItem } from "../src/templates/sdk/block-renderer/download-library";
const specimens: DownloadLibraryItem[] = [
  { id: "field-guide", title: "The field guide to slower mornings", fileName: "slower-mornings-field-guide.pdf", label: "A small ritual, beautifully kept", version: "2.1", orderNumber: "AH-1042", purchasedAt: 1788220800000, fileSize: 30409237, remainingDownloads: null, expiresAt: null, status: "available" },
  { id: "studio-kit", title: "An everyday studio", fileName: "everyday-studio-templates.zip", label: "The complete creative toolkit", version: "1.4", orderNumber: "AH-1038", purchasedAt: 1788134400000, fileSize: 185597952, remainingDownloads: 3, expiresAt: null, status: "available" },
  { id: "archive", title: "Notes from the coast", fileName: "coastal-notes-2025.pdf", label: "From your archive", version: "1.0", orderNumber: "AH-0916", purchasedAt: 1756684800000, fileSize: null, remainingDownloads: null, expiresAt: 1759276800000, status: "expired" },
];
const Context = createContext<DownloadLibraryHost>({ state: "unavailable" });
function Host({ children }: DownloadLibraryHostProps) { return children(useContext(Context)); }
export function DownloadLibraryDemo({ children }: { children: ReactNode }) {
  const [state, setState] = useState("ready"), [message, setMessage] = useState(""), [secondPage, setSecondPage] = useState(false);
  let value: DownloadLibraryHost;
  if (state === "signed-out" || state === "loading" || state === "unavailable" || state === "offline") value = { state };
  else value = { state: "ready", items: state === "empty" ? [] : secondPage ? [{ ...specimens[1]!, id: "archive-limit", title: "The printmaker’s archive", status: "exhausted" }] : specimens, busy: new Set(), message,
    previous: secondPage ? () => { setSecondPage(false); setMessage(""); } : null,
    next: state !== "empty" && !secondPage ? () => { setSecondPage(true); setMessage(""); } : null,
    download: async id => { const item = specimens.find(value => value.id === id); setMessage(`Download requested: ${item?.fileName}. Demo only; no file transferred.`); },
  };
  return <><label className="assistant-demo-control">Synthetic downloads fixture<select value={state} onChange={event => { setState(event.target.value); setMessage(""); setSecondPage(false); }}><option value="ready">Purchased files</option><option value="empty">Empty library</option><option value="signed-out">Signed out</option><option value="loading">Loading / account switch</option><option value="offline">Offline</option><option value="unavailable">Unavailable</option></select></label><Context value={value}><DownloadLibraryProvider host={Host}>{children}</DownloadLibraryProvider></Context></>;
}
