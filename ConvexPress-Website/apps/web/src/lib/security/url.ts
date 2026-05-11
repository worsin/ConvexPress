const BLANK_TARGET = "_blank";

interface SanitizeHrefOptions {
  allowRelative?: boolean;
  allowHash?: boolean;
  allowMailto?: boolean;
  allowTel?: boolean;
  allowProtocolRelative?: boolean;
}

const DEFAULT_HREF_OPTIONS: Required<SanitizeHrefOptions> = {
  allowRelative: true,
  allowHash: true,
  allowMailto: true,
  allowTel: true,
  allowProtocolRelative: false,
};

function sanitizeUrlValue(
  value: string | null | undefined,
  options?: SanitizeHrefOptions,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const resolved = { ...DEFAULT_HREF_OPTIONS, ...options };

  if (/^(javascript|data|vbscript|blob|file):/i.test(trimmed)) {
    return undefined;
  }

  if (trimmed.startsWith("//")) {
    return resolved.allowProtocolRelative ? trimmed : undefined;
  }

  if (trimmed.startsWith("#")) {
    return resolved.allowHash ? trimmed : undefined;
  }

  if (/^(\/|\.\.\/|\.\/|\?)/.test(trimmed)) {
    return resolved.allowRelative ? trimmed : undefined;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }

    if (parsed.protocol === "mailto:" && resolved.allowMailto) {
      return trimmed;
    }

    if (parsed.protocol === "tel:" && resolved.allowTel) {
      return trimmed;
    }

    return undefined;
  } catch {
    if (resolved.allowRelative && !trimmed.includes(":")) {
      return trimmed;
    }

    return undefined;
  }
}

export function sanitizeHref(
  value: string | null | undefined,
  options?: SanitizeHrefOptions,
): string | undefined {
  return sanitizeUrlValue(value, options);
}

export function sanitizeImageSrc(
  value: string | null | undefined,
): string | undefined {
  return sanitizeUrlValue(value, {
    allowRelative: true,
    allowHash: false,
    allowMailto: false,
    allowTel: false,
    allowProtocolRelative: false,
  });
}

function extractYouTubeVideoId(url: URL): string | undefined {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id || undefined;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const watchId = url.searchParams.get("v");
    if (watchId) return watchId;

    const [, kind, id] = url.pathname.split("/");
    if ((kind === "embed" || kind === "shorts" || kind === "live") && id) {
      return id;
    }
  }

  return undefined;
}

function extractVimeoVideoId(url: URL): string | undefined {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "vimeo.com" && host !== "player.vimeo.com") {
    return undefined;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const id = segments.at(-1);
  return id && /^\d+$/.test(id) ? id : undefined;
}

export function sanitizeEmbedUrl(
  value: string | null | undefined,
): string | undefined {
  const safeHref = sanitizeHref(value, {
    allowRelative: false,
    allowHash: false,
    allowMailto: false,
    allowTel: false,
    allowProtocolRelative: false,
  });

  if (!safeHref) return undefined;

  try {
    const parsed = new URL(safeHref);
    const youtubeId = extractYouTubeVideoId(parsed);
    if (youtubeId) {
      return `https://www.youtube.com/embed/${youtubeId}`;
    }

    const vimeoId = extractVimeoVideoId(parsed);
    if (vimeoId) {
      return `https://player.vimeo.com/video/${vimeoId}`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export function buildSecureRel(
  rel: string | null | undefined,
  target: string | null | undefined,
): string | undefined {
  const tokens = new Set(
    (rel ?? "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );

  if (target === BLANK_TARGET) {
    tokens.add("noopener");
    tokens.add("noreferrer");
  }

  return tokens.size > 0 ? Array.from(tokens).join(" ") : undefined;
}

