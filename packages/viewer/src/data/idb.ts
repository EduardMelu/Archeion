// Native IndexedDB for layouts and trail drafts, written at save boundaries, never per frame.
// Losing this cache can never corrupt committed knowledge or imply a comparison succeeded.
const DB_NAME = "archeion";
const STORES = ["layouts", "trails"] as const;
type Store = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const store of STORES) request.result.createObjectStore(store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

function transact<T>(
  store: Store,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function cacheGet<T>(store: Store, key: string): Promise<T | undefined> {
  try {
    return await transact<T>(store, "readonly", (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function cachePut(store: Store, key: string, value: unknown): Promise<boolean> {
  try {
    await transact(store, "readwrite", (s) => s.put(value, key));
    return true;
  } catch {
    return false;
  }
}

export async function cacheDelete(store: Store, key: string): Promise<boolean> {
  try {
    await transact(store, "readwrite", (s) => s.delete(key));
    return true;
  } catch {
    return false;
  }
}

export async function cacheAll<T>(store: Store): Promise<T[] | null> {
  try {
    return await transact<T[]>(store, "readonly", (s) => s.getAll());
  } catch {
    return null;
  }
}
