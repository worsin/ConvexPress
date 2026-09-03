const DATABASE_KEYS = ["CONTROL", "SITE_ALPHA", "SITE_BETA", "SITE_GAMMA"];

function requireOrigin(environment, name) {
  const value = environment[`CONVEXPRESS_ACCEPTANCE_${name}`]?.trim();
  if (!value) {
    throw new Error(`CONVEXPRESS_ACCEPTANCE_${name} is required`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CONVEXPRESS_ACCEPTANCE_${name} must be an absolute URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`CONVEXPRESS_ACCEPTANCE_${name} must be an HTTP(S) origin`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`CONVEXPRESS_ACCEPTANCE_${name} must not include a path, query, or hash`);
  }
  return url.origin;
}

function isLoopback(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
}

export function loadTestFleetConfig(environment = process.env) {
  const control = {
    key: "control",
    deploymentOrigin: requireOrigin(environment, "CONTROL_ORIGIN"),
    siteOrigin: requireOrigin(environment, "CONTROL_SITE_ORIGIN"),
  };
  const sites = ["ALPHA", "BETA", "GAMMA"].map((name) => ({
    key: name.toLowerCase(),
    deploymentOrigin: requireOrigin(environment, `SITE_${name}_ORIGIN`),
    siteOrigin: requireOrigin(environment, `SITE_${name}_SITE_ORIGIN`),
  }));
  const deployments = [control, ...sites];
  if (environment.CONVEXPRESS_ACCEPTANCE_ALLOW_LOCAL_DATABASES !== "1") {
    for (const target of deployments) {
      for (const origin of [target.deploymentOrigin, target.siteOrigin]) {
        if (isLoopback(new URL(origin).hostname)) {
          throw new Error(
            `Refusing local database endpoint for ${target.key}; use the Linux Worker fleet`,
          );
        }
      }
    }
  }
  const allOrigins = deployments.flatMap((target) => [
    target.deploymentOrigin,
    target.siteOrigin,
  ]);
  if (new Set(allOrigins).size !== allOrigins.length) {
    throw new Error("Every acceptance deployment and management origin must be distinct");
  }
  const rendererOrigin =
    environment.CONVEXPRESS_ACCEPTANCE_RENDERER_ORIGIN?.trim() ||
    "http://127.0.0.1:4105";
  const parsedRenderer = new URL(rendererOrigin);
  if (!isLoopback(parsedRenderer.hostname)) {
    throw new Error("The acceptance renderer must remain local to the Electron host");
  }
  return { control, sites, rendererOrigin: parsedRenderer.origin };
}

export const requiredFleetEnvironmentKeys = DATABASE_KEYS.flatMap((name) => [
  `CONVEXPRESS_ACCEPTANCE_${name}_ORIGIN`,
  `CONVEXPRESS_ACCEPTANCE_${name}_SITE_ORIGIN`,
]);

export function requireSecondaryControl(environment = process.env) {
  const config = loadTestFleetConfig(environment);
  const secondary = {
    key: "secondary-control",
    deploymentOrigin: requireOrigin(environment, "SECONDARY_CONTROL_ORIGIN"),
    siteOrigin: requireOrigin(environment, "SECONDARY_CONTROL_SITE_ORIGIN"),
  };
  const secondaryOrigins = [
    secondary.deploymentOrigin,
    secondary.siteOrigin,
  ];
  if (
    environment.CONVEXPRESS_ACCEPTANCE_ALLOW_LOCAL_DATABASES !== "1" &&
    secondaryOrigins.some((origin) => isLoopback(new URL(origin).hostname))
  ) {
    throw new Error("Refusing local database endpoint for the secondary control plane");
  }
  const existingOrigins = [config.control, ...config.sites].flatMap((target) => [
    target.deploymentOrigin,
    target.siteOrigin,
  ]);
  if (secondaryOrigins.some((origin) => existingOrigins.includes(origin))) {
    throw new Error("The secondary control plane must be a distinct deployment");
  }
  return { ...config, secondaryControl: secondary };
}
