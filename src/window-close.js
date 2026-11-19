export function guardWindowClose(win, { isDirty, isBusy, confirmDiscard, reportError }) {
  let confirming = false;
  return win.onCloseRequested(async event => {
    if (confirming || isBusy()) {
      event.preventDefault();
      return;
    }
    if (!isDirty()) return;

    event.preventDefault();
    confirming = true;
    try {
      if (await confirmDiscard()) await win.destroy();
    } catch (error) {
      reportError(error);
    } finally {
      confirming = false;
    }
  });
}