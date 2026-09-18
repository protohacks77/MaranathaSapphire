import firebase from 'firebase/compat/app';
import { useLivePagedQuery } from './useLivePagedQuery';

// All list pages share cache-first rendering and incremental live updates.
export function usePagedQuery<T>(query: firebase.firestore.Query, key: string, enabled = true) {
    return useLivePagedQuery<T>(query, key, enabled);
}
