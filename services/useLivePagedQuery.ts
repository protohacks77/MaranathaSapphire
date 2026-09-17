import { firestoreReadError } from './firestoreReadError';
import { useCallback, useEffect, useRef, useState } from 'react';
import firebase from 'firebase/compat/app';
import { PAGE_SIZE } from './lowReadQueries';
import { cachedRead, invalidateReads } from './readCache';

// Only the newest page stays live. Historical pages are fetched explicitly.
export function useLivePagedQuery<T>(query: firebase.firestore.Query, key: string, enabled = true) {
    const [records, setRecords] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState('');
    const [indexUrl, setIndexUrl] = useState('');
    const [version, setVersion] = useState(0);
    const cursor = useRef<firebase.firestore.QueryDocumentSnapshot | null>(null);
    const firstIds = useRef(new Set<string>());
    const appended = useRef(false);
    const generation = useRef(0);
    const busy = useRef(false);
    useEffect(() => {
        const request = ++generation.current;
        cursor.current = null; firstIds.current.clear(); appended.current = false;
        busy.current = false; setRecords([]); setLoading(enabled); setLoadingMore(false); setError(''); setIndexUrl('');
        if (!enabled) return;
        return query.limit(PAGE_SIZE).onSnapshot(snapshot => {
            if (request !== generation.current) return;
            const values = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
            const previousIds = firstIds.current;
            const freshIds = new Set(snapshot.docs.map(doc => doc.id));
            firstIds.current = freshIds;
            setRecords(previous => [...values, ...previous.filter(value => !previousIds.has((value as any).id) && !freshIds.has((value as any).id))]);
            if (!appended.current) { cursor.current = snapshot.docs[snapshot.docs.length - 1] || null; setHasMore(snapshot.size === PAGE_SIZE); }
            setLoading(false);
        }, error => { if (request === generation.current) { const failure = firestoreReadError(error); setError(failure.message); setIndexUrl(failure.indexUrl); setLoading(false); } });
    }, [query, key, enabled, version]);
    const loadMore = useCallback(async () => {
        if (!enabled || busy.current || !cursor.current) return;
        const request = generation.current;
        busy.current = true; setLoadingMore(true); setError(''); setIndexUrl('');
        try {
            const snapshot = await cachedRead(`live-page:${key}:${cursor.current.id}`, () => query.startAfter(cursor.current!).limit(PAGE_SIZE).get());
            if (request !== generation.current) return;
            appended.current = true;
            const values = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
            setRecords(previous => [...new Map([...previous, ...values].map(value => [(value as any).id, value])).values()]);
            cursor.current = snapshot.docs[snapshot.docs.length - 1] || null; setHasMore(snapshot.size === PAGE_SIZE);
        } catch (error) { if (request === generation.current) { const failure = firestoreReadError(error); setError(failure.message); setIndexUrl(failure.indexUrl); } }
        finally { if (request === generation.current) { busy.current = false; setLoadingMore(false); } }
    }, [query, key, enabled]);
    const refresh = () => { invalidateReads(`live-page:${key}:`); setVersion(value => value + 1); };
    return { records, loading, loadingMore, hasMore, error, indexUrl, loadMore, refresh };
}
