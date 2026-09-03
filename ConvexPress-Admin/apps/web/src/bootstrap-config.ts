interface ControlPlaneEndpointInput {
  isElectron: boolean;
  standaloneEnabled: boolean;
  configuredConvexUrl?: string;
  configuredConvexSiteUrl?: string;
  environmentControlPlaneUrl?: string;
  environmentControlPlaneSiteUrl?: string;
}

interface ControlPlaneEndpoints {
  controlPlaneUrl?: string;
  controlPlaneSiteUrl?: string;
}

/**
 * Resolve the outer control-plane authority for the current renderer.
 *
 * An Electron install is explicitly bound to the deployment stored in its
 * isolated desktop profile. Development-time Vite variables describe the
 * renderer process, not the installed controller, so they must not redirect a
 * configured Electron client to another operator's control plane.
 */
export function resolveControlPlaneEndpoints({
  isElectron,
  standaloneEnabled,
  configuredConvexUrl,
  configuredConvexSiteUrl,
  environmentControlPlaneUrl,
  environmentControlPlaneSiteUrl,
}: ControlPlaneEndpointInput): ControlPlaneEndpoints {
  const usesStandaloneControlPlane =
    standaloneEnabled || environmentControlPlaneUrl !== undefined;
  const configuredControlPlaneUrl = usesStandaloneControlPlane
    ? configuredConvexUrl
    : undefined;
  const configuredControlPlaneSiteUrl = usesStandaloneControlPlane
    ? configuredConvexSiteUrl
    : undefined;

  if (isElectron) {
    return {
      controlPlaneUrl:
        configuredControlPlaneUrl ?? environmentControlPlaneUrl,
      controlPlaneSiteUrl:
        configuredControlPlaneSiteUrl ?? environmentControlPlaneSiteUrl,
    };
  }

  return {
    controlPlaneUrl:
      environmentControlPlaneUrl ?? configuredControlPlaneUrl,
    controlPlaneSiteUrl:
      environmentControlPlaneSiteUrl ?? configuredControlPlaneSiteUrl,
  };
}
