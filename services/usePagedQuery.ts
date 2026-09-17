import { firestoreReadError } from './firestoreReadError';
import { useEffect, useRef, useState, useCallback } from 'react';
import firebase from 'firebase/compat/app';
import { PAGE_SIZE } from './lowReadQueries';
import { cachedRead, invalidateReads } from './readCache';

export function usePagedQuery<T>(query: firebase.firestore.Query, key: string, enabled = true) {
    const [records, setRecords] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState('');
    const [indexUrl, setIndexUrl] = useState('');
    const cursor = useRef<firebase.firestore.QueryDocumentSnapshot | null>(null);
    const generation = useRef(0);
    const busy = useRef(false);
    const load = useCallback(async (append = false, force = false) => {
        if (!enabled || (append && busy.current)) return;
        const request = append ? generation.current : ++generation.current;
        busy.current = true;
        append ? setLoadingMore(true) : setLoading(true);
        setError(''); setIndexUrl('');
        try {
            const cacheKey = `page:${key}:${append ? cursor.current?.id || 'first' : 'first'}`;
            if (force) invalidateReads(`page:${key}:`);
            const page = append && cursor.current ? query.startAfter(cursor.current) : query;
            const snapshot = await cachedRead(cacheKey, () => page.limit(PAGE_SIZE).get());
            if (request !== generation.current) return;
            const values = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
            setRecords(previous => append ? [...new Map([...previous, ...values].map(value => [(value as any).id, value])).values()] : values);
            cursor.current = snapshot.docs[snapshot.docs.length - 1] || null;
            setHasMore(snapshot.size === PAGE_SIZE);
        } catch (error) { if (request === generation.current) { const failure = firestoreReadError(error); setError(failure.message); setIndexUrl(failure.indexUrl); } }
        finally { if (request === generation.current) { setLoading(false); setLoadingMore(false); busy.current = false; } }
    }, [query, key, enabled]);
    useEffect(() => { setRecords([]); cursor.current = null; load(); return () => { generation.current++; busy.current = false; }; }, [load]);
    return { records, loading, loadingMore, hasMore, error, indexUrl, loadMore: () => load(true), refresh: () => load(false, true) };
}
