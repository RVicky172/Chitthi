/*
 * The small IndexedDB layer the device stores share (lib/db.ts, lib/userFonts.ts, lib/userLuts.ts): opening a
 * database and running one request in a transaction of its own. Results come back as stored, unchecked: each store
 * checks what it reads.
 */

/**
 * Opens a database, creating or upgrading its stores first when needed.
 * @param name the database
 * @param version its current version
 * @param upgrade creates the stores an older version lacks (`oldVersion` is 0 for a new database)
 * @returns the open database
 */
export function openDatabase(name: string, version: number, upgrade: (request: IDBOpenDBRequest, oldVersion: number) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => upgrade(request, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not open.'));
  });
}

/**
 * Runs one request in a transaction of its own.
 * @param database the open database
 * @param storeName the store
 * @param mode read only or read-write
 * @param makeRequest makes the request on the store
 * @returns the request's result once the transaction completes (as stored: unchecked)
 */
export function runRequest(database: IDBDatabase, storeName: string, mode: IDBTransactionMode, makeRequest: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = makeRequest(transaction.objectStore(storeName));
    const fail = () => reject(transaction.error ?? new Error('The storage transaction failed.'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = fail;
    transaction.onabort = fail;
  });
}

/**
 * Runs work over several stores in one transaction: all of it lands, or (on an error or an abort) none of it.
 * @param database the open database
 * @param storeNames the stores the work touches
 * @param mode read only or read-write
 * @param work makes the requests on the stores; what it returns is the transaction's result
 * @returns the work's result once the transaction completes
 */
export function runTransaction<T>(
  database: IDBDatabase,
  storeNames: readonly string[],
  mode: IDBTransactionMode,
  work: (store: (name: string) => IDBObjectStore) => () => T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction([...storeNames], mode);
    const result = work((name) => transaction.objectStore(name));
    const fail = () => reject(transaction.error ?? new DOMException('The storage transaction was aborted.', 'AbortError'));
    transaction.oncomplete = () => resolve(result());
    transaction.onerror = fail;
    transaction.onabort = fail;
  });
}
