import { resolveSiteName, searchEnginesDiscouraged } from "@/lib/seo/head";

/** Give the client the server's site name, and whether search engines are discouraged, before route heads hydrate. */
export function SiteNameBootstrap() {
  // A JSON string is valid JavaScript, but literal '<' can end its HTML script.
  const name = JSON.stringify(resolveSiteName()).replace(/</g, "\\u003c");
  const noindex = searchEnginesDiscouraged() ? "window.__CONVEXPRESS_NOINDEX__=true;" : "";
  return <script dangerouslySetInnerHTML={{ __html: `window.__CONVEXPRESS_SITE_NAME__=${name};${noindex}` }} />;
}
