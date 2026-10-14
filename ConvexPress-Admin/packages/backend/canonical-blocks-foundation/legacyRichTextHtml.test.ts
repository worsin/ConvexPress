import {expect,test} from 'bun:test';
import {migrateLegacyBlocks,reviewLegacyBlocks,type LegacyBlockOptions} from './legacyBlockMigration';
import {LegacyMigrationError,migrateLegacyDocument} from './legacyDocumentMigration';
import {canonicalJson,sha256Hex} from './shared/fingerprints';

const html:LegacyBlockOptions={richTextFormat:'html'};
const richText=(id:string,attrs:Record<string,string>)=>({id,name:'core/rich-text',version:1,attrs});
const convert=(blocks:unknown[],options:LegacyBlockOptions=html)=>reviewLegacyBlocks(blocks,options).blocks;
const text=(value:string,marks?:unknown[])=>({type:'text',text:value,...(marks?{marks}:{})});
const doc=(...content:unknown[])=>({type:'doc',content});
const paragraph=(...content:unknown[])=>({type:'paragraph',content});
const item=(...content:unknown[])=>({text:doc(paragraph(...content))});
const refusal=(run:()=>unknown)=>{
  try{run();}catch(error){if(error instanceof LegacyMigrationError)return {path:error.path,message:error.message};throw error;}
  throw new Error('Expected a lossless-conversion refusal');
};
const CASEMEDIX_BODY='<p><strong>Title</strong></p><p>Text about complete records.</p><ul><li>a</li><li>b</li></ul><p>More with <a href="/terms">Terms</a> and <a href="mailto:x@y.z">mail</a><br/>next line</p>';

test('an HTML rich-text body becomes rich text, a list and rich text, with the heading only on the first block',()=>{
  const source=[richText('intro',{eyebrow:'Why',heading:'Records',body:CASEMEDIX_BODY})];
  const before=structuredClone(source);
  const blocks=convert(source);
  expect(source).toEqual(before);
  expect(blocks).toEqual([
    {id:'intro',name:'core/rich-text',version:2,attrs:{eyebrow:'Why',heading:'Records',body:doc(paragraph(text('Title',[{type:'bold'}])),paragraph(text('Text about complete records.')))}},
    {id:'intro-2',name:'core/list',version:2,attrs:{style:'bullet',items:[item(text('a')),item(text('b'))]}},
    {id:'intro-3',name:'core/rich-text',version:2,attrs:{eyebrow:'',heading:'',body:doc(paragraph(
      text('More with '),text('Terms',[{type:'link',attrs:{href:'/terms'}}]),text(' and '),text('mail',[{type:'link',attrs:{href:'mailto:x@y.z'}}]),{type:'hardBreak'},text('next line'),
    ))}},
  ]);
  expect(convert(source)).toEqual(blocks);
  expect(reviewLegacyBlocks(source,html).inactiveSettings).toEqual([]);
});

test('HTML marks, entities, a declared link target and formatting whitespace are kept exactly',()=>{
  const [block]=convert([richText('marks',{body:'<p><b>B</b> <i>I</i> <em>E</em> <s>S</s> <u>U</u> <code>C</code> &amp; <a href="https://example.org/a?x=1&amp;y=2" target="_blank">out</a></p>\n\n<p>Second</p>'})]);
  expect(block.attrs).toEqual({eyebrow:'',heading:'',body:doc(paragraph(
    text('B',[{type:'bold'}]),text(' '),text('I',[{type:'italic'}]),text(' '),text('E',[{type:'italic'}]),text(' '),text('S',[{type:'strike'}]),text(' '),text('U',[{type:'underline'}]),text(' '),text('C',[{type:'code'}]),text(' & '),
    text('out',[{type:'link',attrs:{href:'https://example.org/a?x=1&y=2',target:'_blank'}}]),
  ),paragraph(text('Second')))});
});

test('ordered and nested lists use the article import mapping with stable derived identities',()=>{
  const ordered=convert([richText('steps',{body:'<p>Steps:</p><ol><li>First</li><li>Second</li></ol>'})]);
  expect(ordered.map(block=>[block.id,block.name])).toEqual([['steps','core/rich-text'],['steps-2','core/list']]);
  expect(ordered[1].attrs).toEqual({style:'ordered',items:[item(text('First')),item(text('Second'))]});
  const nested=convert([richText('tree',{body:'<ul><li>Parent<ul><li>Child</li></ul></li><li><p>Sibling</p></li></ul><p>After</p>'})]);
  type Node={id:string;name:string;children?:Node[]};
  const shape=(node:Node):unknown=>[node.id,node.name,...(node.children?[node.children.map(shape)]:[])];
  // Without a heading or eyebrow the list leads and keeps the source identity.
  expect(nested.map(shape)).toEqual([
    ['tree','core/list',[['tree-2','core/group',[['tree-3','core/paragraph'],['tree-4','core/list']]],['tree-5','core/group',[['tree-6','core/paragraph']]]]],
    ['tree-7','core/rich-text'],
  ]);
  expect(nested[0].children?.[0].children?.[1].attrs).toEqual({style:'bullet',items:[item(text('Child'))]});
  expect(convert([richText('tree',{body:'<ul><li>Parent<ul><li>Child</li></ul></li><li><p>Sibling</p></li></ul><p>After</p>'})])).toEqual(nested);
  // A heading displays before the HTML, so it leads the list in its own block.
  const headed=convert([richText('headed',{heading:'What to bring',body:'<ul><li>ID</li></ul>'})]);
  expect(headed.map(block=>[block.id,block.name])).toEqual([['headed','core/rich-text'],['headed-2','core/list']]);
  expect(headed[0].attrs).toEqual({eyebrow:'',heading:'What to bring',body:doc()});
});

test('derived identities skip identities other source blocks declare',()=>{
  const blocks=convert([
    richText('a',{body:'<p>One</p><ul><li>x</li></ul><p>Two</p>'}),
    richText('a-2',{body:'<p>Kept</p>'}),
    {id:'a-3',name:'core/heading',version:1,attrs:{text:'Heading',level:2}},
  ]);
  expect(blocks.map(block=>block.id)).toEqual(['a','a-4','a-5','a-2','a-3']);
  const long='x'.repeat(127);
  expect(refusal(()=>convert([richText(long,{body:'<p>One</p><ul><li>x</li></ul>'})])).path).toEqual(['blocks',0,'id']);
});

test('plain format is unchanged, and untagged text in HTML format keeps the plain conversion',()=>{
  const source=[richText('raw',{heading:'H',body:'<p>Shown as written</p>'})];
  const plain=convert(source,{});
  expect(plain).toEqual(convert(source,{richTextFormat:'plain'}));
  expect(plain).toEqual(migrateLegacyBlocks(source));
  expect(plain).toEqual([{id:'raw',name:'core/rich-text',version:2,attrs:{eyebrow:'',heading:'H',body:doc(paragraph(text('<p>Shown as written</p>')))}}]);
  const prose=[richText('prose',{body:'First paragraph\nsame paragraph\n\nSecond < third'})];
  expect(convert(prose)).toEqual(convert(prose,{}));
  expect(convert([richText('empty',{heading:'Only a heading',body:''})])).toEqual(convert([richText('empty',{heading:'Only a heading',body:''})],{}));
  // A character reference displayed decoded by the old renderer; plain text would show it literally.
  expect(refusal(()=>convert([richText('ref',{body:'Fees &amp; costs'})])).path).toEqual(['blocks',0,'attrs','body']);
});

test('HTML outside the allow-list or without an exact representation refuses the whole conversion at its path',()=>{
  const body=['blocks',0,'attrs','body'];
  const cases:[string,(string|number)[]][]=[
    ['<p>Intro</p><script>bad()</script>',body],
    ['<style>p{color:red}</style><p>Intro</p>',body],
    ['<p class="lead">Intro</p>',body],
    ['<p><a href="/terms" rel="nofollow">Terms</a></p>',body],
    ['<p><a href="/terms" title="Terms">Terms</a></p>',body],
    ['<ul>Loose text<li>x</li></ul>',body],
    ['<p>Unclosed',body],
    ['<p>Comment</p><!-- authored -->',body],
    ['<p><a href="javascript:alert(1)">x</a></p>',[...body,0,'content',0,'marks',0,'attrs','href']],
    ['<p>Safe</p><ul><li>See <a href="&#106;avascript:alert(1)">x</a></li></ul>',[...body,1,'content',0,'content',0,'content',1,'marks',0,'attrs','href']],
    ['<p><a href="/x" target="_top">x</a></p>',[...body,0,'content',0,'marks',0,'attrs','target']],
    ['<p>Kept</p><p></p>',[...body,1]],
    ['<p> </p>',[...body,0]],
    ['<ul><li><p></p></li></ul>',[...body,0,'content',0,'content',0]],
    ['<p>Intro</p><h2>Heading</h2>',[...body,1]],
    ['<ol start="3"><li>Third</li></ol>',[...body,0,'attrs','start']],
    [`<p>${'x'.repeat(2001)}</p>`,[...body,0]],
  ];
  for(const [value,path] of cases){
    const result=refusal(()=>convert([richText('r',{heading:'Kept',body:value})]));
    expect([value,result.path]).toEqual([value,path]);
    expect(result.message.length).toBeGreaterThan(0);
  }
});

test('expanded blocks are charged to the canonical tree budget',()=>{
  const lists='<ul><li>x</li></ul>'.repeat(80);
  expect(refusal(()=>convert([richText('many',{body:`<p>Intro</p>${lists}`})])).message).toContain('budget');
  expect(convert([richText('fits',{body:`<p>Intro</p>${'<ul><li>x</li></ul>'.repeat(79)}`})])).toHaveLength(80);
  let nested='<ul><li>Leaf</li></ul>';
  for(let level=0;level<4;level++)nested=`<ul><li>Parent${nested}</li></ul>`;
  expect(refusal(()=>convert([richText('deep',{body:nested})])).message).toContain('budget');
});

test('the shared list conversion keeps the article import identities',()=>{
  const list=(...items:unknown[])=>({type:'bulletList',content:items});
  const listItem=(...content:unknown[])=>({type:'listItem',content});
  const blocks=migrateLegacyDocument({postId:'persisted-post',content:JSON.stringify(doc(paragraph(text('Intro')),list(listItem(paragraph(text('Parent')),list(listItem(paragraph(text('Child')))))))) });
  const id=(path:(string|number)[])=>`migration_${sha256Hex(canonicalJson({postId:'persisted-post',path})).slice(0,32)}`;
  type Node={id:string;children?:Node[]};
  const ids=(node:Node):unknown=>[node.id,...(node.children?[node.children.map(ids)]:[])];
  expect(blocks.map(ids)).toEqual([
    [id(['content',0])],
    [id(['content',1]),[[id(['content',1,'content',0]),[[id(['content',1,'content',0,'content',0])],[id(['content',1,'content',0,'content',1])]]]]],
  ]);
});
