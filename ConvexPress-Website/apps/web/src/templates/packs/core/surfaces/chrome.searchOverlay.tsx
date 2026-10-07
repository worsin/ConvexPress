/** Core · chrome.searchOverlay — the search bar that drops below the header with live suggestions. */
import { SearchOverlay } from "@/components/layout/SearchOverlay";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface SearchOverlaySurfaceData {
  open: boolean;
  placeholder?: string;
  onClose: () => void;
}

export default function CoreChromeSearchOverlay({ data }: SurfaceProps<SearchOverlaySurfaceData>) {
  return <SearchOverlay open={data.open} onClose={data.onClose} placeholder={data.placeholder} />;
}
