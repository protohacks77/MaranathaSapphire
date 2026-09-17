import DatabaseIndexLink from './DatabaseIndexLink';
import React from 'react';
const LoadMore: React.FC<{ hasMore: boolean; loading: boolean; error?: string; indexUrl?: string; onLoad: () => void; onRetry: () => void }> = ({ hasMore, loading, error, indexUrl, onLoad, onRetry }) => (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {error && <><p role="alert" className="text-sm text-red-400">{error}</p><DatabaseIndexLink url={indexUrl} /><button onClick={onRetry} className="text-sm text-sky-400">Retry</button></>}
        {hasMore && !error && <button onClick={onLoad} disabled={loading} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50">{loading ? 'Loading…' : 'Load More'}</button>}
    </div>
);
export default LoadMore;
