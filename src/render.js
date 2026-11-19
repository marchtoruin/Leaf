import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
export function renderMarkdown(source) {
  const html = DOMPurify.sanitize(marked.parse(source, { gfm: true }), { FORBID_TAGS: ['style','form'], FORBID_ATTR: ['style'] });
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('input').forEach(input => { if(input.type !== 'checkbox') input.remove(); else input.disabled = true; });
  const ids = new Set();
  template.content.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(heading => {
    const base = heading.textContent.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,'').trim().replace(/\s+/g,'-') || 'heading';
    let id = base, suffix = 1; while(ids.has(id)) id = `${base}-${suffix++}`;
    ids.add(id); heading.id = id;
  });
  template.content.querySelectorAll('pre code').forEach(code => {
    const language = [...code.classList].find(c => c.startsWith('language-'))?.slice(9);
    if (language && hljs.getLanguage(language)) code.innerHTML = hljs.highlight(code.textContent, {language}).value;
  });
  template.content.querySelectorAll('table').forEach(table => {
    const wrap = document.createElement('div'); wrap.className = 'table-wrap'; table.replaceWith(wrap); wrap.append(table);
  });
  return template.content;
}
