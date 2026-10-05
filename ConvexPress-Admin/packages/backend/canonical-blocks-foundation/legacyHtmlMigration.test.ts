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
