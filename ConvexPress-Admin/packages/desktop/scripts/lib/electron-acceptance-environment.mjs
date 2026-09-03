const BASE_RUNTIME_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TEMP",
  "TMP",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SHELL",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "XDG_RUNTIME_DIR",
  "DBUS_SESSION_BUS_ADDRESS",
];

const ACCEPTANCE_ORIGIN_KEYS = [
  "CONVEXPRESS_ACCEPTANCE_CONTROL_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_CONTROL_SITE_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_SITE_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_SITE_BETA_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_SITE_BETA_SITE_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_SITE_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_SECONDARY_CONTROL_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_SECONDARY_CONTROL_SITE_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_RENDERER_ORIGIN",
  "CONVEXPRESS_ACCEPTANCE_PROXY_SERVER",
];

export function acceptanceProxyArguments(environment = process.env) {
  const value = environment.CONVEXPRESS_ACCEPTANCE_PROXY_SERVER?.trim();
  if (!value) return [];
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Electron acceptance proxy must be a loopback SOCKS5 URL");
  }
  if (
    parsed.protocol !== "socks5:" ||
    !["127.0.0.1", "localhost", "[::1]", "::1"].includes(
      parsed.hostname.toLowerCase(),
    ) ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "" && parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Electron acceptance proxy must be a loopback SOCKS5 URL");
  }
  return [`--proxy-server=socks5://${parsed.host}`];
}

export function buildElectronAcceptanceEnvironment(
  environment = process.env,
  overrides = {},
) {
  const result = {};
  for (const key of [...BASE_RUNTIME_KEYS, ...ACCEPTANCE_ORIGIN_KEYS]) {
    if (typeof environment[key] === "string") result[key] = environment[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string" && key !== "ELECTRON_RUN_AS_NODE") {
      result[key] = value;
    }
  }
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}
