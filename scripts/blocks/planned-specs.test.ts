import { expect, test, beforeAll, afterAll } from 'bun:test';
import { readFile, mkdtemp, writeFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { parseBlockSpec, attrsSchema } from './schema.mjs';
import { dependencyFields, generateArtifacts } from './generator.mjs';
import { discoverBlocks } from './discovery.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = new URL('../../', import.meta.url);
const spec = async (name: string) => parseBlockSpec(JSON.parse(await readFile(new URL(`blocks/${name}/block.json`, root), 'utf8')));
let output = '';
let generatedValidate: (name: string, attrs: unknown) => any;
beforeAll(async () => {
  output = await mkdtemp(fileURLToPath(new URL('ConvexPress-Admin/.block-planned-test-', root)));
  const files = await generateArtifacts(await discoverBlocks(fileURLToPath(root)));
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(output, name), content as string);
  generatedValidate = (await import(path.join(output, 'schemas.ts'))).validateBlockAttrs;
});
afterAll(async () => { if (output) { for (const name of await readdir(output)) await unlink(path.join(output, name)); await rmdir(output); } });
const validate = async (name: string, attrs: unknown) => generatedValidate(name, attrs);

test('planned business hours reject impossible/ambiguous schedules while preserving explicit closed and unspecified days', async () => {
  const input = { timezone: 'America/Denver', week: [{ day: 'monday', intervals: [{ opensAtMinute: 540, closesAtMinute: 1020 }] }, { day: 'sunday', intervals: [] }] };
  expect((await validate('business/opening-hours', input)).week).toEqual(input.week);
  for (const attrs of [
    { timezone: 'Not/A_Zone' },
    { week: [{ day: 'monday', intervals: [] }, { day: 'monday', intervals: [] }] },
    { week: [{ day: 'monday', intervals: [{ opensAtMinute: 900, closesAtMinute: 600 }] }] },
    { week: [{ day: 'monday', intervals: [{ opensAtMinute: 500, closesAtMinute: 700 }, { opensAtMinute: 650, closesAtMinute: 900 }] }] },
    { week: [{ intervals: [] }] }, { week: [{ day: 'monday', intervals: [{}] }] },
    { exceptions: [{ date: '2026-09-10', intervals: [] }, { date: '2026-09-10', intervals: [] }] },
  ]) await expect(validate('business/opening-hours', attrs)).rejects.toThrow();
});
test('table width and media-source contracts are real validators; URLs stay protocol constrained', async () => {
  expect((await validate('core/table', { columns: ['Item', 'Note'], rows: [['Book', 'Bring one']] })).rows).toHaveLength(1);
  await expect(validate('core/table', { columns: ['Item', 'Note'], rows: [['Book']] })).rejects.toThrow();
  await expect(validate('core/video', { media: { id: 'owned-file' }, url: { label: 'Video', href: 'https://video.example.test/watch' } })).rejects.toThrow();
  await expect(validate('core/iframe', { url: { label: 'Frame', href: 'mailto:someone@example.test' } })).rejects.toThrow();
  await expect(validate('core/iframe', { url: { label: 'Frame', href: 'http://example.test/' } })).rejects.toThrow();
  await expect(validate('business/locations', { locations: [{ name: 'Studio', phone: { label: 'Call', href: 'https://example.test' } }] })).rejects.toThrow();
});
test('all planned inventory specs validate examples and retain unmet runtime/plugin requirements', async () => {
  const inventory = JSON.parse(await readFile(new URL('scripts/blocks/fixtures/inventory-2026-09-05.json', root), 'utf8'));
  let planned = 0;
  for (const row of inventory) {
    const current = await spec(row.Name);
    if (row['Exists Today']) continue;
    planned++;
    expect(current.version).toBe(1);
    for (const example of current.examples) expect(attrsSchema(current.fields, current.constraints).safeParse(example).success).toBe(true);
    const dependencies = dependencyFields(current.fields);
    if (dependencies.length) expect(current.requires.capabilities).toContain('reference.targetResolution');
    expect(current.fields.some((field: any) => ['className', 'style', 'gap', 'ratio', 'speed', 'height', 'orientation'].includes(field.id))).toBe(false);
    if (current.supports.children) expect(current.requires.capabilities).toContain('tree.children');
  }
  expect(planned).toBe(82);
  expect((await spec('core/custom-html')).requires.capabilities).toContain('html.sanitize');
  expect((await spec('core/iframe')).requires.capabilities).toContain('embed.sandbox');
  expect((await spec('core/embed')).requires.capabilities).toContain('embed.sandbox');
  expect((await spec('core/script-embed')).requires.capabilities).toContain('embed.approvedScript');
  expect((await spec('commerce/download-library')).requires.capabilities).toContain('viewer.authorization');
  for (const [name, of] of [['commerce/bundle-offer','bundle'],['membership/gated-teaser','membershipPlan'],['gallery/recipe-card','recipe'],['gallery/album','album'],['core/synced','syncedBlock']]) expect(dependencyFields((await spec(name)).fields).some((field: any) => field.of === of)).toBe(true);
});

test('canonical article fields preserve every supported inline mark and refuse unsupported structure without flattening', async () => {
  const inline = [
    ...['bold', 'italic', 'strike', 'underline', 'code'].map(type => ({ type: 'text', text: type, marks: [{ type }] })),
    { type: 'hardBreak' }, { type: 'text', text: 'Read more', marks: [{ type: 'link', attrs: { href: '/field-notes', target: '_self' } }] },
  ];
  const paragraph = { type: 'paragraph', content: inline };
  const doc = { type: 'doc', content: [paragraph] };
  for (const name of ['core/paragraph','core/rich-text']) expect((await validate(name, { body: doc })).body).toEqual(doc);
  expect((await validate('core/heading', { text: doc })).text).toEqual(doc);
  expect((await validate('core/list', { items: [{ text: doc, done: true }] })).items[0]).toEqual({ text: doc, done: true });
  const multiple = { type: 'doc', content: [paragraph, paragraph] };
  await expect(validate('core/heading', { text: multiple })).rejects.toThrow();
  await expect(validate('core/list', { items: [{ text: multiple }] })).rejects.toThrow();
  for (const node of [{ type: 'heading', attrs: { level: 2 }, content: inline }, { type: 'bulletList', content: [] }, { type: 'image', attrs: { src: 'https://example.test/a.png' } }, { type: 'paragraph', attrs: { textAlign: 'right' }, content: inline }]) await expect(validate('core/paragraph', { body: { type: 'doc', content: [node] } })).rejects.toThrow();
  await expect(validate('core/paragraph', { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bad', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] } })).rejects.toThrow();
});

test('table cell associations and footnote anchors fail closed without truncation or renamed keys', async () => {
  const pricing = { plans: [{name:'Open notebook'},{name:'Studio notes'}], rows: [{label:'Exercises',values:['One','Three']}] };
  expect((await validate('core/pricing-table', pricing)).rows).toEqual(pricing.rows);
  for (const values of [[],['One'],['One','Two','Three']]) await expect(validate('core/pricing-table', {...pricing,rows:[{label:'Exercises',values}]})).rejects.toThrow();
  const comparison = {columns:['Detail','Notebook','Studio'],rows:[{label:'Format',cells:['Digital','Print']}]};
  expect((await validate('core/comparison-table', comparison)).rows).toEqual(comparison.rows);
  for(const attrs of [{...comparison,rows:[{label:'Format',cells:['Digital']}]},{...comparison,columns:null},{columns:null,rows:[{label:'Missing headers',cells:[]}]}]) await expect(validate('core/comparison-table',attrs)).rejects.toThrow();
  expect((await validate('core/comparison-table',{columns:null,rows:[]})).columns).toBeNull();
  const note={key:'field-note_2',body:{type:'doc',content:[]}};
  expect((await validate('core/footnotes',{notes:[note]})).notes[0].key).toBe(note.key);
  for(const notes of [[note,note],[{...note,key:'two words'}],[{...note,key:'123'}],[{...note,key:'#fragment'}]]) await expect(validate('core/footnotes',{notes})).rejects.toThrow();
});

test('matrix metadata names a real array field and keeps offsets closed',async()=>{
  const pricing=JSON.parse(await readFile(new URL('blocks/core/pricing-table/block.json',root),'utf8'));
  for(const patch of [{rowField:'missing'},{rowField:'label'},{headerOffset:2},{headerOffset:-1},{headers:'rows',rows:'plans',rowField:'name'}]) expect(()=>parseBlockSpec({...pricing,constraints:[{...pricing.constraints[0],...patch}]})).toThrow();
});
