import {expect, test} from 'bun:test';
import {navigationTreeIndex} from './navigationTree';
import {navigationResultSchemas} from './navigationContracts';
const heading = (id: string, text: string, anchor = '') => ({id, name: 'core/heading', version: 2, attrs: {anchor, level: 2, text: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text, marks: [{type: 'bold'}]}]}]}}});
test('heading anchors are stable, distinct and shared with exact authored anchors', () => {
  const nodes = [heading('one','Same title'), heading('two','Same title','authored-id')];
  const result = navigationTreeIndex(nodes);
  expect(result.headings.map(item => item.label)).toEqual(['Same title','Same title']);
  expect(result.headingAnchors.two).toBe('authored-id');
  expect(result.headingAnchors.one === result.headingAnchors.two).toBe(false);
  expect(navigationTreeIndex([nodes[1], nodes[0]]).headingAnchors.one).toBe(result.headingAnchors.one);
  const conflict = navigationTreeIndex([...nodes, heading('three','Collision',result.headingAnchors.one)]);
  expect(conflict.headingAnchors.one).toBe(result.headingAnchors.one + '-2');
  expect(conflict.headingAnchors.three).toBe(result.headingAnchors.one);
  expect(new Set(Object.values(conflict.headingAnchors)).size).toBe(3);
});
test('nested headings preserve levels and inline text without exposing markup or duplicate IDs', () => {
  const node = {...heading('inner','Safe <text>'), anchor:'chapter'};
  const result = navigationTreeIndex([{id:'group',name:'core/group',version:1,attrs:{},children:[node]}]);
  expect(result.headings[0].label).toBe('Safe <text>');
  expect(result.anchors).toEqual([{label:'Safe <text>',anchor:'chapter'}]);
  expect(result.headingAnchors.inner === 'chapter').toBe(false);
  expect(() => navigationTreeIndex([heading('one','A','same'),heading('two','B','same')])).toThrow();
});
test('navigation DTOs refuse non-public shape, unsafe paths and credential media', () => {
  expect(navigationResultSchemas['content.breadcrumbs'].safeParse({items:[{label:'Hidden',href:'https://evil.invalid',current:false}],currentPath:'/page/story'}).success).toBe(false);
  expect(navigationResultSchemas['site.info'].safeParse({name:'Site',tagline:null,logo:null,adminEmail:'private@example.invalid'}).success).toBe(false);
  expect(navigationResultSchemas['site.info'].safeParse({name:'Site',tagline:null,logo:{src:'https://token@media.invalid/pic',alt:''}}).success).toBe(false);
});

test('manual jump links require a real target in the same current tree', () => {
  const nav = {id:'jump',name:'core/anchor-nav',version:1,attrs:{source:'manual',items:[{label:'Chapter',anchor:'chapter'}]}};
  expect(() => navigationTreeIndex([nav])).toThrow('Anchor navigation target is absent');
  expect(navigationTreeIndex([nav,heading('chapter-title','Chapter','chapter')]).headings[0].anchor).toBe('chapter');
});
