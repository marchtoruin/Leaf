import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const {renderMarkdown} = await import('../src/render.js');
test('renders readable GFM, headings, tables, and highlighted code',()=>{
  const result=renderMarkdown('# Hello reader\n\n**Rich text**\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n- [x] Done');
  assert.equal(result.querySelector('h1').id,'hello-reader');
  assert.equal(result.querySelector('strong').textContent,'Rich text');
  assert.ok(result.querySelector('.table-wrap table td'));
  assert.ok(result.querySelector('pre code .hljs-keyword'));
  assert.ok(result.querySelector('input').disabled);
});
test('removes active HTML and dangerous link protocols',()=>{
  const result=renderMarkdown('<script>alert(1)</script><img src="x" onerror="alert(1)"><iframe src="https://example.com"></iframe>\n\n[bad](javascript:alert%281%29)\n\n<input type="text" autofocus>');
  assert.equal(result.querySelector('script,iframe,input,[onerror]'),null);
  assert.equal(result.querySelector('a').getAttribute('href'),null);
});
test('handles duplicate headings and unknown code languages',()=>{
  const result=renderMarkdown('# Same\n# Same\n```unknownlang\n<unsafe>\n```');
  assert.deepEqual([...result.querySelectorAll('h1')].map(h=>h.id),['same','same-1']);
  assert.equal(result.querySelector('code').textContent,'<unsafe>\n');
  assert.equal(result.querySelector('unsafe'),null);
});
