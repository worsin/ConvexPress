import { resolveSiteName } from "@/lib/seo/head";

/** Give the client the server's site name before route heads hydrate. */
export function SiteNameBootstrap() {
  // A JSON string is valid JavaScript, but literal '<' can end its HTML script.
  const name = JSON.stringify(resolveSiteName()).replace(/</g, "\\u003c");
  return <script dangerouslySetInnerHTML={{ __html: `window.__CONVEXPRESS_SITE_NAME__=${name};` }} />;
}
