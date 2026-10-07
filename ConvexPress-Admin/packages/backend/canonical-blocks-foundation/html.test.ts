import {expect,test} from 'bun:test';
import {blockHtmlText,sanitizeBlockHtml} from './html';
test('HTML search follows parsed sanitizer text, joins inline runs and separates block boundaries',()=>{
 const input='<h2>Header</h2><p>Sun<strong>flower</strong><br>garden &amp; &#x45;arth &lt;literal&gt; &amp;lt;notDecodedTwice&amp;gt;</p><ul><li>One</li><li>Two</li></ul>';
 expect(blockHtmlText(input)).toBe('Header Sunflower garden & Earth <literal> &lt;notDecodedTwice&gt; One Two');
});
test('discarded HTML content and attributes cannot become search prose; discarded hiding attributes do not hide remaining text',()=>{
 const input='<p hidden class="secret" onclick="secret">Visible</p><script>Scriptsecret</script><style>Stylesecret</style><textarea>Areasecret</textarea><option>Optionsecret</option><xmp>Xmpsecret</xmp><a href="https://example.invalid/private" title="secret" target="_blank">Label</a><!--Commentsecret-->';
 expect(blockHtmlText(input)).toBe('Visible Label');const safe=sanitizeBlockHtml(input);
 expect(safe).toContain('rel="noopener noreferrer"');expect(safe).not.toContain('hidden');expect(safe).not.toContain('onclick');
});
