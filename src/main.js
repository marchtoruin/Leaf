import './style.css';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { renderMarkdown } from './render.js';
import { attachFormatting } from './format.js';
import { guardWindowClose } from './window-close.js';

const native = !!window.__TAURI_INTERNALS__;
const el = id => document.getElementById(id);
const article = el('document');
const preview = el('preview');
const source = el('source');
const welcome = article.firstElementChild;
let file;
let baseline = '';
let editing = false;
let busy = false;
let noticeTimer;
let previewTimer;

const theme = el('theme');
const stored = localStorage.getItem('theme');
theme.value = [...theme.options].some(option => option.value === stored) ? stored :
  matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
function applyTheme() {
  document.body.dataset.theme = theme.value;
  document.body.classList.toggle('dark', theme.value !== 'light');
}
applyTheme();
theme.onchange = () => {
  applyTheme();
  localStorage.setItem('theme', theme.value);
};

function notice(message, persistent = false) {
  const status = el('notice');
  status.textContent = message;
  status.hidden = false;
  clearTimeout(noticeTimer);
  if (!persistent) noticeTimer = setTimeout(() => { status.hidden = true; }, 5000);
}

const dirty = () => source.value !== baseline;
function updateStatus() {
  el('filename').textContent = (file?.name ?? (editing || dirty() ? 'Untitled.md' : 'Markdown, beautifully read.')) +
    (dirty() ? ' •' : '');
  el('save').disabled = busy || (!!file?.path && !dirty());
  el('save-as').disabled = busy;
  const count = source.value.match(/\S+/g)?.length ?? 0;
  el('status').textContent = file || editing || dirty()
    ? `${count.toLocaleString()} words · ${Math.max(1, Math.ceil(count / 220))} min read`
    : 'Made for reading.';
}

function renderInto(target) {
  target.replaceChildren(renderMarkdown(source.value));
  for (const code of target.querySelectorAll('pre code')) {
    const button = document.createElement('button');
    button.className = 'copy';
    button.textContent = 'Copy';
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = 'Copy'; }, 1500);
      } catch {
        notice('Could not access the clipboard.');
      }
    };
    code.parentElement.append(button);
  }
  const path = file?.path;
  for (const image of target.querySelectorAll('img')) {
    const src = image.getAttribute('src');
    if (native && path && src && !/^(https?:|data:|asset:)/i.test(src)) {
      Promise.resolve().then(() => invoke('resolve_image', {
        documentPath: path, relative: decodeURIComponent(src)
      })).then(result => { image.src = convertFileSrc(result); })
        .catch(() => { image.removeAttribute('src'); });
    }
  }
}

function setEditing(value) {
  editing = value;
  clearTimeout(previewTimer);
  document.body.classList.toggle('editing', value);
  el('editor').hidden = !value;
  article.hidden = value;
  el('edit').textContent = value ? 'Read' : 'Edit';
  if (value) {
    renderInto(preview);
    source.focus();
  } else if (file || dirty()) {
    renderInto(article);
  } else {
    article.replaceChildren(welcome);
  }
  updateStatus();
}

function updateTitle() {
  document.title = file ? `${file.name} — Leaf` : 'Leaf — Markdown Reader';
}

function showFile(document) {
  file = document;
  source.value = document.content;
  baseline = source.value;
  updateTitle();
  setEditing(false);
  window.scrollTo(0, 0);
}

function confirmDiscard() {
  if (!dirty()) return Promise.resolve(true);
  const dialog = el('unsaved');
  if (dialog.open) return Promise.resolve(false);
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'discard'), { once: true });
    dialog.returnValue = 'keep';
    dialog.showModal();
  });
}

async function run(action, discard = false) {
  if (busy || el('unsaved').open || (discard && !(await confirmDiscard()))) return;
  if (busy) return;
  busy = true;
  source.readOnly = true;
  updateStatus();
  try {
    await action();
  } catch (error) {
    notice(String(error), true);
  } finally {
    busy = false;
    source.readOnly = false;
    updateStatus();
  }
}

function openPath(path) {
  return run(async () => showFile(await invoke('read_document', { path })), true);
}

function openFile() {
  return run(async () => {
    if (native) {
      const selected = await invoke('pick_document');
      if (selected) showFile(selected);
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.mdown,.mkd';
      const selected = await new Promise(resolve => {
        input.onchange = () => resolve(input.files[0]);
        input.oncancel = () => resolve(null);
        input.click();
      });
      if (selected) showFile({ name: selected.name, content: await selected.text() });
    }
  }, true);
}

function save(asCopy = false) {
  return run(async () => {
    if (!native) throw new Error('Open Leaf for Windows to save Markdown files.');
    const draft = source.value;
    const lineEnding = /\r\n|\r|\n/.exec(file?.content ?? '')?.[0];
    const content = lineEnding && lineEnding !== '\n' ? draft.replaceAll('\n', lineEnding) : draft;
    if (!asCopy && file?.path && !dirty()) return;
    const saved = !asCopy && file?.path
      ? await invoke('save_document', { path: file.path, content, expected: file.snapshot })
      : await invoke('save_document_as', { name: file?.name ?? 'Untitled.md', content });
    if (!saved) return;
    file = saved;
    baseline = draft;
    updateTitle();
    renderInto(editing ? preview : article);
    notice('Saved.');
  });
}

source.oninput = () => {
  updateStatus();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => renderInto(preview), 90);
};
attachFormatting(el('format'), source);

el('open').onclick = openFile;
el('welcome-open').onclick = openFile;
el('edit').onclick = () => { if (!busy) setEditing(!editing); };
el('save').onclick = () => save();
el('save-as').onclick = () => save(true);
document.querySelector('.brand').onclick = event => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || el('unsaved').open) return;
  const key = event.key.toLowerCase();
  if (key === 'o' || (key === 's' && (file || editing || dirty()))) {
    event.preventDefault();
    if (key === 'o') openFile();
    else save(event.shiftKey);
  }
});

for (const target of [article, preview]) {
  target.addEventListener('click', event => {
    const href = event.target.closest('a')?.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(href)) {
      if (native) run(() => invoke('open_link', { url: href }));
      else window.open(href, '_blank', 'noopener');
    } else if (native && file?.path) {
      run(async () => {
        const path = await invoke('resolve_document', {
          documentPath: file.path, relative: decodeURIComponent(href.split('#')[0])
        });
        showFile(await invoke('read_document', { path }));
      }, true);
    }
  });
}

if (native) {
  const win = getCurrentWebviewWindow();
  await guardWindowClose(win, {
    isDirty: dirty,
    isBusy: () => busy,
    confirmDiscard,
    reportError: error => notice(String(error), true)
  });
  await win.onDragDropEvent(event => {
    document.body.classList.toggle('dragging', ['enter', 'over'].includes(event.payload.type));
    if (event.payload.type === 'drop' && event.payload.paths[0]) openPath(event.payload.paths[0]);
  });
  await run(async () => {
    const initial = await invoke('startup_document');
    if (initial) showFile(initial);
  });
} else {
  window.addEventListener('beforeunload', event => {
    if (dirty()) event.preventDefault();
  });
  document.addEventListener('dragover', event => {
    event.preventDefault();
    document.body.classList.add('dragging');
  });
  document.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
  document.addEventListener('drop', event => {
    event.preventDefault();
    document.body.classList.remove('dragging');
    const dropped = event.dataTransfer.files[0];
    if (dropped) run(async () => showFile({ name: dropped.name, content: await dropped.text() }), true);
  });
  updateStatus();
}
