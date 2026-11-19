import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guardWindowClose } from '../src/window-close.js';

const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url)));
function windowFixture() {
  let handler;
  let destroyed = 0;
  const win = {
    onCloseRequested(callback) { handler = callback; },
    async destroy() {
      assert.ok(capability.permissions.includes('core:window:allow-destroy'));
      destroyed++;
    }
  };
  return {
    win,
    destroyed: () => destroyed,
    async requestClose() {
      let prevented = false;
      await handler({ preventDefault() { prevented = true; } });
      // Match Tauri's onCloseRequested contract for unhandled requests.
      if (!prevented) await win.destroy();
    }
  };
}

test('clean windows close, including after a save', async () => {
  for (const initiallyDirty of [false, true]) {
    const fixture = windowFixture();
    let dirty = initiallyDirty;
    guardWindowClose(fixture.win, {
      isDirty: () => dirty,
      isBusy: () => false,
      confirmDiscard: () => assert.fail('A clean window should not prompt'),
      reportError: assert.fail
    });
    if (initiallyDirty) dirty = false;
    await fixture.requestClose();
    assert.equal(fixture.destroyed(), 1);
  }
});

test('a dirty window stays open on Cancel and closes once on Discard', async () => {
  const fixture = windowFixture();
  let finish;
  let prompts = 0;
  guardWindowClose(fixture.win, {
    isDirty: () => true,
    isBusy: () => false,
    confirmDiscard: () => {
      prompts++;
      return new Promise(resolve => { finish = resolve; });
    },
    reportError: assert.fail
  });
  const first = fixture.requestClose();
  await fixture.requestClose();
  assert.equal(prompts, 1);
  finish(false);
  await first;
  assert.equal(fixture.destroyed(), 0);
  const second = fixture.requestClose();
  finish(true);
  await second;
  assert.equal(fixture.destroyed(), 1);
});

test('closing during a save is blocked', async () => {
  const fixture = windowFixture();
  guardWindowClose(fixture.win, {
    isDirty: () => false,
    isBusy: () => true,
    confirmDiscard: () => assert.fail('Blocked close should not prompt'),
    reportError: assert.fail
  });
  await fixture.requestClose();
  assert.equal(fixture.destroyed(), 0);
});