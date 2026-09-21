import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import block from "../../../../../../../blocks/commerce/download-library/render";
import { DownloadLibraryProvider, type DownloadLibraryHost } from "./download-library";
test("download renderer keeps capabilities out of markup and shows purchase states", () => {
  const host: DownloadLibraryHost = { state: "ready", items: [
    { id: "opaque-owned-id", title: "Field guide", fileName: "guide.pdf", label: "Digital edition", version: "1", orderNumber: "EXAMPLE-1", purchasedAt: 1, fileSize: 32000, remainingDownloads: 2, expiresAt: 1e20, status: "available" },
    { id: "opaque-expired-id", title: "Archive", fileName: "archive.zip", label: "Archive", version: "1", orderNumber: "EXAMPLE-2", purchasedAt: 1, fileSize: null, remainingDownloads: null, expiresAt: 0, status: "expired" },
  ], busy: new Set(), message: "", previous: null, next: null, download: async () => {} };
  const html = renderToStaticMarkup(<DownloadLibraryProvider host={({ children }) => children(host)}><block.View attrs={{ heading: "Your downloads", emptyMessage: "Nothing here yet." }} resources={{ media: {} }} /></DownloadLibraryProvider>);
  expect(html).toContain("Field guide"); expect(html).toContain("Access expired"); expect(html).toContain("Download Field guide");
  expect(html).not.toContain("Download Archive"); expect(html).not.toContain("opaque-owned-id"); expect(html).not.toContain("/api/downloads");
  expect(html).toContain("See your order for access details.");
});
