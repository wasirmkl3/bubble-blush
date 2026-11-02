'use strict';
/* Tiny IndexedDB wrapper. All shop data lives in the browser profile on this laptop. */
const DB = (() => {
  const NAME = 'bubble-blush-pos';
  const VERSION = 1;
  const STORES = ['settings', 'categories', 'items', 'toppings', 'ingredients', 'stockMoves', 'orders', 'expenses', 'dayCloses'];
  const INDEXES = {
    orders: ['dayKey', 'customerPhone'],
    expenses: ['dayKey'],
    stockMoves: ['dayKey', 'orderId', 'ingId'],
  };
  let db = null;

  const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const os = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store);

  return {
    STORES,
    open() {
      return new Promise((res, rej) => {
        if (!window.indexedDB) { rej(new Error('This browser cannot store data (IndexedDB missing). Please use Microsoft Edge or Google Chrome.')); return; }
        const req = indexedDB.open(NAME, VERSION);
        req.onupgradeneeded = () => {
          const d = req.result;
          STORES.forEach((s) => {
            if (d.objectStoreNames.contains(s)) return;
            const store = d.createObjectStore(s, { keyPath: 'id' });
            (INDEXES[s] || []).forEach((ix) => store.createIndex(ix, ix));
          });
        };
        req.onsuccess = () => { db = req.result; res(db); };
        req.onerror = () => rej(req.error);
        req.onblocked = () => rej(new Error('The POS is open in another window. Close other POS windows and try again.'));
      });
    },
    all: (s) => wrap(os(s).getAll()),
    get: (s, id) => wrap(os(s).get(id)),
    put: (s, v) => wrap(os(s, 'readwrite').put(v)),
    del: (s, id) => wrap(os(s, 'readwrite').delete(id)),
    byIndex: (s, ix, key) => wrap(os(s).index(ix).getAll(key)),
    byRange: (s, ix, from, to) => wrap(os(s).index(ix).getAll(IDBKeyRange.bound(from, to))),
    count: (s) => wrap(os(s).count()),
    /* Run several writes atomically: fn receives {storeName: objectStore}. */
    transact(stores, fn) {
      return new Promise((res, rej) => {
        const t = db.transaction(stores, 'readwrite');
        const o = {};
        stores.forEach((s) => { o[s] = t.objectStore(s); });
        try { fn(o); } catch (e) { t.abort(); rej(e); return; }
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('Save cancelled'));
      });
    },
  };
})();
