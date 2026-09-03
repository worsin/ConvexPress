import { pathToFileURL } from "node:url";
import {
  PACKAGED_RENDERER_HOST,
  PACKAGED_RENDERER_SCHEME,
} from "../rendererProtocol.js";

const DEFAULT_DEV_RENDERER_URL = "http://localhost:4105";

function parseSenderUrl(senderUrl: string): URL | null {
  if (!senderUrl) return null;
  try {
    return new URL(senderUrl);
  } catch {
    return null;
  }
}

function hrefWithoutHash(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  return copy.href;
}

function fileHrefWithoutHash(filePath: string): string {
  const url = pathToFileURL(filePath);
  url.hash = "";
  return url.href;
}

export function getTrustedDevRendererOrigin(
  devRendererUrl = process.env.CONVEXPRESS_DESKTOP_DEV_URL ??
    DEFAULT_DEV_RENDERER_URL,
): string {
  const parsed = parseSenderUrl(devRendererUrl) ?? new URL(DEFAULT_DEV_RENDERER_URL);
  return parsed.origin;
}

export function isDevAppRendererSender(
  senderUrl: string,
  devRendererUrl?: string,
): boolean {
  const url = parseSenderUrl(senderUrl);
  if (!url) return false;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.origin === getTrustedDevRendererOrigin(devRendererUrl);
}

export function isPackagedAppRendererSender(
  senderUrl: string,
  _rendererIndexPath?: string,
): boolean {
  const url = parseSenderUrl(senderUrl);
  return !!(
    url &&
    url.protocol === `${PACKAGED_RENDERER_SCHEME}:` &&
    url.hostname === PACKAGED_RENDERER_HOST &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.pathname === "/index.html"
  );
}

export function isAppRendererSender(
  senderUrl: string,
  options: { devRendererUrl?: string; rendererIndexPath?: string } = {},
): boolean {
  return (
    isDevAppRendererSender(senderUrl, options.devRendererUrl) ||
    isPackagedAppRendererSender(senderUrl, options.rendererIndexPath)
  );
}

export function isWizardSender(senderUrl: string): boolean {
  const url = parseSenderUrl(senderUrl);
  return !!(
    url &&
    url.protocol === "file:" &&
    url.pathname.endsWith("/wizard/index.html")
  );
}

export function isExactWizardSender(
  senderUrl: string,
  wizardIndexPath: string,
): boolean {
  const url = parseSenderUrl(senderUrl);
  if (!url || url.protocol !== "file:") return false;
  return hrefWithoutHash(url) === fileHrefWithoutHash(wizardIndexPath);
}

export function isTrustedDesktopSender(
  senderUrl: string,
  options: { devRendererUrl?: string; rendererIndexPath?: string; wizardIndexPath?: string } = {},
): boolean {
  return (
    isAppRendererSender(senderUrl, options) ||
    (options.wizardIndexPath
      ? isExactWizardSender(senderUrl, options.wizardIndexPath)
      : isWizardSender(senderUrl))
  );
}
