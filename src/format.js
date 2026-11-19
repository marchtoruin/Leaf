const inline = {
  bold: ['**', '**', 'bold'],
  italic: ['*', '*', 'italic'],
  link: ['[', '](https://)', 'link text'],
  code: ['`', '`', 'code'],
  block: ['```\n', '\n```', 'code']
};
const prefixes = { heading: '## ', list: '- ', numbered: '1. ', quote: '> ' };

export function attachFormatting(toolbar, source) {
  toolbar.addEventListener('click', event => {
    const action = event.target.closest('[data-format]')?.dataset.format;
    if (!action || source.readOnly) return;
    let start = source.selectionStart;
    let end = source.selectionEnd;
    let replacement;
    let selectedStart;
    let selectedEnd;

    if (prefixes[action]) {
      start = start === 0 ? 0 : source.value.lastIndexOf('\n', start - 1) + 1;
      const next = source.value.indexOf('\n', end > start && source.value[end - 1] === '\n' ? end - 1 : end);
      end = next === -1 ? source.value.length : next;
      const lines = (source.value.slice(start, end) || 'Text').split('\n');
      replacement = lines.map(line => prefixes[action] + line).join('\n');
      selectedStart = start;
      selectedEnd = start + replacement.length;
    } else {
      const [before, after, placeholder] = inline[action];
      const selected = source.value.slice(start, end) || placeholder;
      const leading = action === 'block' && start > 0 && source.value[start - 1] !== '\n' ? '\n' : '';
      const trailing = action === 'block' && end < source.value.length && source.value[end] !== '\n' ? '\n' : '';
      replacement = leading + before + selected + after + trailing;
      selectedStart = start + leading.length + before.length;
      selectedEnd = selectedStart + selected.length;
      if (action === 'link' && end > start) {
        selectedStart = selectedEnd + 2;
        selectedEnd = selectedStart + 'https://'.length;
      }
    }

    source.focus();
    source.setSelectionRange(start, end);
    // insertText retains a native undo entry. Fall back when the command is unavailable.
    if (!document.execCommand?.('insertText', false, replacement)) {
      source.setRangeText(replacement, start, end);
      source.dispatchEvent(new Event('input'));
    }
    source.setSelectionRange(selectedStart, selectedEnd);
  });
}
