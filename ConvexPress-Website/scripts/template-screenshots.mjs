#!/usr/bin/env node
/** Operator-invoked staging evidence only. Never run automatically during builds. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function validateCases(base, pack, cases) {
  const origin = new URL(base);
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('base-url must be HTTP(S)');
  if (!/^[a-z][a-z0-9-]*$/.test(pack)) throw new Error('pack must be a lowercase slug');
  if (!Array.isArray(cases) || !cases.length) throw new Error('cases must be a nonempty array');
  const ids = new Set();
  return cases.map(item => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id) || ids.has(item.id)) throw new Error('case ids must be unique filename-safe slugs');
    ids.add(item.id);
    const url = new URL(item.path, origin);
    if (url.origin !== origin.origin) throw new Error('case path must remain on the configured origin');
    if (!Array.isArray(item.surfaces) || !item.surfaces.length || item.surfaces.some(id => !/^[a-zA-Z][a-zA-Z0-9.-]*$/.test(id))) throw new Error('each case needs valid surface ids');
    url.searchParams.set('template', pack);
    return { ...item, url: url.href };
  });
}

export function renderGallery(evidence) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(evidence.pack)} surface evidence</title><style>body{font:16px system-ui;margin:2rem auto;max-width:1100px;padding:0 1rem}img{max-width:100%;height:auto;border:1px solid #ccc}section{border-top:1px solid #ccc;margin-top:3rem;padding-top:1rem}figure{margin:2rem 0}figcaption{margin-bottom:.5rem}a{color:inherit}</style><h1>${escape(evidence.pack)} surface evidence</h1><p>${escape(evidence.createdAt)}</p>${evidence.cases.map(item => `<section><h2>${escape(item.id)}</h2><p><a href="${escape(item.url)}">${escape(item.url)}</a></p>${item.error ? `<p role="status">Failed: ${escape(item.error)}</p>` : ''}${item.file ? `<a href="${escape(item.file)}">Full page</a>` : ''}${item.surfaces.map(crop => `<figure><figcaption>${escape(crop.surface)}</figcaption><a href="${escape(crop.file)}"><img loading="lazy" src="${escape(crop.file)}" alt="${escape(crop.surface)} captured surface"></a></figure>`).join('')}</section>`).join('')}</html>`;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => value.startsWith('--') ? [...pairs, [value.slice(2), value === '--help' ? true : values[index + 1]]] : pairs, []));
  if (args.help || !args['base-url'] || !args.pack || !args.cases || !args.output) {
    console.log('Usage: bun scripts/template-screenshots.mjs --base-url https://authorized-staging.example --pack aster-house --cases cases.json --output evidence [--storage-state state.json]');
    if (!args.help) process.exitCode = 1;
    return;
  }
  const cases = validateCases(args['base-url'], args.pack, JSON.parse(await readFile(args.cases, 'utf8')));
  const output = resolve(args.output);
  await mkdir(output, { recursive: true });
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const evidence = { pack: args.pack, createdAt: new Date().toISOString(), cases: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...(args['storage-state'] ? { storageState: args['storage-state'] } : {}) });
    const page = await context.newPage();
    for (const item of cases) {
      const result = { id: item.id, url: item.url, surfaces: [], error: null };
      evidence.cases.push(result);
      try {
        await page.goto(item.url, { waitUntil: 'networkidle' });
        if (new URL(page.url()).origin !== new URL(item.url).origin) throw new Error('route redirected outside the staging origin');
        for (const surface of item.surfaces) {
          const element = page.locator(`[data-surface="${surface}"]`).first();
          await element.waitFor({ state: 'attached' });
          // Surface is display:contents; a Range includes its rendered descendants.
          const bounds = await element.evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); const rect = range.getBoundingClientRect(); return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height }; });
          if (bounds.width < 1 || bounds.height < 1 || bounds.x < 0 || bounds.y < 0) throw new Error(`${surface}: no capturable rendered bounds`);
          const file = `${item.id}-${surface}.png`;
          await page.screenshot({ path: resolve(output, file), clip: bounds, animations: 'disabled' });
          result.surfaces.push({ surface, file });
        }
        result.file = `${item.id}.png`;
        await page.screenshot({ path: resolve(output, result.file), fullPage: true, animations: 'disabled' });
      } catch (error) { result.error = error.message; process.exitCode = 1; }
    }
  } finally {
    await browser.close();
    await writeFile(resolve(output, 'index.json'), JSON.stringify(evidence, null, 2) + '\n');
    await writeFile(resolve(output, 'gallery.html'), renderGallery(evidence));
  }
  console.log(`Wrote ${evidence.cases.length} case results to ${output}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
