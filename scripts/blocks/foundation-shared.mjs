import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
export const foundationSharedFiles = { 'shared/legacyHref.ts': 'ConvexPress-Website/apps/web/src/lib/security/url.ts', 'shared/embedProviders.ts': 'ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/embed-providers.ts', 'shared/fingerprints.ts': 'ConvexPress-Admin/packages/site-contract/src/fingerprints.ts', 'shared/authoringFields.ts': 'ConvexPress-Admin/packages/backend/convex/helpers/authoringFields.ts' };
export async function syncFoundationShared({ root, check = false }) {
  const changed = [];
  for (const [name, source] of Object.entries(foundationSharedFiles)) {
    const body = await readFile(path.join(root, source), 'utf8');
    const target = path.join(root, 'ConvexPress-Admin/packages/backend/canonical-blocks-foundation', name);
    let existing; try { existing = await readFile(target, 'utf8'); } catch(error) { if(error.code !== 'ENOENT') throw error; }
    if(existing !== body) { changed.push(name); if(!check) { await mkdir(path.dirname(target), {recursive:true}); await writeFile(target,body); } }
  }
  if(check && changed.length) throw Error(`Stale shared canonical foundation sources: ${changed.join(', ')}`);
  return changed;
}
