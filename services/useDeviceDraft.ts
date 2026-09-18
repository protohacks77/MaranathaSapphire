import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { cacheScope, peekDeviceCache, readDeviceCache, writeDeviceCache } from './deviceCache';

// Keep entered registration details across reloads, scoped to the signed-in user.
export function useDeviceDraft<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
    const [value, update] = useState<T>(() => peekDeviceCache<T>(`draft:${key}`) || initial);
    const [ready, setReady] = useState(false);
    const edited = useRef(false);
    useEffect(() => {
        let cancelled = false;
        const scope = cacheScope();
        void readDeviceCache<T>(`draft:${key}`).then(saved => {
            if (cancelled || scope !== cacheScope()) return;
            if (saved !== undefined && !edited.current) update(saved);
            setReady(true);
        });
        return () => { cancelled = true; };
    }, [key]);
    useEffect(() => {
        if (!ready) return;
        // Store every change; IndexedDB transactions preserve write ordering.
        void writeDeviceCache(`draft:${key}`, value).catch(() => {});
    }, [key, value, ready]);
    const setValue: Dispatch<SetStateAction<T>> = next => { edited.current = true; update(next); };
    return [value, setValue];
}
