export type IsolatedSiteRole =
  | "administrator"
  | "editor"
  | "subscriber";

function preferredSiteRole(platformRole: string | undefined): IsolatedSiteRole {
  if (platformRole === "viewer") return "subscriber";
  if (platformRole === "member") return "editor";
  return "administrator";
}

export function siteSessionRole({
  platformRole,
  environmentKind,
  liveOperateAllowed,
}: {
  platformRole: string | undefined;
  environmentKind: string | undefined;
  liveOperateAllowed: boolean | undefined;
}): IsolatedSiteRole | null {
  const preferred = preferredSiteRole(platformRole);
  if (environmentKind !== "live" || preferred === "subscriber") {
    return preferred;
  }
  if (liveOperateAllowed === undefined) return null;
  return liveOperateAllowed ? preferred : "subscriber";
}
