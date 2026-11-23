/**
 * The saved-documents list in IndexedDB. localStorage is capped at about 5 MB per
 * site, which a single photo can exceed; IndexedDB allows far more. The whole list
 * is one value under one key, so each save replaces it in a single transaction,
 * just as the localStorage version did.
 */
const DB_NAME = 'layout-new';
const STORE = 'saved-documents';
const KEY = 'records';

export const indexedDbAvailable = () => typeof indexedDB !== 'undefined';

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Unable to open saved documents'));
        request.onblocked = () => reject(new Error('Saved documents are open in an older version of the app'));
    });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDatabase();
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(STORE, mode);
            const request = action(transaction.objectStore(STORE));
            // Resolve on commit, not on the request, so a write has really been stored.
            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = () => reject(storageError(transaction.error));
            transaction.onabort = () => reject(storageError(transaction.error));
        });
    } finally {
        db.close();
    }
}

function storageError(error: DOMException | null): Error {
    if (error?.name === 'QuotaExceededError')
        return new Error(
            'There is not enough storage space to save this document. Try deleting older saved documents.',
        );
    return error ?? new Error('Unable to access saved documents');
}

/** The stored list, or undefined if nothing has been saved to IndexedDB yet. */
export const readStoredRecords = () => run<unknown>('readonly', store => store.get(KEY));

export const writeStoredRecords = (records: unknown) => run('readwrite', store => store.put(records, KEY));
