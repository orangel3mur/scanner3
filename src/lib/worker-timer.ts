// Accurate timer using a Web Worker that isn't throttled in background tabs.
// Falls back to regular setTimeout if the worker can't be created.

type PendingResolve = () => void;

let worker: Worker | null = null;
let callbackId = 0;
const pending = new Map<number, PendingResolve>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker('/timer-worker.js');
    worker.onmessage = (e) => {
      const { type, id } = e.data;
      if (type === 'tick') {
        const resolve = pending.get(id);
        if (resolve) {
          pending.delete(id);
          resolve();
        }
      }
    };
    worker.onerror = () => {
      // If worker fails, we'll fall back to setTimeout
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

/**
 * A setTimeout replacement that uses a Web Worker for accurate timing
 * even when the browser tab is in the background.
 */
export function workerDelay(ms: number): Promise<void> {
  const w = getWorker();
  if (!w) {
    // Fallback to regular setTimeout
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const id = ++callbackId;
  return new Promise<void>(resolve => {
    pending.set(id, resolve);
    w.postMessage({ type: 'setTimeout', delay: ms, id });
  });
}

export function terminateWorkerTimer(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pending.clear();
}
