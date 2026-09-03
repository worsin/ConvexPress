// Shared Playwright helpers for the ConvexPress shell.
//
// The scope is chosen through the sidebar site switcher (organization ›
// business › website in one popover) and the topbar environment switch.
// Environment-level actions (site operations, transfer, manage sites) live in
// the "Environment options" menu next to the switch.

const DEFAULT_TIMEOUT = 20_000;

export function siteSwitcherTrigger(page) {
  return page.getByRole("button", { name: "Switch website" });
}

/** Wait until the operator shell is visible (site switcher present). */
export async function waitForShell(page, timeout = DEFAULT_TIMEOUT) {
  await siteSwitcherTrigger(page).first().waitFor({ state: "visible", timeout });
  // The shell remounts once the selected site session is ready; let it settle.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(750);
}

/**
 * Open the switcher popover. The trigger can be replaced while the site
 * runtime mounts, so a click that lands on a stale node is retried.
 */
async function openSwitcher(page, timeout = DEFAULT_TIMEOUT) {
  const dialog = page.getByRole("dialog", { name: "Switch website" });
  const deadline = Date.now() + timeout;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const trigger = siteSwitcherTrigger(page).first();
    await trigger.waitFor({ state: "visible", timeout: Math.max(1_000, deadline - Date.now()) });
    await trigger.click();
    const opened = await dialog
      .waitFor({ state: "visible", timeout: Math.min(4_000, Math.max(500, deadline - Date.now())) })
      .then(() => true)
      .catch(() => false);
    if (opened) return dialog;
    if (attempt >= 6) break;
    await page.waitForTimeout(500);
  }
  throw new Error("The site switcher did not open.");
}

/** True when the operator shell is already on screen. */
export async function shellIsVisible(page) {
  return siteSwitcherTrigger(page).first().isVisible().catch(() => false);
}

/**
 * Open the site switcher and choose a website. `organization` and `business`
 * are matched against the group header shown above the website so ambiguous
 * titles resolve to the intended path.
 */
export async function selectWebsite(page, scope, timeout = DEFAULT_TIMEOUT) {
  // The popover lives inside the sidebar, which is remounted when the site
  // runtime finishes loading. If that happens mid-selection the option node is
  // detached; re-open and try again rather than failing the whole run.
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await selectWebsiteOnce(page, scope, timeout);
      return;
    } catch (error) {
      lastError = error;
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(750);
    }
  }
  throw lastError;
}

async function selectWebsiteOnce(
  page,
  { organization, business, website },
  timeout,
) {
  const dialog = await openSwitcher(page, timeout);
  const search = dialog.getByRole("combobox", { name: "Search websites" });
  await search.fill(website);
  const options = dialog.getByRole("option", { name: website, exact: false });
  await options.first().waitFor({ state: "visible", timeout });
  let picked = options.first();
  if (organization || business) {
    const count = await options.count();
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      const header = await option.evaluate((node) => {
        let cursor = node.previousElementSibling ?? node.parentElement;
        while (cursor) {
          const text = cursor.textContent ?? "";
          if (text.includes("›")) return text;
          cursor = cursor.previousElementSibling ?? cursor.parentElement;
        }
        return "";
      });
      if (
        (!organization || header.includes(organization)) &&
        (!business || header.includes(business))
      ) {
        picked = option;
        break;
      }
    }
  }
  await picked.click({ timeout: Math.min(timeout, 8_000) });
  await dialog.waitFor({ state: "hidden", timeout }).catch(() => undefined);
}

/** Choose an environment from the topbar switch by its visible label. */
export async function selectEnvironment(page, label, timeout = DEFAULT_TIMEOUT) {
  const group = page.getByRole("group", { name: "Environment" }).first();
  await group.waitFor({ state: "visible", timeout });
  const button = group.getByRole("button", { name: label, exact: false });
  await button.waitFor({ state: "visible", timeout });
  await button.click();
}

/** Select organization, business, website and environment in one call. */
export async function selectScope(page, scope, timeout = DEFAULT_TIMEOUT) {
  await selectWebsite(page, scope, timeout);
  if (scope.environment) await selectEnvironment(page, scope.environment, timeout);
}

/** The "Environment options" topbar menu button. */
export function environmentOptionsButton(page) {
  return page.getByRole("button", { name: "Environment options" });
}

async function closeMenu(page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page
    .getByRole("menu")
    .first()
    .waitFor({ state: "hidden", timeout: 2_000 })
    .catch(() => undefined);
}

/** Whether a named action exists in the environment options menu. */
export async function environmentActionAvailable(page, name, timeout = 5_000) {
  await environmentOptionsButton(page).click();
  const item = page.getByRole("menuitem", { name });
  const available = await item
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
  await closeMenu(page);
  return available;
}

/**
 * Open a named action from the environment options menu.
 *
 * Menu items can remount while access queries settle right after a scope
 * switch, so the click is retried on a freshly opened menu until it lands.
 */
export async function openEnvironmentAction(page, name, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  let lastError;
  for (let attempt = 0; attempt < 8 && Date.now() < deadline; attempt += 1) {
    try {
      await environmentOptionsButton(page).click({ timeout: 5_000 });
      const item = page.getByRole("menuitem", { name });
      await item.waitFor({ state: "visible", timeout: Math.max(1_000, Math.min(5_000, deadline - Date.now())) });
      await page.waitForTimeout(400);
      await item.click({ timeout: 3_000 });
      return;
    } catch (error) {
      lastError = error;
      await closeMenu(page);
      await page.waitForTimeout(500);
    }
  }
  throw lastError ?? new Error(`Environment action "${name}" could not be opened.`);
}

/** The Sites workspace region. */
export function sitesWorkspace(page) {
  return page.getByRole("region", { name: "Manage websites" });
}

/** Open the Sites workspace (sidebar entry) and return its region. */
export async function openSiteManager(page, timeout = DEFAULT_TIMEOUT) {
  const region = sitesWorkspace(page);
  if (!(await region.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Sites", exact: true }).first().click();
  }
  await region.waitFor({ state: "visible", timeout });
  return region;
}

/** Select a node in the workspace's portfolio tree by its visible label. */
export async function selectPortfolioNode(page, name, timeout = DEFAULT_TIMEOUT) {
  const region = await openSiteManager(page, timeout);
  const tree = region.getByRole("navigation", { name: "Portfolio" });
  await tree.getByRole("button", { name, exact: false }).first().click();
  return region;
}

/** Open the People page of the Sites workspace. */
export async function openPeople(page, timeout = DEFAULT_TIMEOUT) {
  return selectPortfolioNode(page, /^People$/, timeout);
}

/** Sign out through the sidebar account menu. */
export async function signOut(page, timeout = DEFAULT_TIMEOUT) {
  await page.getByRole("button", { name: /^Account menu for/ }).first().click();
  const item = page.getByRole("menuitem", {
    name: "Sign out of ConvexPress control plane",
  });
  await item.waitFor({ state: "visible", timeout });
  await item.click();
}

/** The identity text shown in the environment options menu header. */
export async function readActiveEnvironmentLabel(page, timeout = DEFAULT_TIMEOUT) {
  await environmentOptionsButton(page).click();
  const label = page.getByLabel("Active website environment");
  await label.waitFor({ state: "visible", timeout });
  const text = (await label.textContent())?.trim() ?? "";
  await page.keyboard.press("Escape");
  return text;
}

/** Wait until the topbar reports the given active environment identity. */
export async function waitForActiveEnvironment(page, label, timeout = DEFAULT_TIMEOUT) {
  await page
    .locator(`[data-active-environment="${label.replace(/"/g, '\\"')}"]`)
    .first()
    .waitFor({ state: "visible", timeout });
}

/**
 * Names of every organization the switcher offers this operator, whether
 * expanded (group headers) or folded (summary rows).
 */
export async function listSwitcherOrganizations(page, timeout = DEFAULT_TIMEOUT) {
  const dialog = await openSwitcher(page, timeout);
  const names = await dialog.evaluate((node) => {
    const found = new Set();
    for (const section of node.querySelectorAll("[role=listbox] [data-organization]")) {
      const name = section.getAttribute("data-organization")?.trim();
      if (name) found.add(name);
    }
    return [...found];
  });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout }).catch(() => undefined);
  return names;
}

/** Scope the shell to a business that has no websites yet. */
export async function selectBusiness(page, { organization, business }, timeout = DEFAULT_TIMEOUT) {
  const dialog = await openSwitcher(page, timeout);
  await dialog.getByRole("combobox", { name: "Search websites" }).fill(business);
  const option = dialog.getByRole("option", { name: business, exact: false }).first();
  await option.waitFor({ state: "visible", timeout });
  await option.click();
  await dialog.waitFor({ state: "hidden", timeout }).catch(() => undefined);
  void organization;
}
