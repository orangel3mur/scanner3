// Web Worker timer - runs in a separate thread and is NOT throttled by the browser
// when the tab is in the background or screen is off.

self.onmessage = function (e) {
  const { type, delay, id } = e.data;
  if (type === 'setTimeout') {
    setTimeout(() => {
      self.postMessage({ type: 'tick', id });
    }, delay);
  }
};
