import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMarkdownToJSON} from '../../app/src/core/parser.ts';
test('article rich text removes executable HTML while retaining formatting and safe links',()=>{
 const blocks=parseMarkdownToJSON('正文 <strong>重点</strong> <img src="x" onerror="window.__xss=1"> <a href="jav&#97;script:alert(1)">链接</a> <span style="position:fixed;inset:0;color:#059669;background-image:url(https://evil.example/track)">文字</span>');
 const html=blocks.map(b=>b.content).join('');assert.ok(!/onerror|javascript:|position:|inset:|background-image/i.test(html));assert.match(html,/<strong>重点<\/strong>/);assert.match(html,/color:\s*#059669/);
 const safe=parseMarkdownToJSON('安全 [链接](https://example.com) 与 `a < b`');assert.match(safe[0].content,/href="https:\/\/example.com"/);assert.match(safe[0].content,/a &lt; b/);
});
test('nested article components discard scriptable embeds and preserve code examples',()=>{
 const blocks=parseMarkdownToJSON('<ScrollCard title="示例">\n<script>window.__xss=1</script><iframe srcdoc="<script>alert(1)</script>"></iframe><p>可保留的正文</p>\n</ScrollCard>\n\n```html\n<img src=x onerror=alert(1)>\n```');
 const html=JSON.stringify(blocks);assert.ok(!html.includes('window.__xss'));assert.ok(!html.includes('<iframe'));assert.ok(html.includes('可保留的正文'));assert.ok(html.includes('&lt;img'));
});
test('safe emphasis gradients and double underlines survive filtering',()=>{
 const normal=parseMarkdownToJSON('**重点**');assert.match(normal[0].content,/linear-gradient/);
 const band=parseMarkdownToJSON('**重点**',undefined,undefined,{styleId:'light-band',color:'#059669'});assert.match(band[0].content,/linear-gradient/);
 const classic=parseMarkdownToJSON('**重点**',undefined,{id:'classic'});assert.match(classic[0].content,/double/);
});
test('code inside a scroll card uses visible line breaks and preserves indentation',()=>{
 const [card]=parseMarkdownToJSON('<ScrollCard title="员工档案示例" hint="滑动查看">\n```markdown\n## 我是谁\n\n  const a = "<b>";\n最后一行\n```\n</ScrollCard>');
 assert.equal(card.type,'scroll_card');
 assert.doesNotMatch(card.content,/<pre\b/);
 assert.match(card.content,/## 我是谁<br\s*\/?>\s*<br\s*\/?>\s*(?:&nbsp;|\u00a0){2}const a = "&lt;b&gt;";<br\s*\/?>最后一行/);
 assert.match(card.content,/word-break\s*:\s*break-all/);
});
