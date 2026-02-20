import { BitcoinRange } from './types';

const DB_NAME = 'btc_scanner';
const DB_VERSION = 1;
const STORE_NAME = 'ranges';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadRangesAsync(): Promise<BitcoinRange[]> {
  // Migrate from localStorage on first load
  const migrated = localStorage.getItem('btc_scanner_ranges_migrated');
  if (!migrated) {
    const old = localStorage.getItem('btc_scanner_ranges');
    if (old) {
      try {
        const parsed: BitcoinRange[] = JSON.parse(old);
        if (parsed.length > 0) {
          await saveRangesAsync(parsed);
        }
        localStorage.removeItem('btc_scanner_ranges');
      } catch {
        // ignore corrupt data
      }
    }
    localStorage.setItem('btc_scanner_ranges_migrated', '1');
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRangesAsync(ranges: BitcoinRange[]): Promise<void> {
  const db = await openDb();
  // Clear and re-insert all
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const r of ranges) {
      store.put(r);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Batch-insert ranges with progress callback. Does NOT clear existing data first. */
export async function appendRangesBatched(
  ranges: BitcoinRange[],
  batchSize: number,
  onProgress: (done: number) => void
): Promise<void> {
  const db = await openDb();

  for (let i = 0; i < ranges.length; i += batchSize) {
    const batch = ranges.slice(i, i + batchSize);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const r of batch) {
        store.put(r);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    onProgress(Math.min(i + batchSize, ranges.length));
    // Yield so React can repaint
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}

/** Update a single range in-place (used by scanner). */
export async function updateRangeAsync(id: string, update: Partial<BitcoinRange>): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      if (getReq.result) {
        store.put({ ...getReq.result, ...update });
      }
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete ranges by id set */
export async function deleteRangesAsync(ids: Set<string>): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
