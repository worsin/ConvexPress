import {expect,test} from 'bun:test';
import {reviewLegacyDocumentSource} from './legacyDocumentMigration';
const review=(content:string)=>reviewLegacyDocumentSource({postId:'html-import',content});
test('HTML import keeps editable headings, paragraph marks, entities and exact link destinations',()=>{
 const result=review('<h2>Original ink &amp; paper</h2><p>Recover <strong>every <em>word</em></strong> and <a href="/studio?x=1&amp;y=2">the studio link</a>.<br>Next &lt;line&gt;.</p>');
 expect(result.importedContent).toBe('html');
 expect(result.blocks.map(b=>b.name)).toEqual(['core/heading','core/paragraph']);
 expect(result.blocks[0].attrs).toEqual({level:2,anchor:'',text:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Original ink & paper'}]}]}});
 expect(result.blocks[1].attrs).toEqual({body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Recover '},{type:'text',text:'every ',marks:[{type:'bold'}]},{type:'text',text:'word',marks:[{type:'bold'},{type:'italic'}]},{type:'text',text:' and '},{type:'text',text:'the studio link',marks:[{type:'link',attrs:{href:'/studio?x=1&y=2'}}]},{type:'text',text:'.'},{type:'hardBreak'},{type:'text',text:'Next <line>.'}]}]}});
 expect(review('<p></p>\n<p>  Kept  spaces </p>').blocks).toHaveLength(2);
});
test('HTML conversion is all-or-nothing for unknown content, parser repairs and unsafe links',()=>{
 for(const content of ['<p>First</p><img src="/asset.png">','<p class="authored">Text</p>','<p><a href="/ok" href="/other">x</a></p>','<p><a href="javascript:alert(1)">x</a></p>','<p><a href="&#106;avascript:alert(1)">x</a></p>','<p><a href="/ok" title="Authored title">x</a></p>','<p>First<p>Second</p>','<p>Unclosed','<p>Good</p></span>','<p>Good</p><!--authored-->','<script>bad()</script>','<p>'+ 'x'.repeat(20001) +'</p>','<p><strong>'.repeat(30)+'x'+'</strong></p>'.repeat(30)]){
  expect(()=>review(content)).toThrow();
 }
});
test('HTML lists import as editable canonical lists, including marks and nesting',()=>{
 const bullets=review('<h2>What to expect</h2>\n<ul>\n  <li><strong>Practice growth</strong> — concrete tactics.</li>\n  <li>Regulatory updates</li>\n</ul>');
 expect(bullets.importedContent).toBe('html');
 expect(bullets.blocks.map(b=>b.name)).toEqual(['core/heading','core/list']);
 expect(bullets.blocks[1].attrs).toEqual({style:'bullet',items:[
  {text:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Practice growth',marks:[{type:'bold'}]},{type:'text',text:' — concrete tactics.'}]}]}},
  {text:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Regulatory updates'}]}]}},
 ]});
 const ordered=review('<ol><li>First</li><li>Second</li></ol>');
 expect(ordered.blocks[0].attrs).toMatchObject({style:'ordered'});
 const nested=review('<ul><li>Parent<ul><li>Child</li></ul></li><li>Sibling</li></ul>');
 expect(nested.blocks[0].name).toBe('core/list');
 expect(nested.blocks[0].children?.map(b=>b.name)).toEqual(['core/group','core/group']);
 expect(JSON.stringify(nested.blocks)).toContain('Child');
});
test('HTML list import refuses anything it cannot represent exactly',()=>{
 for(const content of ['<li>Orphan item</li>','<ul>Loose text<li>x</li></ul>','<p><ul><li>x</li></ul></p>','<ul class="x"><li>x</li></ul>','<ul><li class="x">x</li></ul>','<ul><li>  </li></ul>','<ul></ul>','<ol start="3"><li>x</li></ol>','<ol start="two"><li>x</li></ol>','<ul><li><h2>x</h2></li></ul>']){
  expect(()=>review(content)).toThrow();
 }
});
