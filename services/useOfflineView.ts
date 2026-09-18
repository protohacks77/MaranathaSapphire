import { useEffect, useState, useRef } from 'react';
import { cacheScope, peekDeviceCache, readDeviceCache, writeDeviceCache } from './deviceCache';
import { beginRefresh, getOfflineStatus, updateOfflineStatus } from './offlineStatus';

type View<T> = { value: T; fetchedAt: number };
const requests = new Map<string, Promise<unknown>>();
// Loaders must return display data (plain objects/arrays), never SDK snapshots.
export function useOfflineView<T>(key: string, loader: () => Promise<T>, ttl = 60_000, enabled = true) {
    const initial = peekDeviceCache<View<T>>(`view:${key}`);
    const [data, setData] = useState<T | undefined>(initial?.value);
    const [loading, setLoading] = useState(!initial);
    const [error, setError] = useState('');
    const [version, setVersion] = useState(0);
    const loaderRef = useRef(loader);
    loaderRef.current = loader;
    useEffect(() => {
        if (!enabled) { setLoading(false); return; }
        let cancelled = false;
        const scope = cacheScope();
        const storageKey = `view:${key}`;
        const current = peekDeviceCache<View<T>>(storageKey);
        setData(current?.value); setLoading(!current); setError('');
        async function load(force = false) {
            const cached = await readDeviceCache<View<T>>(storageKey);
            if (cancelled || cacheScope() !== scope) return;
            if (cached) { setData(cached.value); setLoading(false); }
            if (!navigator.onLine) {
                if (!cached) {
                    const message = 'This page has no saved data on this device. Connect to the internet to load it.';
                    setError(message); setLoading(false); updateOfflineStatus({ error: message });
                }
                return;
            }
            if (!force && cached && Date.now() - cached.fetchedAt < ttl) return;
            const finish = beginRefresh();
            const requestKey = `${scope}:${key}`;
            try {
                let request = requests.get(requestKey) as Promise<T> | undefined;
                if (!request) {
                    request = loaderRef.current();
                    requests.set(requestKey, request);
                    const running = request;
                    void running.finally(() => { if (requests.get(requestKey) === running) requests.delete(requestKey); }).catch(() => {});
                }
                const value = await request;
                if (cancelled || cacheScope() !== scope) return;
                setData(value); setError('');
                if (getOfflineStatus().error.startsWith('This page has no saved data')) updateOfflineStatus({ error: '' });
                await writeDeviceCache(storageKey, { value, fetchedAt: Date.now() }).catch(() => {});
            } catch (failure) {
                if (!cancelled) setError(cached ? 'Showing saved data. Refresh could not complete.' : !navigator.onLine ? 'This data has not been saved on this device yet.' : 'Could not load data. Please retry.');
            } finally { finish(); if (!cancelled) setLoading(false); }
        }
        void load(version > 0);
        const onSaved = () => { if (navigator.onLine) void load(true); };
        window.addEventListener('hospital-save-synced', onSaved);
        const reconnect = () => { void load(true); };
        window.addEventListener('online', reconnect);
        const interval = window.setInterval(() => { if (navigator.onLine) void load(); }, ttl);
        return () => { cancelled = true; window.removeEventListener('online', reconnect); window.clearInterval(interval); window.removeEventListener('hospital-save-synced', onSaved); };
    }, [key, version, ttl, enabled]);
    return { data, loading, error, refresh: () => setVersion(value => value + 1) };
}
