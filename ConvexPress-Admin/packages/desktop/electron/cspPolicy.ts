const CLOUD_CONNECT_SOURCES = [
  "https://*.convex.cloud",
  "https://*.convex.dev",
  "https://*.convex.site",
  "wss://*.convex.cloud",
  "wss://*.convex.dev",
  "https://convex.cloud",
  "https://convex.dev",
];

const LOOPBACK_CONNECT_SOURCES = [
  "http://localhost:*",
  "ws://localhost:*",
  "http://127.0.0.1:*",
  "ws://127.0.0.1:*",
];

const LOOPBACK_MEDIA_SOURCES = [
  "http://localhost:*",
  "http://127.0.0.1:*",
];

function isLoopbackUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      parsed.hostname.toLowerCase(),
    );
  } catch {
    return false;
  }
}

function exactNetworkOrigins(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:", "ws:", "wss:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      return [];
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const websocketProtocol = parsed.protocol === "http:" ? "ws:" : "wss:";
      return [parsed.origin, `${websocketProtocol}//${parsed.host}`];
    }
    return [parsed.origin];
  } catch {
    return [];
  }
}

export function controllerConfigUsesLoopback(
  convexUrl: unknown,
  convexSiteUrl: unknown,
): boolean {
  return isLoopbackUrl(convexUrl) || isLoopbackUrl(convexSiteUrl);
}

/** http(s) origins only — the ones images and media can be fetched from. */
function exactHttpOrigins(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values
        .flatMap(exactNetworkOrigins)
        .filter((origin) => origin.startsWith("http:") || origin.startsWith("https:")),
    ),
  ];
}

export function buildDesktopContentSecurityPolicy({
  development,
  allowLoopback,
  additionalConnectOrigins = [],
}: {
  development: boolean;
  allowLoopback: boolean;
  additionalConnectOrigins?: readonly unknown[];
}): string {
  const permitsLoopback = development || allowLoopback;
  const connectSources = [
    "'self'",
    ...(permitsLoopback ? LOOPBACK_CONNECT_SOURCES : []),
    ...new Set(
      additionalConnectOrigins
        .flatMap(exactNetworkOrigins),
    ),
    ...CLOUD_CONNECT_SOURCES,
  ];
  // Media (thumbnails, uploads, product photos) is served by the same site
  // deployments the renderer connects to, so they get the same allow-list.
  const deploymentHttpOrigins = exactHttpOrigins(additionalConnectOrigins);
  const imageSources = [
    "'self'",
    ...(development ? [] : ["file:"]),
    "data:",
    "blob:",
    ...(permitsLoopback ? LOOPBACK_MEDIA_SOURCES : []),
    ...deploymentHttpOrigins,
    "https://*.convex.cloud",
    "https://*.convex.site",
    "https://convex.cloud",
    "https://secure.gravatar.com",
  ];
  const mediaSources = [
    "'self'",
    ...(development ? [] : ["file:"]),
    "data:",
    "blob:",
    ...(permitsLoopback ? LOOPBACK_MEDIA_SOURCES : []),
    ...deploymentHttpOrigins,
    "https://*.convex.cloud",
    "https://*.convex.site",
  ];

  // The Customizer previews the live storefront in an iframe.
  const frameSources = ["'self'", ...(permitsLoopback ? LOOPBACK_MEDIA_SOURCES : []), ...deploymentHttpOrigins];

  return [
    development ? "default-src 'self'" : "default-src 'self' file: blob:",
    development
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' file: 'unsafe-inline'",
    development
      ? "style-src 'self' 'unsafe-inline'"
      : "style-src 'self' file: 'unsafe-inline'",
    `connect-src ${connectSources.join(" ")}`,
    `img-src ${imageSources.join(" ")}`,
    `media-src ${mediaSources.join(" ")}`,
    `frame-src ${frameSources.join(" ")}`,
    development ? "font-src 'self' data:" : "font-src 'self' file: data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; ");
}
