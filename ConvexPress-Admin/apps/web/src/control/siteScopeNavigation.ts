type SiteSelection = {websiteId: string | null; instanceId: string | null};
/** Resource IDs belong to one database. Leave the previous resource route
 * before committing a different site, honoring the editor's navigation guard. */
export async function prepareSiteScopeNavigation(
  previous: SiteSelection,
  next: SiteSelection,
  navigate: () => Promise<unknown>,
  pathname: () => string,
  stillCurrent: () => boolean,
): Promise<boolean> {
  if (previous.websiteId !== next.websiteId || previous.instanceId !== next.instanceId) {
    await navigate();
    if (pathname() !== '/dashboard') return false;
  }
  return stillCurrent();
}
