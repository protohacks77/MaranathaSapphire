// SDK snapshots stay in memory here; Firestore owns their persistent IndexedDB cache.
type Entry = { value: unknown; expiresAt: number };
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
export async function cachedRead<T>(key: string, loader: () => Promise<T>, ttl: number | ((value: T) => number) = 60_000): Promise<T> {
    const hit = entries.get(key);
    if (hit && (hit.expiresAt > Date.now() || (typeof navigator !== 'undefined' && !navigator.onLine))) return hit.value as T;
    const running = pending.get(key);
    if (running) return running as Promise<T>;
    const request = loader().then(value => {
        if (pending.get(key) === request) {
            if (entries.size >= 300) entries.delete(entries.keys().next().value!);
            entries.set(key, { value, expiresAt: Date.now() + (typeof ttl === 'function' ? ttl(value) : ttl) });
        }
        return value;
    }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
    pending.set(key, request);
    return request;
}
export function invalidateReads(prefix = '') {
    for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
    for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key);
}
