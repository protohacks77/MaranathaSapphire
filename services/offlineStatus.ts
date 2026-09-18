export interface OfflineStatus {
    online: boolean;
    refreshing: number;
    pending: number;
    persistence: 'starting' | 'ready' | 'unavailable';
    error: string;
    completedAt: number;
}
let status: OfflineStatus = {
    online: typeof navigator === 'undefined' || navigator.onLine,
    refreshing: 0, pending: 0, persistence: 'starting', error: '', completedAt: 0,
};
const listeners = new Set<() => void>();
export const getOfflineStatus = () => status;
export const subscribeOfflineStatus = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function updateOfflineStatus(change: Partial<OfflineStatus>) {
    status = { ...status, ...change };
    listeners.forEach(listener => listener());
}
export function beginRefresh() {
    if (!status.online) return () => {};
    updateOfflineStatus({ refreshing: status.refreshing + 1 });
    let finished = false;
    return () => {
        if (finished) return;
        finished = true;
        const refreshing = Math.max(0, status.refreshing - 1);
        updateOfflineStatus({ refreshing, completedAt: refreshing === 0 ? Date.now() : status.completedAt });
    };
}

let lastDataChangeAt = 0;
export const getLastDataChangeAt = () => lastDataChangeAt;
export function markDataChanged() { lastDataChangeAt = Date.now(); }
