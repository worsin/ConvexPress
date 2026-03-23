import { env } from "@convexpress-admin/env/web";

const DEFAULT_CONSUMER_SITE_URL = "http://localhost:4106";

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getConsumerSiteUrl(): string {
  const configured = env.VITE_CONSUMER_SITE_URL?.trim() ?? "";
  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname.includes("smithharper.com")) {
      return "https://smithharper.com";
    }
  }

  return DEFAULT_CONSUMER_SITE_URL;
}

export function buildWebsiteLoginUrl(returnTo?: string): string {
  const consumerSiteUrl = getConsumerSiteUrl();
  const target =
    returnTo ?? (typeof window !== "undefined" ? window.location.href : undefined);

  if (!target) {
    return `${consumerSiteUrl}/login`;
  }

  const search = new URLSearchParams({
    returnTo: target,
  });
  return `${consumerSiteUrl}/login?${search.toString()}`;
}
