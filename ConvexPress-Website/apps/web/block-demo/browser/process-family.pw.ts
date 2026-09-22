import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

const packs = ["core", "journal", "depot", "aster-house"];
for (const name of ["process-steps", "roadmap-timeline", "countdown"]) {
  test(`${name} follows its authored width, not the desktop viewport`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/?block=core%2F${name}&example=1`, { waitUntil: "networkidle" });
    const canvas = page.locator('.canonical-canvas');
    for (const pack of packs) {
      await selectPackReady(page, pack);
      await canvas.evaluate(node => {
        node.style.width = '350px'; node.style.maxWidth = 'none';
        node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute('data-width', 'full');
      });
      const selector = name === 'process-steps' ? '.cp-library-process > li' : name === 'roadmap-timeline' ? '.cp-library-roadmap > li' : '.cp-library-countdown';
      await expect(canvas.locator(selector).first()).toBeVisible();
      const columns = await canvas.locator(name === 'process-steps' ? '.cp-library-process' : selector).first().evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(name === 'countdown' ? 2 : 1);
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await canvas.screenshot({ path: info.outputPath(`${pack}-${name}-narrow.png`) });
    }
  });
}

test('step media stays pinned and follows forward and reverse reading, with accessible fallbacks', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?block=core%2Fsteps-with-media&example=1', { waitUntil: 'networkidle' });
  const canvas = page.locator('.canonical-canvas');
  const root = canvas.locator('.cp-library-scroll-steps');
  for (const pack of packs) {
    await selectPackReady(page, pack);
    await canvas.evaluate(node => {
      node.style.width = '1200px'; node.style.maxWidth = 'none';
      node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute('data-width', 'full');
    });
    await expect(root).toHaveAttribute('data-enhanced', 'true');
    const rows = root.locator('.cp-library-scroll-copy > li');
    await expect(rows).toHaveCount(3);
    for (const index of [0, 1, 2, 1, 0]) {
      await rows.nth(index).evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - window.innerHeight * .3, behavior: 'instant' }));
      await expect(root).toHaveAttribute('data-active-step', String(index));
      const active = root.locator(`.cp-library-scroll-stage [data-step="${index}"]`);
      await expect(active).toHaveCSS('opacity', '1');
      expect(await active.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const pin = await root.locator('.cp-library-scroll-pin').boundingBox();
      const imageBox = await active.locator('img').boundingBox();
      expect(Math.abs(imageBox!.height - pin!.height)).toBeLessThanOrEqual(1);
      expect(pin!.y).toBeGreaterThanOrEqual(0);
      expect(pin!.y + pin!.height).toBeLessThanOrEqual(1001);
    }
    await page.screenshot({ path: info.outputPath(`${pack}-sticky.png`) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(root).toHaveAttribute('data-enhanced', 'false');
    await expect(root.locator('.cp-library-scroll-stage')).toBeHidden();
    await expect(root.locator('.cp-library-scroll-inline img')).toHaveCount(3);
    for (const img of await root.locator('.cp-library-scroll-inline img').all()) await expect(img).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await canvas.evaluate(node => { node.style.width = '350px'; });
    await expect(root).toHaveAttribute('data-enhanced', 'false');
    await expect(root.locator('.cp-library-scroll-stage')).toBeHidden();
    expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await canvas.screenshot({ path: info.outputPath(`${pack}-inline-narrow.png`) });
  }
});

test('scroll media remains readable on short screens and without observers', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 580 });
  await page.goto('/?block=core%2Fsteps-with-media&example=1', { waitUntil: 'networkidle' });
  const root = page.locator('.canonical-canvas .cp-library-scroll-steps');
  await expect(root).toHaveAttribute('data-enhanced', 'false');
  await expect(root.locator('.cp-library-scroll-stage')).toBeHidden();
  for (const img of await root.locator('.cp-library-scroll-inline img').all()) await expect(img).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => { Object.defineProperty(window, 'IntersectionObserver', { value: undefined }); });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(root).toHaveAttribute('data-enhanced', 'false');
  await expect(root.locator('.cp-library-scroll-copy > li')).toHaveCount(3);
  await expect(root.locator('.cp-library-scroll-stage')).toBeHidden();
  for (const img of await root.locator('.cp-library-scroll-inline img').all()) await expect(img).toBeVisible();
});

test('countdown expires at the authored instant, announces once and recovers after a changed date', async ({ page }) => {
  await page.clock.install({ time: new Date('2040-06-01T08:00:00Z') });
  await page.goto('/?block=core%2Fcountdown&example=1', { waitUntil: 'networkidle' });
  const canvas = page.locator('.canonical-canvas');
  await expect(canvas.locator('time')).toHaveAttribute('datetime', '2040-06-01T09:00:00.000Z');
  await expect(canvas.locator('.cp-library-countdown')).toBeVisible();
  await expect(canvas.getByRole('status')).toBeEmpty();
  expect(await canvas.locator('.cp-library-countdown').evaluate(node => node.closest('[aria-live]'))).toBeNull();
  await page.clock.fastForward(3_600_100);
  await expect(canvas.locator('.cp-library-countdown')).toHaveCount(0);
  await expect(canvas.getByRole('status')).toHaveText('This sample date has arrived. No offer or booking is implied.');
  await expect(canvas.getByRole('link')).toHaveAttribute('href', '#studies');
  await page.getByText('Try local field edits', { exact: true }).click();
  const study = page.getByRole('region', { name: 'Local block authoring preview' });
  await study.getByRole('textbox', { name: 'Target', exact: true }).fill('2040-06-01T09:10:00Z');
  const edited = study.locator('[data-authoring-preview="canvas"]');
  await expect(edited.locator('time')).toHaveAttribute('datetime', '2040-06-01T09:10:00.000Z');
  await expect(edited.locator('.cp-library-countdown')).toBeVisible();
  await expect(edited.getByRole('status')).toBeEmpty();
  await study.getByRole('textbox', { name: 'Target', exact: true }).fill('not a date');
  await expect(study.getByRole('textbox', { name: 'Target', exact: true })).toHaveAttribute('aria-invalid', 'true');
});

test('sticky steps show the current copy while images load or fail, then reveal decoded media', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/aster-house-camp-mug.png', async route => { await pending; await route.continue(); });
  await page.route('**/aster-house-retreat.png', route => route.abort());
  try {
    await page.goto('/?block=core%2Fsteps-with-media&example=1', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('.canonical-canvas');
    await expect(canvas.locator('.cp-library-scroll-copy>li')).toHaveCount(3);
    await canvas.evaluate(node => {
      node.style.width = '1200px'; node.style.maxWidth = 'none';
      node.querySelector('.cp-section[data-nested="false"]>.cp-container')?.setAttribute('data-width','full');
    });
    const root = canvas.locator('.cp-library-scroll-steps');
    await expect(root).toHaveAttribute('data-enhanced','true');
    await root.locator('.cp-library-scroll-copy>li').nth(1).evaluate(node => scrollTo({top:scrollY+node.getBoundingClientRect().top-innerHeight*.3,behavior:'instant'}));
    await expect(root).toHaveAttribute('data-active-step','1');
    const stage = root.locator('.cp-library-scroll-pin>[data-step="1"]');
    await expect(stage.locator('[data-media-state="loading"]')).toBeVisible();
    await expect(stage).toContainText('Give it a little time.');
    const before = await stage.boundingBox();
    release();
    await expect(stage.locator('[data-media-state="ready"]')).toBeVisible();
    await expect(stage.locator('.cp-library-scroll-image')).toHaveCSS('opacity','1');
    expect(await stage.locator('img').evaluate((image:HTMLImageElement)=>image.complete && image.naturalWidth>0)).toBe(true);
    const after = await stage.boundingBox();
    expect(after!.height).toBe(before!.height);
    await root.locator('.cp-library-scroll-copy>li').nth(2).evaluate(node => scrollTo({top:scrollY+node.getBoundingClientRect().top-innerHeight*.3,behavior:'instant'}));
    await expect(root).toHaveAttribute('data-active-step','2');
    const failed = root.locator('.cp-library-scroll-pin>[data-step="2"]');
    await expect(failed.locator('[data-media-state="error"]')).toBeVisible();
    await expect(failed).toContainText('Share what you found.');
  } finally { release(); }
});
