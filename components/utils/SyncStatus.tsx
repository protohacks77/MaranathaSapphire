import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle, CloudOff, AlertTriangle } from 'lucide-react';
import { getOfflineStatus, subscribeOfflineStatus, updateOfflineStatus } from '../../services/offlineStatus';
import LoadingSpinner from './LoadingSpinner';

export default function SyncStatus() {
    const status = useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus);
    const [showDone, setShowDone] = useState(false);
    useEffect(() => {
        if (!status.completedAt) return;
        setShowDone(true);
        const timer = setTimeout(() => setShowDone(false), 2200);
        return () => clearTimeout(timer);
    }, [status.completedAt]);
    const busy = status.refreshing > 0 || (status.online && status.pending > 0);
    const message = status.error || (status.persistence === 'unavailable'
        ? 'Device storage unavailable. Connect to the internet to save data.'
        : status.pending > 0
            ? status.online ? `Uploading ${status.pending} saved ${status.pending === 1 ? 'change' : 'changes'}…` : 'Saved on this device. Data will be uploaded once internet is back.'
            : !status.online ? 'Offline — showing saved data. New data will be uploaded once internet is back.'
                : busy ? 'Updating hospital data…' : showDone ? 'Done — data updated' : '');
    if (!message) return null;
    return <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[10001] max-w-[calc(100vw-2rem)] w-max flex items-center gap-3 rounded-xl border border-gray-700 bg-[#161B22]/95 px-4 py-2 shadow-xl no-print" role="status" aria-live="polite" aria-atomic="true">
        {status.error || status.persistence === 'unavailable' ? <AlertTriangle size={20} className="text-amber-400 shrink-0" /> : busy ? <div className="shrink-0 scale-75 -my-3 -mx-3"><LoadingSpinner /></div> : !status.online ? <CloudOff size={20} className="text-gray-400 shrink-0" /> : <CheckCircle size={20} className="text-green-400 shrink-0" />}
        <span className="text-sm text-gray-100">{message}</span>
        {status.error && <button className="text-gray-400 hover:text-white" aria-label="Dismiss sync error" onClick={() => updateOfflineStatus({ error: '' })}>×</button>}
    </div>;
}
