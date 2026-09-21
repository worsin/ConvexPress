import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";
for (const width of [1440, 900, 390])
    test(`Depot defaults respect compact type and authored spacing · ${width}`, async ({ page }, info) => {
        test.setTimeout(90000);
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('/', { waitUntil: 'networkidle' });
        await selectPackReady(page, 'depot');
        const study = page.locator('[data-density-study]');
        await study.locator('summary').click();
        const sizes = await study.locator('[data-density-heading] .cp-heading').evaluateAll(nodes => nodes.map(node => ({ size: parseFloat(getComputedStyle(node).fontSize), transform: getComputedStyle(node).textTransform, line: parseFloat(getComputedStyle(node).lineHeight) })));
        expect(sizes.map(value => value.transform)).toEqual(['none', 'none', 'none', 'none']);
        expect(sizes[0].size).toBeLessThanOrEqual(36);
        expect(sizes[1].size).toBeLessThanOrEqual(26);
        expect(sizes[2].size).toBeLessThanOrEqual(22);
        expect(sizes[3].size).toBeLessThanOrEqual(18);
        for (let i = 1; i < sizes.length; i++)
            expect(sizes[i - 1].size).toBeGreaterThan(sizes[i].size);
        for (const value of sizes)
            expect(value.line / value.size).toBeGreaterThanOrEqual(1.18);
        const cards = study.locator('[data-density-card] .cp-card');
        const padding = await cards.evaluateAll(nodes => nodes.map(node => ({ padding: parseFloat(getComputedStyle(node).paddingTop), radius: parseFloat(getComputedStyle(node).borderRadius) })));
        expect(padding[0].padding).toBe(0);
        expect(padding[1].padding).toBeLessThan(padding[2].padding);
        expect(padding[2].padding).toBeLessThan(padding[3].padding);
        expect(padding.every(value => value.radius > 0)).toBe(true);
        const plain = await study.locator('[data-density-plain] .cp-card').evaluate(node => {
            const css = getComputedStyle(node);
            return { border: parseFloat(css.borderTopWidth), padding: parseFloat(css.paddingTop) };
        });
        expect(plain).toEqual({ border: 0, padding: 0 });
        for (const long of [false, true]) {
            await study.getByRole('checkbox', { name: 'Use long specimen copy' }).setChecked(long);
            expect(await study.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
            for (const link of await study.getByRole('link').all()) {
                await link.focus();
                await expect(link).toBeFocused();
                await expect(link).toHaveAttribute('href', '#composition');
            }
            await study.screenshot({ path: info.outputPath(`depot-type-${long ? 'long' : 'short'}-${width}.png`), animations: 'disabled' });
        }
        await page.locator('#canonical-block').selectOption('core/pricing-cards');
        await page.locator('#canonical-example').selectOption('1');
        const canvas = page.locator('.canonical-canvas');
        const source = await page.locator('.canonical-source pre').textContent();
        const headings = await canvas.locator('h3').evaluateAll(nodes => nodes.map(node => ({ size: parseFloat(getComputedStyle(node).fontSize), transform: getComputedStyle(node).textTransform, text: node.textContent })));
        expect(headings.length).toBeGreaterThan(0);
        for (const heading of headings) {
            expect(heading.size).toBeLessThanOrEqual(22);
            expect(heading.transform).toBe('none');
        }
        for (const pack of ['journal', 'core', 'aster-house', 'depot']) {
            await selectPackReady(page, pack);
            expect(await page.locator('.canonical-source pre').textContent()).toBe(source);
            expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        }
        await canvas.screenshot({ path: info.outputPath(`depot-pricing-${width}.png`), animations: 'disabled' });
        await page.locator('#canonical-block').selectOption('core/feature-grid');
        await page.locator('#canonical-example').selectOption('1');
        const featureHeadings = await canvas.locator('h3').evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
        expect(featureHeadings.length).toBeGreaterThan(0);
        for (const size of featureHeadings)
            expect(size).toBeLessThanOrEqual(22);
        await canvas.screenshot({ path: info.outputPath(`depot-features-${width}.png`), animations: 'disabled' });
        expect(errors).toEqual([]);
    });
