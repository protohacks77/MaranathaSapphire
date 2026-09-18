import firebase from 'firebase/compat/app';
import { cacheScope, markDeviceViewsStale, readDeviceCache, writeDeviceCache } from './deviceCache';
import { invalidateReads } from './readCache';
import { beginRefresh, getOfflineStatus, markDataChanged, updateOfflineStatus } from './offlineStatus';

interface PendingSave { id: string; path: string; createdAt: number }
// These are labels only. Firestore's IndexedDB mutation queue stores and retries
// the actual writes, preserving atomic batches and avoiding a second replay queue.
let saves: PendingSave[] = [];
let serial = Promise.resolve();
let scopeVersion = 0;
const monitors = new Map<string, () => void>();
function persistLabels() {
    updateOfflineStatus({ pending: saves.length });
    const labels = [...saves];
    const scope = cacheScope();
    serial = serial.catch(() => {}).then(() => writeDeviceCache('pending-saves', labels, scope));
    return serial;
}
function removeSave(id: string) {
    saves = saves.filter(save => save.id !== id);
    monitors.get(id)?.(); monitors.delete(id);
    void persistLabels().catch(() => {});
}
export async function restorePendingSaves(raw: firebase.firestore.Firestore) {
    const version = ++scopeVersion;
    monitors.forEach(stop => stop()); monitors.clear(); saves = [];
    updateOfflineStatus({ pending: 0 });
    const stored = await readDeviceCache<PendingSave[]>('pending-saves');
    if (version !== scopeVersion) return;
    saves = stored || [];
    updateOfflineStatus({ pending: saves.length });
    for (const save of saves) {
        const stop = raw.doc(save.path).onSnapshot({ includeMetadataChanges: true }, snapshot => {
            if (version === scopeVersion && !snapshot.metadata.hasPendingWrites) removeSave(save.id);
        }, failure => updateOfflineStatus({ error: `A saved record could not sync: ${failure.message}` }));
        monitors.set(save.id, stop);
    }
}

export function withOfflineSupport(raw: firebase.firestore.Firestore, persistenceReady: Promise<boolean>): firebase.firestore.Firestore {
    const wrappers = new WeakMap<object, any>();
    const originals = new WeakMap<object, any>();
    const unwrap = (value: any) => value && typeof value === 'object' ? originals.get(value) || value : value;
    async function save(action: () => Promise<void>, reference?: firebase.firestore.DocumentReference) {
        const durable = await persistenceReady;
        if (!navigator.onLine && !durable) throw new Error('Offline storage is unavailable on this device. Connect to the internet before saving.');
        if (!reference) return action();
        const scope = cacheScope();
        const label: PendingSave = { id: crypto.randomUUID(), path: reference.path, createdAt: Date.now() };
        // Subscribe before writing, so a persisted local mutation can complete the
        // form even though the SDK's write promise waits for server acknowledgement.
        let resolveLocal!: () => void;
        let rejectLocal!: (failure: unknown) => void;
        let resolveInitial!: () => void;
        const local = new Promise<void>((resolve, reject) => { resolveLocal = resolve; rejectLocal = reject; });
        const initial = new Promise<void>(resolve => { resolveInitial = resolve; });
        let writing = false;
        const stop = reference.onSnapshot({ includeMetadataChanges: true }, snapshot => {
            resolveInitial();
            if (writing && snapshot.metadata.hasPendingWrites) resolveLocal();
        }, () => { resolveInitial(); });
        // Consume early listener errors even if the operation hasn't begun yet.
        void local.catch(() => {});
        await Promise.race([initial, new Promise<void>(resolve => setTimeout(resolve, 1500))]);
        saves.push(label);
        try { await persistLabels(); }
        catch (failure) {
            if (!navigator.onLine) { stop(); removeSave(label.id); throw failure; }
        }
        if (cacheScope() !== scope) { stop(); throw new Error('The signed-in account changed. Please reopen this form.'); }
        writing = true;
        let server: Promise<void>;
        try { server = action(); }
        catch (failure) { stop(); removeSave(label.id); throw failure; }
        const acknowledgement = server.then(() => {
            if (cacheScope() === scope) { removeSave(label.id); updateOfflineStatus({ completedAt: Date.now() }); }
            if (/^(patients|bills|payments|users|inventory|wards|priceList)\//.test(reference.path) && !reference.path.includes('/summaries/')) {
                markDataChanged();
                ['summary:', 'count:', 'aggregate:'].forEach(prefix => invalidateReads(prefix));
                void markDeviceViewsStale(scope).then(() => {
                    if (cacheScope() === scope) window.dispatchEvent(new Event('hospital-save-synced'));
                });
            }
        }, failure => {
            if (cacheScope() === scope) {
                removeSave(label.id);
                updateOfflineStatus({ error: `Upload failed. Please review your last save: ${failure.message || failure}` });
            }
            throw failure;
        });
        void acknowledgement.catch(() => {});
        // Identical edits to a document already pending may not emit a new event.
        // This cache read is queued after the write and checks the SDK's local state.
        const timer = setTimeout(() => {
            reference.get({ source: 'cache' }).then(snapshot => {
                if (snapshot.metadata.hasPendingWrites) resolveLocal();
            }).catch(() => {});
        }, 300);
        const timeout = setTimeout(() => rejectLocal(new Error('Could not confirm this save on the device. Check the pending upload notice before retrying.')), 10_000);
        try {
            if (!durable) await acknowledgement;
            else if (!navigator.onLine) await Promise.race([local, acknowledgement]);
            else {
                // Prefer immediate server validation; slow connections still allow
                // capture once the SDK confirms a durable local mutation.
                await Promise.race([acknowledgement, local.then(() => new Promise<void>(resolve => setTimeout(resolve, 1200)))]);
            }
        } finally { stop(); clearTimeout(timer); clearTimeout(timeout); }
    }
    function wrap<T extends object>(target: T): T {
        if (wrappers.has(target)) return wrappers.get(target);
        const proxy = new Proxy(target, {
            get(object: any, property) {
                const value = object[property];
                if (typeof value !== 'function') {
                    if (value && typeof value === 'object' && ['parent', 'firestore'].includes(String(property))) return wrap(value);
                    return value;
                }
                if (property === 'batch') return () => {
                    const batch = object.batch();
                    let first: firebase.firestore.DocumentReference | undefined;
                    const batchProxy = new Proxy(batch, { get(batchObject: any, method) {
                        if (method === 'commit') return () => save(() => batchObject.commit(), first);
                        if (['set', 'update', 'delete'].includes(String(method))) return (...args: any[]) => {
                            const reference = unwrap(args[0]);
                            first ||= reference;
                            batchObject[method](reference, ...args.slice(1));
                            return batchProxy;
                        };
                        return typeof batchObject[method] === 'function' ? batchObject[method].bind(batchObject) : batchObject[method];
                    } });
                    return batchProxy;
                };
                if (['set', 'update', 'delete'].includes(String(property)) && object.path && object.collection) {
                    return (...args: any[]) => save(() => value.apply(object, args), object);
                }
                if (property === 'add') return async (data: any) => {
                    const reference = object.doc();
                    await save(() => reference.set(data), reference);
                    return wrap(reference);
                };
                if (property === 'runTransaction') return (...args: any[]) => {
                    if (!navigator.onLine) return Promise.reject(new Error('This operation needs an internet connection. Connect to the internet before submitting.'));
                    return value.apply(object, args);
                };
                if (property === 'get') return (...args: any[]) => {
                    const finish = args[0]?.source === 'cache' ? () => {} : beginRefresh();
                    return value.apply(object, args).finally(finish);
                };
                if (property === 'onSnapshot') return (...args: any[]) => {
                    const finish = beginRefresh();
                    const options = args[0] && typeof args[0] === 'object' && 'includeMetadataChanges' in args[0] ? args.shift() : {};
                    const [next, error, complete] = args;
                    const observer = typeof next === 'function' ? { next, error, complete } : next;
                    const stop = value.call(object, { ...options, includeMetadataChanges: true }, {
                        next: (snapshot: any) => {
                            if (!snapshot.metadata.fromCache || !getOfflineStatus().online) finish();
                            observer?.next?.(snapshot);
                        },
                        error: (failure: any) => { finish(); observer?.error?.(failure); },
                        complete: () => { finish(); observer?.complete?.(); },
                    });
                    const offline = () => finish();
                    window.addEventListener('offline', offline);
                    return () => { finish(); stop(); window.removeEventListener('offline', offline); };
                };
                return (...args: any[]) => {
                    const result = value.apply(object, args.map(unwrap));
                    return result && typeof result === 'object' && !(result instanceof Promise) && (typeof result.get === 'function' || typeof result.doc === 'function') ? wrap(result) : result;
                };
            },
        });
        wrappers.set(target, proxy); originals.set(proxy, target);
        return proxy;
    }
    return wrap(raw);
}
