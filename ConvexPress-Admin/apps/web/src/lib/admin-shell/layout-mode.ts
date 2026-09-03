export function adminShellPositionClass({
  standaloneControlPlane,
  controlPlaneUrl,
}: {
  standaloneControlPlane: boolean;
  controlPlaneUrl: string | undefined;
}) {
  return standaloneControlPlane || Boolean(controlPlaneUrl)
    ? "absolute inset-0 flex h-full overflow-hidden"
    : "fixed inset-0 flex h-svh overflow-hidden";
}
