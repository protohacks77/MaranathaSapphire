// Application views and queue labels are isolated by signed-in user. Firestore
// owns the durable document cache and write queue; this store contains UI views.
let userId = 'signed-out';
let database: Promise<IDBDatabase> | undefined;
const memory = new Map<string, unknown>();
export function setCacheUser(id: string | null) { userId = id || 'signed-out'; memory.clear(); }
export const cacheScope = () => userId;
const scoped = (key: string) => `${userId}:${key}`;
function openDatabase(): Promise<IDBDatabase> {
    if (!database) database = new Promise((resolve, reject) => {
        const request = indexedDB.open('maranatha-offline-views', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('views');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return database;
}
export function peekDeviceCache<T>(key: string): T | undefined { return memory.get(scoped(key)) as T | undefined; }
export async function readDeviceCache<T>(key: string): Promise<T | undefined> {
    const storageKey = scoped(key);
    if (memory.has(storageKey)) return memory.get(storageKey) as T;
    if (typeof indexedDB === 'undefined') return undefined;
    try {
        const db = await openDatabase();
        const value = await new Promise<T | undefined>((resolve, reject) => {
            const request = db.transaction('views').objectStore('views').get(storageKey);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        if (value !== undefined) memory.set(storageKey, value);
        return value;
    } catch { return undefined; }
}
export async function writeDeviceCache(key: string, value: unknown, scope = userId): Promise<void> {
    const storageKey = `${scope}:${key}`;
    memory.set(storageKey, value);
    if (typeof indexedDB === 'undefined') throw new Error('Device storage is unavailable.');
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('views', 'readwrite');
        transaction.objectStore('views').put(value, storageKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

// Preserve the last view for instant rendering, but force refresh after uploads.
export async function markDeviceViewsStale(scope = userId): Promise<void> {
    const prefix = `${scope}:view:`;
    for (const [key, value] of memory) {
        if (key.startsWith(prefix) && value && typeof value === 'object') memory.set(key, { ...value, fetchedAt: 0 });
    }
    if (typeof indexedDB === 'undefined') return;
    try {
        const db = await openDatabase();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('views', 'readwrite');
            const cursor = transaction.objectStore('views').openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
            cursor.onsuccess = () => {
                const entry = cursor.result;
                if (!entry) return;
                entry.update({ ...entry.value, fetchedAt: 0 });
                entry.continue();
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    } catch { /* The Firestore queue remains authoritative if UI caching fails. */ }
}

export async function removeDeviceCache(key: string, scope = userId): Promise<void> {
    const storageKey = `${scope}:${key}`;
    memory.delete(storageKey);
    if (typeof indexedDB === 'undefined') return;
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('views', 'readwrite');
        transaction.objectStore('views').delete(storageKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}
